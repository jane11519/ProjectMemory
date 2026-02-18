import type { EmbeddingPort, EmbeddingResult } from '../../domain/ports/EmbeddingPort.js';

/**
 * 將大量文字拆成批次送入 EmbeddingPort
 * 處理 rate limiting 與批次大小限制
 */
export class EmbeddingBatcher {
  constructor(
    private readonly provider: EmbeddingPort,
    private readonly maxBatchSize: number = 100,
  ) {}

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const results: EmbeddingResult[] = [];
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const batchResults = await this.provider.embed(batch);
      results.push(...batchResults);
    }
    return results;
  }
}
