/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

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

    this.logger.log('🔧 Inicializando provedores de IA...');
    this.logger.log(
      `📋 OPENAI_API_KEY: ${openAiKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );
    this.logger.log(
      `📋 GEMINI_API_KEY: ${geminiKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );
    this.logger.log(
      `📋 CLAUDE_API_KEY: ${claudeKey ? '✅ Configurada' : '❌ Não configurada'}`,
    );

    if (openAiKey && openAiKey !== '') {
      this.providers.push(new OpenAiProvider(openAiKey));
      this.logger.log('✅ OpenAI provider configurado');
    }
    if (geminiKey && geminiKey !== '') {
      this.providers.push(new GeminiProvider(geminiKey));
      this.logger.log('✅ Gemini provider configurado');
    }
    if (claudeKey && claudeKey !== '') {
      this.providers.push(new ClaudeProvider(claudeKey));
      this.logger.log('✅ Claude provider configurado');
    }

    if (this.providers.length === 0) {
      this.logger.error(
        '❌ Nenhum provedor de IA foi configurado. Certifique-se de configurar as chaves no arquivo .env.',
      );
    } else {
      this.logger.log(
        `🎉 Total de provedores configurados: ${this.providers.length}`,
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

    this.logger.log('🚀 Iniciando extração de dados...');
    this.logger.log(`📋 publicUrl: ${publicUrl || 'não fornecida'}`);
    this.logger.log(`📋 filePath: ${filePath || 'não fornecido'}`);
    this.logger.log(`📋 mimeType: ${mimeType || 'não fornecido'}`);
    this.logger.log(
      `📋 rawText: ${rawText ? `${rawText.length} caracteres` : 'não fornecido'}`,
    );

    // Se não temos o texto mas temos o arquivo local, usa OCR direto
    if (!text && filePath && mimeType) {
      this.logger.log(`📄 Processando arquivo local via OCR: ${filePath}`);
      text = await this.ocrService.extractTextFromAnyFile(filePath, mimeType);
      this.logger.log(`📝 OCR resultou em ${text.length} caracteres`);
    }
    // Caso contrário, baixa da URL se não tiver o texto
    else if (!text && publicUrl) {
      this.logger.log(`🌐 Baixando documento da URL: ${publicUrl}`);
      try {
        const axios = await import('axios');
        const response = await axios.default.get(publicUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        this.logger.log(`✅ Download concluído: ${response.data.length} bytes`);

        const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, response.data);
        this.logger.log(`💾 Arquivo salvo temporariamente: ${tempPath}`);

        text = await this.ocrService.extractTextFromPDF(tempPath);
        this.logger.log(`📝 OCR resultou em ${text.length} caracteres`);

        fs.unlinkSync(tempPath);
        this.logger.log(`🗑️ Arquivo temporário removido`);
      } catch (error: any) {
        this.logger.error(`❌ Erro ao baixar documento: ${error.message}`);
        throw error;
      }
    }

    // Log do texto extraído (primeiros 500 caracteres)
    if (text && text.length > 0) {
      this.logger.log(`📝 Texto extraído (primeiros 500 caracteres):`);
      this.logger.log(`--- INÍCIO DO TEXTO ---`);
      this.logger.log(text.substring(0, 500));
      this.logger.log(`--- FIM DO TEXTO ---`);
      this.logger.log(`📊 Tamanho total do texto: ${text.length} caracteres`);
    } else {
      this.logger.warn(`⚠️ Nenhum texto foi extraído do documento!`);
    }

    // Limitar o tamanho do texto para não ultrapassar limites da IA
    const MAX_CHARS = 25000;
    if (text.length > MAX_CHARS) {
      this.logger.warn(
        `⚠️ Texto truncado de ${text.length} para ${MAX_CHARS} caracteres`,
      );
      text = text.substring(0, MAX_CHARS);
    }

    if (!text || text.length < 50) {
      this.logger.warn(
        '⚠️ Texto extraído muito curto - possivelmente documento escaneado ou sem texto',
      );
      return {
        productName: null,
        quantity: null,
        unit: null,
        co2Emitted: null,
        supplier: null,
        confidence: 10,
        error:
          'Texto não identificado ou muito curto. Verifique se o documento é legível.',
      };
    }

    this.logger.log(`🤖 Enviando texto para IA (${text.length} caracteres)...`);

    let lastError: any = null;

    for (const provider of this.providers) {
      try {
        this.logger.log(`🔄 Tentando extração via provedor: ${provider.name}`);
        const startTime = Date.now();
        const result = await provider.extractFromText(text);
        const duration = Date.now() - startTime;

        this.logger.log(`✅ IA (${provider.name}) extraiu em ${duration}ms`);
        this.logger.log(`📊 Resultado: Confiança=${result.confidence}%`);
        this.logger.log(
          `📦 Produto: ${result.productName || 'não encontrado'}`,
        );
        this.logger.log(
          `📦 Quantidade: ${result.quantity || 'não encontrado'} ${result.unit || ''}`,
        );
        this.logger.log(`🌿 CO₂: ${result.co2Emitted || 'não encontrado'} kg`);
        this.logger.log(
          `🏭 Fornecedor: ${result.supplier || 'não encontrado'}`,
        );

        return result;
      } catch (error: any) {
        let errMsg = error.message || error;
        if (error.response?.data) {
          errMsg += ` - Detalhes: ${JSON.stringify(error.response.data)}`;
        }
        this.logger.warn(
          `⚠️ Falha ao extrair usando ${provider.name}: ${errMsg}`,
        );
        lastError = error;
      }
    }

    this.logger.error('❌ Todos os provedores de IA falharam na extração.');
    return {
      productName: null,
      quantity: null,
      unit: null,
      co2Emitted: null,
      supplier: null,
      confidence: 10,
      error: `Todos os provedores falharam. Último erro: ${lastError?.message || lastError}`,
    };
  }

  /**
   * Retorna a lista de provedores configurados
   */
  getAvailableProviders(): string[] {
    return this.providers.map((p) => p.name);
  }

  /**
   * Verifica se há pelo menos um provedor configurado
   */
  hasProviders(): boolean {
    return this.providers.length > 0;
  }
}
