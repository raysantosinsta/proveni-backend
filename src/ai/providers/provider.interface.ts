export interface AiExtractionResult {
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  co2Emitted: number | null;
  co2Unit: 'kg' | 'ton' | null;
  supplier: string | null;
  confidence: number;
  error?: string;
}

export interface IAiProvider {
  readonly name: string;
  extractFromText(text: string): Promise<AiExtractionResult>;
}

export function getExtractionPrompt(text: string): string {
  return `
    Extraia as seguintes informações do texto abaixo:

    - Produto: nome do produto/material
    - Quantidade: número (ex: 5000, 10.5)
    - Unidade: kg, ton, un, m³
    - CO₂ Emitido: número em kg ou toneladas (se encontrar)
    - Fornecedor: nome da empresa que emitiu o documento

    Responda APENAS com JSON válido:
    {
      "productName": "string ou null",
      "quantity": number ou null,
      "unit": "string ou null",
      "co2Emitted": number ou null,
      "co2Unit": "kg" ou "ton" ou null,
      "supplier": "string ou null",
      "confidence": number (0-100)
    }

    Texto: ${text.substring(0, 4000)}
  `;
}
