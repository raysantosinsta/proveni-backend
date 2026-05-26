/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * POST /documents/upload
   * Recebe o arquivo via multipart/form-data + batchId, supplierId, docType no body
   */
  @Post('upload')
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
    return this.documentsService.upload(file, dto, user.id);
  }

  /**
   * GET /documents?batchId=xxx
   * Lista todos os documentos, opcionalmente filtrando por lote
   */
  @Get()
  findAll(@Body('batchId') batchId?: string) {
    return this.documentsService.findAll(batchId);
  }

  /**
   * GET /documents/:id
   * Retorna os detalhes de um documento específico
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  /**
   * DELETE /documents/:id
   * Remove um documento do banco de dados
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  @Post(':id/extract-ai')
  async extractAi(
    @Param('id') documentId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Usuário ${user.id} solicita extração IA para documento ${documentId}`,
    );
    const result = await this.documentsService.extractDataWithAi(documentId, user.id);
    return { message: 'Extração concluída', data: result };
  }

  @Post(':id/validate')
  async validate(
    @Param('id') documentId: string,
    @Body('extractedData') extractedData: any,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `Usuário ${user.id} valida documento ${documentId}`,
    );
    return this.documentsService.validate(documentId, extractedData, user.id);
  }
}
