/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import * as Tesseract from 'tesseract.js';
import { PDFParse } from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async extractTextFromPDF(filePath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    try {
      const data = await parser.getText();

      // Se o PDF já tem texto (não é escaneado)
      if (data.text && data.text.length > 100) {
        this.logger.log(`PDF com texto nativo: ${data.text.length} caracteres`);
        return data.text;
      }
    } catch (error) {
      this.logger.error(`Erro ao extrair texto do PDF: ${error.message}`);
    } finally {
      await parser.destroy().catch((err) => {
        this.logger.error('Erro ao destruir parser PDF:', err);
      });
    }

    // Fallback: PDF escaneado → OCR
    this.logger.log('PDF escaneado detectado, aplicando OCR...');
    return this.extractTextFromImage(filePath);
  }

  async extractTextFromImage(filePath: string): Promise<string> {
    this.logger.log(`Aplicando OCR na imagem: ${path.basename(filePath)}`);

    const {
      data: { text },
    } = await Tesseract.recognize(filePath, 'por', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          this.logger.debug(`OCR: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    this.logger.log(`OCR concluído: ${text.length} caracteres`);
    return text;
  }

  async extractFromExcel(filePath: string): Promise<any[]> {
    const xlsxModule = (await import('xlsx')) as any;
    const XLSX = xlsxModule.readFile ? xlsxModule : xlsxModule.default;
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    this.logger.log(`Excel processado: ${data.length} linhas`);
    return data;
  }

  async extractTextFromAnyFile(
    filePath: string,
    mimeType: string,
  ): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    // PDF
    if (ext === '.pdf') {
      return this.extractTextFromPDF(filePath);
    }

    // Imagens
    if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff'].includes(ext)) {
      return this.extractTextFromImage(filePath);
    }

    // Excel
    if (['.xlsx', '.xls'].includes(ext)) {
      const data = await this.extractFromExcel(filePath);
      return JSON.stringify(data);
    }

    // TXT, CSV, XML
    if (['.txt', '.csv', '.xml'].includes(ext)) {
      return fs.readFileSync(filePath, 'utf-8');
    }

    this.logger.warn(`Tipo não suportado: ${mimeType}`);
    return '';
  }
}
