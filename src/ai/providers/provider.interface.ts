// providers/provider.interface.ts
export interface AiExtractionResult {
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  co2Emitted: number | null;
  supplier: string | null;
  confidence: number;
  error?: string;
}

export interface IAiProvider {
  name: string;
  extractFromText(text: string): Promise<AiExtractionResult>;
}

/**
 * Prompt para extração de documento único
 */
export function getExtractionPrompt(text: string): string {
  return `Você é um assistente especializado em análise de documentos.

Extraia APENAS as informações solicitadas do texto abaixo.

Responda SOMENTE com um JSON válido, sem texto adicional.

{
  "productName": "nome do produto (ex: Camisa, Polietileno, PET)",
  "quantity": quantidade como número (ex: 100, 50.5),
  "unit": "unidade de medida (kg, L, un, t, m, etc)",
  "co2Emitted": "emissão de CO₂ em kg (apenas o número)",
  "supplier": "nome do fornecedor ou empresa",
  "confidence": "número de 0 a 100 indicando sua confiança"
}

Se não encontrar uma informação, use null.

Texto do documento:
${text.substring(0, 8000)}`;
}
