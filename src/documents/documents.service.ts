/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ocr/ocr.service';
import { AiService } from '../ai/ai.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { DocumentStatus, DocumentType, Batch } from '@prisma/client';
import { UploadDocumentDto } from './dto/upload-document.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import axios from 'axios';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: OcrService,
    private readonly ai: AiService,
    private readonly ipfs: IpfsService,
    private readonly blockchain: BlockchainService,
  ) {}

  /**
   * Find documents by supplier ID
   */
  async findBySupplier(supplierId: string) {
    return this.prisma.document.findMany({
      where: { supplierId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
      },
    });
  }

  /** -------------------------------------------------------------
   *  Upload de documento - Envia para IPFS/Pinata imediatamente
   *  ------------------------------------------------------------- */
  async upload(
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    uploadedById: string,
  ) {
    let filePath: string;

    // Salva o buffer em disco temporariamente
    const tempDir = path.resolve(process.cwd(), 'uploads', 'temp');
    await fs.promises.mkdir(tempDir, { recursive: true });
    const unique =
      Date.now() +
      '-' +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    filePath = path.join(tempDir, unique);
    await fs.promises.writeFile(filePath, file.buffer);

    // Validar se o lote existe (se fornecido)
    let batch: Batch | null = null;
    if (dto.batchId) {
      batch = await this.prisma.batch.findUnique({
        where: { batchId: dto.batchId },
      });
      if (!batch) {
        await fs.promises.unlink(filePath).catch(() => {});
        throw new NotFoundException(`Lote ${dto.batchId} não encontrado`);
      }
    }

    // Determinar o supplierId
    const uploader = await this.prisma.user.findUnique({
      where: { id: uploadedById },
    });
    if (!uploader) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw new BadRequestException('Usuário não encontrado');
    }

    const supplierId = dto.supplierId ?? uploader.companyId ?? batch?.companyId;

    if (!supplierId) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw new BadRequestException('Não foi possível determinar o fornecedor');
    }

    // Gerar hash SHA‑256 do arquivo
    const fileBuffer = await fs.promises.readFile(filePath);
    const documentHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    // Detectar tipo de documento
    const docType =
      dto.docType ?? this.inferDocType(file.mimetype, file.originalname);

    // 1️⃣ PRIMEIRO: Enviar para IPFS/Pinata
    this.logger.log(`Enviando arquivo para IPFS/Pinata...`);
    let ipfsHash: string;
    try {
      ipfsHash = await this.ipfs.uploadFile(filePath);
      this.logger.log(`Arquivo enviado para IPFS. Hash: ${ipfsHash}`);
    } catch (error: any) {
      this.logger.error(`Erro ao enviar para IPFS: ${error.message}`);
      await fs.promises.unlink(filePath).catch(() => {});
      throw new BadRequestException('Erro ao enviar arquivo para IPFS');
    }

    // 2️⃣ SEGUNDO: Extrair texto com OCR
    this.logger.log(`Extraindo texto do documento via OCR...`);
    let extractedText = '';
    try {
      extractedText = await this.ocr.extractTextFromAnyFile(
        filePath,
        file.mimetype,
      );
      this.logger.log(`OCR concluído: ${extractedText.length} caracteres`);
    } catch (error: any) {
      this.logger.warn(`Erro no OCR: ${error.message}`);
      extractedText = '';
    }

    // 3️⃣ TERCEIRO: Criar registro no banco
    const document = await this.prisma.document.create({
      data: {
        batchId: batch?.id || undefined,
        supplierId,
        filename: file.originalname,
        originalName: file.originalname,
        fileSize: BigInt(file.size),
        mimeType: file.mimetype,
        filePath: '',
        ipfsHash: ipfsHash || null,
        documentHash,
        docType,
        extractedData: { text: extractedText },
        processingStatus: DocumentStatus.PENDING,
        uploadedById,
      },
    });

    // Limpar arquivo temporário
    await fs.promises.unlink(filePath).catch(() => {});

    this.logger.log(
      `Documento ${document.id} criado com IPFS hash: ${ipfsHash}`,
    );

    return {
      id: document.id,
      ipfsHash,
      status: DocumentStatus.PENDING,
      message: 'Documento enviado para IPFS e aguardando processamento',
    };
  }

  /** -------------------------------------------------------------
   *  Extrair dados com IA - Busca o arquivo do IPFS pelo hash
   *  ------------------------------------------------------------- */
  async extractDataWithAi(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    if (!doc.ipfsHash) {
      throw new BadRequestException('Documento não possui hash IPFS');
    }

    if (doc.processingStatus === DocumentStatus.EXTRACTED) {
      return doc.extractedData;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: DocumentStatus.PROCESSING },
    });

    try {
      const ipfsUrl = this.ipfs.getPublicUrl(doc.ipfsHash);
      this.logger.log(`Baixando arquivo do IPFS: ${ipfsUrl}`);

      const response = await axios.get(ipfsUrl, {
        responseType: 'arraybuffer',
      });

      this.logger.log(`✅ Arquivo baixado: ${response.data.length} bytes`);
      this.logger.log(`📄 Tipo do arquivo: ${doc.mimeType}`);

      const tempDir = path.resolve(os.tmpdir(), 'proveni-ai');
      const debugPath = path.join(os.tmpdir(), `debug_${documentId}.pdf`);

      await fs.promises.mkdir(tempDir, { recursive: true });
      this.logger.log(`🔍 Arquivo salvo para debug: ${debugPath}`);
      const tempFilePath = path.join(tempDir, `${documentId}_${Date.now()}`);
      await fs.promises.writeFile(tempFilePath, response.data);

      let extractedText = (doc.extractedData as any)?.text || '';

      if (!extractedText) {
        this.logger.log(`Extraindo texto do arquivo baixado...`);
        extractedText = await this.ocr.extractTextFromAnyFile(
          tempFilePath,
          doc.mimeType || 'application/octet-stream',
        );
      }

      if (!extractedText || extractedText.length < 50) {
        throw new BadRequestException(
          'Não foi possível extrair texto do documento',
        );
      }

      this.logger.log(
        `Enviando texto para IA (${extractedText.length} caracteres)...`,
      );
      const extractedData = await this.ai.extractFromDocument(
        '',
        undefined,
        undefined,
        extractedText,
      );

      const updatedDoc = await this.prisma.document.update({
        where: { id: documentId },
        data: {
          extractedData: {
            text: extractedText,
            ...extractedData,
          },
          processingStatus: DocumentStatus.EXTRACTED,
          processedAt: new Date(),
          confidenceScore: extractedData.confidence || 70,
        },
      });

      await fs.promises.unlink(tempFilePath).catch(() => {});

      this.logger.log(`Extraído com sucesso para documento ${documentId}`);

      return {
        ...extractedData,
        confidence: extractedData.confidence || 70,
      };
    } catch (error: any) {
      this.logger.error(`Erro na extração: ${error.message}`);

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: DocumentStatus.NEEDS_REVIEW,
          extractedData: {
            error: error.message,
            ...((doc.extractedData as any) || {}),
          },
        },
      });

      throw new BadRequestException(`Erro na extração: ${error.message}`);
    }
  }

  /** -------------------------------------------------------------
   *  Validar documento (Operador) - CORRIGIDO
   *  ------------------------------------------------------------- */
  async validate(documentId: string, extractedData: any, validatorId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    if (doc.processingStatus !== DocumentStatus.EXTRACTED) {
      throw new BadRequestException('Documento não está pronto para validação');
    }

    let batchIdToLink = doc.batchId;

    // Se o documento não tem lote associado, cria um novo automaticamente
    if (!batchIdToLink) {
      const validator = await this.prisma.user.findUnique({
        where: { id: validatorId },
      });
      if (!validator || !validator.companyId) {
        throw new BadRequestException(
          'Validador não possui empresa associada para criar lote',
        );
      }

      // Gera um batchId único
      let finalBatchIdStr: string;
      let existingBatch: Batch | null;
      let attempts = 0;
      const maxAttempts = 5;

      do {
        // Se o operador forneceu um batchId, tenta usar ele
        if (extractedData.batchId && attempts === 0) {
          finalBatchIdStr = extractedData.batchId
            .toUpperCase()
            .replace(/\s/g, '-');
        } else {
          // Gera um ID único com timestamp e random
          const timestamp = Date.now();
          const random = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();
          finalBatchIdStr = `AUTO-${timestamp}-${random}`;
        }

        // Verifica se o batchId já existe
        existingBatch = await this.prisma.batch.findUnique({
          where: { batchId: finalBatchIdStr },
        });

        attempts++;
      } while (existingBatch && attempts < maxAttempts);

      if (existingBatch) {
        throw new BadRequestException(
          'Não foi possível gerar um ID único para o lote. Tente novamente.',
        );
      }

      this.logger.log(`Criando novo lote com ID: ${finalBatchIdStr}`);

      // Cria o lote pertencente à empresa do operador
      const newBatch = await this.prisma.batch.create({
        data: {
          batchId: finalBatchIdStr,
          productName: extractedData.productName || doc.filename,
          quantity: extractedData.quantity
            ? parseFloat(extractedData.quantity)
            : null,
          unit: extractedData.unit || null,
          companyId: validator.companyId,
          status: 'DRAFT',
          isCompliant: true,
          co2Emitted: extractedData.co2Emitted
            ? parseFloat(extractedData.co2Emitted)
            : 0,
        },
      });
      batchIdToLink = newBatch.id;

      this.logger.log(
        `Lote criado com sucesso: ${finalBatchIdStr} (ID: ${newBatch.id})`,
      );
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        batchId: batchIdToLink,
        isValidated: true,
        validatedById: validatorId,
        processingStatus: DocumentStatus.VALIDATED,
        extractedData: {
          ...(doc.extractedData as any),
          ...extractedData,
          validatedBy: validatorId,
          validatedAt: new Date().toISOString(),
        },
      },
    });

    // Atualizar BatchSupplier com os dados validados
    if (batchIdToLink && doc.supplierId) {
      await this.prisma.batchSupplier.upsert({
        where: {
          batchId_supplierId: {
            batchId: batchIdToLink,
            supplierId: doc.supplierId,
          },
        },
        update: {
          co2Emitted: extractedData.co2Emitted
            ? parseFloat(extractedData.co2Emitted)
            : 0,
          productName: extractedData.productName || doc.filename,
          documentId: doc.id,
        },
        create: {
          batchId: batchIdToLink,
          supplierId: doc.supplierId,
          co2Emitted: extractedData.co2Emitted
            ? parseFloat(extractedData.co2Emitted)
            : 0,
          productName: extractedData.productName || doc.filename,
          documentId: doc.id,
        },
      });
    }

    return updated;
  }

  /** -------------------------------------------------------------
   *  Registrar na Blockchain (Especialista)
   *  ------------------------------------------------------------- */
  async registerOnBlockchain(
    documentId: string,
    specialistId: string,
    notes?: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { batch: { select: { batchId: true } } },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    if (doc.processingStatus !== DocumentStatus.VALIDATED) {
      throw new BadRequestException('Documento precisa ser validado primeiro');
    }

    if (!doc.batch?.batchId) {
      throw new BadRequestException(
        'Documento não está associado a nenhum lote',
      );
    }

    this.logger.log(
      `Chamando contrato blockchain para lote ${doc.batch.batchId} via documento ${documentId}...`,
    );

    let blockchainTxHash: string;
    try {
      const result = await this.blockchain.registerBatch(doc.batch.batchId);
      blockchainTxHash = result.txHash;
      this.logger.log(`Transação confirmada: ${blockchainTxHash}`);
    } catch (error: any) {
      this.logger.error(`Erro ao registrar na blockchain: ${error.message}`);
      throw new BadRequestException(
        `Falha ao registrar na blockchain: ${error.message}`,
      );
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: DocumentStatus.ON_CHAIN,
        extractedData: {
          ...(doc.extractedData as any),
          blockchainRegisteredAt: new Date().toISOString(),
          blockchainTxHash,
          specialistNotes: notes,
          registeredBy: specialistId,
        },
      },
    });

    return updated;
  }

  /** -------------------------------------------------------------
   *  Rejeitar documento (Especialista)
   *  ------------------------------------------------------------- */
  async rejectDocument(
    documentId: string,
    specialistId: string,
    reason: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: DocumentStatus.REJECTED,
        validationNotes: reason,
        extractedData: {
          ...(doc.extractedData as any),
          rejectedAt: new Date().toISOString(),
          rejectedBy: specialistId,
          rejectionReason: reason,
        },
      },
    });

    return updated;
  }

  /** -------------------------------------------------------------
   *  Listar documentos pendentes de validação do especialista
   *  ------------------------------------------------------------- */
  async findAwaitingReview() {
    return this.prisma.document.findMany({
      where: {
        processingStatus: DocumentStatus.VALIDATED,
      },
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
        validatedBy: { select: { name: true } },
      },
    });
  }

  /** -------------------------------------------------------------
   *  Listar documentos por status
   *  ------------------------------------------------------------- */
  async findByStatus(status?: DocumentStatus | DocumentStatus[]) {
    const statusFilter = status
      ? Array.isArray(status)
        ? { in: status }
        : status
      : undefined;

    return this.prisma.document.findMany({
      where: statusFilter ? { processingStatus: statusFilter } : undefined,
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
        validatedBy: { select: { name: true } },
      },
    });
  }

  /** -------------------------------------------------------------
   *  Helpers existentes
   *  ------------------------------------------------------------- */
  async findAll(batchId?: string) {
    return this.prisma.document.findMany({
      where: batchId ? { batchId } : undefined,
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        docType: true,
        processingStatus: true,
        ipfsHash: true,
        documentHash: true,
        uploadedAt: true,
        processedAt: true,
        uploadedBy: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        supplier: { select: { name: true, cnpj: true } },
        batch: { select: { batchId: true, productName: true } },
        validatedBy: { select: { name: true } },
      },
    });
    if (!doc) throw new NotFoundException(`Documento ${id} não encontrado`);
    return doc;
  }

  async remove(id: string) {
    const doc = await this.findOne(id);
    await this.prisma.document.delete({ where: { id } });
    return { message: `Documento ${doc.originalName} removido com sucesso` };
  }

  private inferDocType(mimeType: string, filename: string): DocumentType {
    const ext = path.extname(filename).toLowerCase();
    if (mimeType === 'application/pdf' || ext === '.pdf')
      return DocumentType.INVOICE;
    if (mimeType.startsWith('image/')) return DocumentType.OTHER;
    if (['.xlsx', '.xls'].includes(ext)) return DocumentType.CARBON_REPORT;
    if (ext === '.xml') return DocumentType.INVOICE;
    return DocumentType.OTHER;
  }
}
