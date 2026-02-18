import { describe, it, expect, vi } from 'vitest';
import { EmbeddingBatcher } from '../../../src/infrastructure/embedding/EmbeddingBatcher.js';
import type { EmbeddingPort, EmbeddingResult } from '../../../src/domain/ports/EmbeddingPort.js';

describe('EmbeddingBatcher', () => {
  const mockProvider: EmbeddingPort = {
    providerId: 'mock',
    dimension: 4,
    modelId: 'mock-model',
    embed: vi.fn(async (texts: string[]): Promise<EmbeddingResult[]> =>
      texts.map(() => ({ vector: new Float32Array([0.1, 0.2, 0.3, 0.4]), tokensUsed: 10 }))
    ),
    embedOne: vi.fn(async () => ({ vector: new Float32Array([0.1, 0.2, 0.3, 0.4]), tokensUsed: 10 })),
    isHealthy: vi.fn(async () => true),
  };

  it('should split into batches respecting maxBatchSize', async () => {
    const batcher = new EmbeddingBatcher(mockProvider, 2);
    const texts = ['a', 'b', 'c', 'd', 'e'];
    const results = await batcher.embedBatch(texts);

    expect(results).toHaveLength(5);
    // 5 texts / batch size 2 = 3 calls (2+2+1)
    expect(mockProvider.embed).toHaveBeenCalledTimes(3);
  });

  it('should handle empty input', async () => {
    const batcher = new EmbeddingBatcher(mockProvider, 10);
    const results = await batcher.embedBatch([]);
    expect(results).toHaveLength(0);
  });
});
