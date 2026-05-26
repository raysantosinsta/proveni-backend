/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrService } from '../ocr/ocr.service';
import * as fs from 'fs';
import { IAiProvider } from './providers/provider.interface';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';

import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AiService {
  private providers: IAiProvider[] = [];
  private readonly logger = new Logger(AiService.name);

  constructor(
    private configService: ConfigService,
    private ocrService: OcrService,
  ) {
    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    const claudeKey = this.configService.get<string>('CLAUDE_API_KEY');

    if (openAiKey) {
      this.providers.push(new OpenAiProvider(openAiKey));
    }
    if (geminiKey) {
      this.providers.push(new GeminiProvider(geminiKey));
    }
    if (claudeKey) {
      this.providers.push(new ClaudeProvider(claudeKey));
    }

    if (this.providers.length === 0) {
      this.logger.error(
        'Nenhum provedor de IA foi configurado. Certifique-se de configurar as chaves no arquivo .env.',
      );
    }
  }

  async extractFromDocument(
    publicUrl: string,
    filePath?: string,
    mimeType?: string,
    rawText?: string,
  ): Promise<any> {
    let text = rawText || '';

    // Se não temos o texto mas temos o arquivo local, usa OCR direto
    if (!text && filePath && mimeType) {
      this.logger.log(`Processando arquivo local via OCR: ${filePath}`);
      text = await this.ocrService.extractTextFromAnyFile(filePath, mimeType);
    }
    // Caso contrário, baixa da URL se não tiver o texto
    else if (!text && publicUrl) {
      this.logger.log(`Baixando documento da URL: ${publicUrl}`);
      const axios = await import('axios');
      const response = await axios.default.get(publicUrl, {
        responseType: 'arraybuffer',
      });
      const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.pdf`);
      fs.writeFileSync(tempPath, response.data);
      text = await this.ocrService.extractTextFromPDF(tempPath);
      fs.unlinkSync(tempPath);
    }

    if (!text || text.length < 50) {
      this.logger.warn('Texto extraído muito curto');
      return {
        productName: null,
        quantity: null,
        unit: null,
        co2Emitted: null,
        supplier: null,
        confidence: 10,
        error: 'Texto não identificado',
      };
    }

    let lastError: any = null;

    for (const provider of this.providers) {
      try {
        this.logger.log(
          `Tentando extração de dados via provedor: ${provider.name}`,
        );
        const result = await provider.extractFromText(text);
        this.logger.log(
          `IA (${provider.name}) extraiu com sucesso: ${JSON.stringify(result)}`,
        );
        return result;
      } catch (error: any) {
        let errMsg = error.message || error;
        if (error.response?.data) {
          errMsg += ` - Detalhes: ${JSON.stringify(error.response.data)}`;
        }
        this.logger.warn(
          `Falha ao extrair dados usando o provedor ${provider.name}: ${errMsg}`,
        );
        lastError = error;
      }
    }

    this.logger.error('Todos os provedores de IA falharam na extração.');
    return {
      productName: null,
      quantity: null,
      unit: null,
      co2Emitted: null,
      supplier: null,
      confidence: 10,
      error: `Todos os provedores de IA falharam. Último erro: ${lastError?.message || lastError}`,
    };
  }
}
