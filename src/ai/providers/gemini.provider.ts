/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import axios from 'axios';
import { IAiProvider, AiExtractionResult, getExtractionPrompt } from './provider.interface';

export class GeminiProvider implements IAiProvider {
  readonly name = 'Gemini';
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey: string, timeoutMs = 10000) {
    this.apiKey = apiKey.replace(/['"]/g, '');
    this.timeoutMs = timeoutMs;
  }

  async extractFromText(text: string): Promise<AiExtractionResult> {
    if (!this.apiKey) {
      throw new Error('Chave de API do Gemini não configurada.');
    }

    const prompt = getExtractionPrompt(text);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.timeoutMs
      }
    );

    const candidates = response.data?.candidates;
    const rawText = candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Gemini retornou uma resposta vazia.');
    }

    const cleanedText = this.cleanJsonResponse(rawText);
    return JSON.parse(cleanedText) as AiExtractionResult;
  }

  private cleanJsonResponse(rawText: string): string {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return cleaned.trim();
  }
}
