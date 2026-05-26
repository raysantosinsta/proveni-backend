/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { DocumentStatus, DocumentType } from '@prisma/client';
import { UploadDocumentDto } from './dto/upload-document.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: OcrService,
    private readonly ai: AiService,
    private readonly ipfs: IpfsService,
  ) {}

  /** -------------------------------------------------------------
   *  Upload de documento (já existente) – mantido sem alterações
   *  ------------------------------------------------------------- */
  async upload(
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    uploadedById: string,
  ) {
    let filePath: string;
    // Se o Multer estiver usando memoryStorage, o arquivo vem em `file.buffer`
    if ((file as any).path) {
      filePath = (file as any).path;
    } else {
      // Salva o buffer em disco temporariamente para que o OCR/IPFS leiam
      const tempDir = path.resolve(process.cwd(), 'uploads', 'temp');
      await fs.promises.mkdir(tempDir, { recursive: true });
      const unique =
        Date.now() +
        '-' +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname);
      filePath = path.join(tempDir, unique);
      await fs.promises.writeFile(filePath, file.buffer);
    }

    // Validar se o lote existe (agora usando batchId corretamente)
    const batch = await this.prisma.batch.findUnique({
      where: { batchId: dto.batchId },
    });
    if (!batch) {
      fs.unlinkSync(filePath);
      throw new NotFoundException(`Lote ${dto.batchId} não encontrado`);
    }

    // Determinar o supplierId (fallback ao da empresa do uploader)
    const uploader = await this.prisma.user.findUnique({
      where: { id: uploadedById },
    });
    if (!uploader) {
      fs.unlinkSync(filePath);
      throw new BadRequestException('Usuário não encontrado');
    }
    const supplierId = dto.supplierId ?? uploader.companyId ?? batch.companyId;

    // Gerar hash SHA‑256 do arquivo para integridade
    const fileBuffer = fs.readFileSync(filePath);
    const documentHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    // Detectar tipo de documento caso não venha no DTO
    const docType =
      dto.docType ?? this.inferDocType(file.mimetype, file.originalname);

    // Criar registro inicial (status PROCESSING)
    const document = await this.prisma.document.create({
      data: {
        batchId: batch.id, // <-- FK correta
        supplierId,
        filename: file.originalname,
        originalName: file.originalname,
        fileSize: BigInt(file.size),
        mimeType: file.mimetype,
        filePath,
        documentHash,
        docType,
        processingStatus: DocumentStatus.PROCESSING,
        uploadedById,
      },
    });

    this.logger.log(
      `Documento criado: ${document.id} — iniciando processamento`,
    );
    void this.processDocument(document.id, filePath, file.mimetype);
    return {
      id: document.id,
      status: DocumentStatus.PROCESSING,
      message: 'Documento recebido e em processamento',
    };
  }

  /** -------------------------------------------------------------
   *  Processamento assíncrono (OCR → IPFS) – mantido sem alterações
   *  ------------------------------------------------------------- */
  private async processDocument(
    documentId: string,
    filePath: string,
    mimeType: string,
  ) {
    try {
      this.logger.log(`[${documentId}] Iniciando OCR...`);
      const extractedText = await this.ocr.extractTextFromAnyFile(
        filePath,
        mimeType,
      );
      this.logger.log(
        `[${documentId}] OCR concluído: ${extractedText.length} caracteres`,
      );

      this.logger.log(`[${documentId}] Enviando para IPFS...`);
      const ipfsHash = await this.ipfs.uploadFile(filePath);
      this.logger.log(`[${documentId}] IPFS hash: ${ipfsHash}`);

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          ipfsHash,
          extractedData: { text: extractedText },
          processingStatus: DocumentStatus.EXTRACTED,
          processedAt: new Date(),
        },
      });

      this.logger.log(`[${documentId}] Processamento concluído com sucesso`);
    } catch (error: any) {
      this.logger.error(
        `[${documentId}] Erro no processamento: ${error.message}`,
      );
      await this.prisma.document.update({
        where: { id: documentId },
        data: { processingStatus: DocumentStatus.NEEDS_REVIEW },
      });
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.debug(`[${documentId}] Arquivo temporário removido`);
      }
    }
  }

  async extractDataWithAi(documentId: string, userId: string) {
    // 1️⃣ Verifica existência do documento
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc)
      throw new NotFoundException(`Documento ${documentId} não encontrado`);

    // 2️⃣ Obtém o texto já extraído pelo OCR durante o upload (se houver)
    const existingData = doc.extractedData as any;
    const rawText = existingData?.text;

    let extracted: any;
    if (rawText) {
      this.logger.log(`Utilizando texto OCR pré-existente para o documento ${documentId}`);
      extracted = await this.ai.extractFromDocument('', undefined, undefined, rawText);
    } else {
      // Caso não tenha texto (fallback para ler arquivo local, se ainda existir)
      const filePath = doc.filePath;
      if (!filePath || !fs.existsSync(filePath)) {
        throw new BadRequestException('Texto OCR não encontrado e arquivo físico indisponível');
      }
      extracted = await this.ai.extractFromDocument('', filePath, doc.mimeType ?? '');
    }

    // 3️⃣ Persiste o resultado
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: {
          ...existingData,
          ...extracted
        },
        processingStatus: DocumentStatus.EXTRACTED,
        processedAt: new Date(),
      },
    });

    return extracted;
  }

  /** -------------------------------------------------------------
   *  Helpers (list, find, remove, inferDocType) – mantidos
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

  /** Infere o tipo do documento pelo mime ou extensão */
  private inferDocType(mimeType: string, filename: string): DocumentType {
    const ext = path.extname(filename).toLowerCase();
    if (mimeType === 'application/pdf' || ext === '.pdf')
      return DocumentType.INVOICE;
    if (mimeType.startsWith('image/')) return DocumentType.OTHER;
    if (['.xlsx', '.xls'].includes(ext)) return DocumentType.CARBON_REPORT;
    if (ext === '.xml') return DocumentType.INVOICE;
    return DocumentType.OTHER;
  }

  async validate(documentId: string, extractedData: any, validatorId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException(`Documento ${documentId} não encontrado`);
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        isValidated: true,
        validatedById: validatorId,
        processingStatus: DocumentStatus.VALIDATED,
        extractedData,
      },
    });

    // Se o documento estiver associado a um lote e a um fornecedor, cria/atualiza o BatchSupplier
    if (doc.batchId && doc.supplierId) {
      await this.prisma.batchSupplier.upsert({
        where: {
          batchId_supplierId: {
            batchId: doc.batchId,
            supplierId: doc.supplierId,
          },
        },
        update: {
          co2Emitted: extractedData.co2Emitted ? parseFloat(extractedData.co2Emitted) : 0,
          productName: extractedData.productName || doc.filename,
          documentId: doc.id,
        },
        create: {
          batchId: doc.batchId,
          supplierId: doc.supplierId,
          co2Emitted: extractedData.co2Emitted ? parseFloat(extractedData.co2Emitted) : 0,
          productName: extractedData.productName || doc.filename,
          documentId: doc.id,
        },
      });
    }

    return updated;
  }
}
