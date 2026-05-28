/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentStatus, Role } from '@prisma/client';
import { Roles } from 'src/common/guards/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * POST /documents/upload
   * Recebe o arquivo via multipart/form-data + batchId, supplierId, docType no body
   * FLUXO: SUPPLIER envia documento (único)
   */
  @Post('upload')
  @Roles(Role.SUPPLIER, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowedMime =
          /^(application\/pdf|image\/(png|jpeg|bmp|tiff)|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|text\/xml|application\/xml)$/;
        if (allowedMime.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type'), false);
        }
      },
    }),
  )
  async upload(
    @UploadedFile()
    file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `SUPPLIER ${user.id} enviando documento: ${file.originalname}`,
    );
    return this.documentsService.upload(file, dto, user.id);
  }

  /**
   * GET /documents?batchId=xxx&status=xxx&supplierId=xxx
   * Lista todos os documentos, opcionalmente filtrando por lote, status ou fornecedor
   */
  @Get()
  @Roles(
    Role.MANAGER,
    Role.ADMIN,
    Role.OPERATOR,
    Role.SPECIALIST,
    Role.SUPPLIER,
  )
  findAll(
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @CurrentUser() user?: any,
  ) {
    // Se for SUPPLIER, só pode ver seus próprios documentos
    if (user?.role === Role.SUPPLIER && user?.companyId) {
      return this.documentsService.findBySupplier(user.companyId);
    }

    if (
      supplierId &&
      (user?.role === Role.MANAGER ||
        user?.role === Role.ADMIN ||
        user?.role === Role.SPECIALIST)
    ) {
      return this.documentsService.findBySupplier(supplierId);
    }

    if (status) {
      const statuses = status.split(',') as DocumentStatus[];
      return this.documentsService.findByStatus(statuses);
    }

    return this.documentsService.findAll(batchId);
  }

  /**
   * GET /documents/pending
   * Retorna documentos pendentes de extração (OPERATOR e SPECIALIST)
   */
  @Get('pending')
  @Roles(Role.OPERATOR, Role.SPECIALIST)
  async findPending() {
    this.logger.log('Buscando documentos pendentes para extração');
    return this.documentsService.findByStatus([
      DocumentStatus.PENDING,
      DocumentStatus.PROCESSING,
      DocumentStatus.EXTRACTED,
    ]);
  }

  /**
   * GET /documents/awaiting-review
   * Retorna documentos aguardando revisão do SPECIALIST
   */
  @Get('awaiting-review')
  @Roles(Role.SPECIALIST)
  async findAwaitingReview() {
    this.logger.log('Buscando documentos aguardando revisão do especialista');
    return this.documentsService.findByStatus([DocumentStatus.VALIDATED]);
  }

  /**
   * GET /documents/:id
   * Retorna os detalhes de um documento específico
   */
  @Get(':id')
  @Roles(
    Role.MANAGER,
    Role.ADMIN,
    Role.OPERATOR,
    Role.SPECIALIST,
    Role.SUPPLIER,
  )
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  /**
   * POST /documents/:id/extract-ai
   * FLUXO: OPERATOR extrai dados com IA (documento individual)
   */
  @Post(':id/extract-ai')
  @Roles(Role.OPERATOR, Role.SPECIALIST)
  async extractAi(@Param('id') documentId: string, @CurrentUser() user: any) {
    this.logger.log(
      `OPERATOR ${user.id} solicitando extração IA para documento ${documentId}`,
    );
    const result = await this.documentsService.extractDataWithAi(
      documentId,
      user.id,
    );
    return {
      message: 'Extração concluída com sucesso',
      data: result,
    };
  }

  /**
   * POST /documents/:id/validate
   * FLUXO: OPERATOR valida os dados extraídos
   */
  @Post(':id/validate')
  @Roles(Role.OPERATOR, Role.SPECIALIST)
  async validate(
    @Param('id') documentId: string,
    @Body('extractedData') extractedData: any,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`OPERATOR ${user.id} validando documento ${documentId}`);
    const result = await this.documentsService.validate(
      documentId,
      extractedData,
      user.id,
    );
    return {
      message: 'Documento validado e enviado para especialista',
      data: result,
    };
  }

  /**
   * POST /documents/:id/blockchain/register
   * FLUXO: SPECIALIST aprova e registra na blockchain
   */
  @Post(':id/blockchain/register')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async registerOnBlockchain(
    @Param('id') documentId: string,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `SPECIALIST ${user.id} registrando documento ${documentId} na blockchain`,
    );
    const result = await this.documentsService.registerOnBlockchain(
      documentId,
      user.id,
      notes,
    );
    return {
      message: 'Documento registrado na blockchain com sucesso',
      data: result,
    };
  }

  /**
   * POST /documents/:id/reject
   * FLUXO: SPECIALIST rejeita o documento
   */
  @Post(':id/reject')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  async reject(
    @Param('id') documentId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `SPECIALIST ${user.id} rejeitando documento ${documentId}. Motivo: ${reason}`,
    );
    const result = await this.documentsService.rejectDocument(
      documentId,
      user.id,
      reason,
    );
    return {
      message: 'Documento rejeitado',
      data: result,
    };
  }

  /**
   * DELETE /documents/:id
   * Remove um documento do banco de dados
   */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
