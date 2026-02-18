import { describe, it, expect } from 'vitest';
import { HybridScore } from '../../../src/domain/value-objects/HybridScore.js';

describe('HybridScore', () => {
  it('should fuse lexical and vector scores with 70/30 weights', () => {
    const lexScores = new Map<number, number>([[1, 5.0], [2, 3.0]]);
    const vecScores = new Map<number, number>([[1, 0.8], [3, 0.9]]);

    const results = HybridScore.fuse(lexScores, vecScores, 0.7, 0.3);

    expect(results.length).toBeGreaterThan(0);
    // chunk 1 出現在兩路 → 應排最前
    expect(results[0].chunkId).toBe(1);
    // 結果降序排列
    for (let i = 1; i < results.length; i++) {
      expect(results[i].finalScore).toBeLessThanOrEqual(results[i - 1].finalScore);
    }
  });

  it('should handle empty lexical results (vector-only mode)', () => {
    const vecScores = new Map<number, number>([[1, 0.9], [2, 0.5]]);
    const results = HybridScore.fuse(null, vecScores, 0, 1.0);

    expect(results.length).toBe(2);
    expect(results[0].chunkId).toBe(1);
    expect(results[0].lexNorm).toBe(0);
  });

  it('should handle empty vector results (BM25-only mode)', () => {
    const lexScores = new Map<number, number>([[1, 10.0], [2, 5.0]]);
    const results = HybridScore.fuse(lexScores, null, 1.0, 0);

    expect(results.length).toBe(2);
    expect(results[0].chunkId).toBe(1);
    expect(results[0].vecNorm).toBe(0);
  });

  it('should return empty for no results', () => {
    const results = HybridScore.fuse(new Map(), new Map(), 0.7, 0.3);
    expect(results).toHaveLength(0);
  });

  it('should normalize scores per-query', () => {
    const lexScores = new Map<number, number>([[1, 100.0], [2, 50.0]]);
    const vecScores = new Map<number, number>([[1, 0.9], [2, 0.3]]);
    const results = HybridScore.fuse(lexScores, vecScores, 0.7, 0.3);

    // chunk 1: lexNorm = 100/100 = 1.0, vecNorm = 0.9/0.9 = 1.0
    expect(results[0].lexNorm).toBeCloseTo(1.0);
    expect(results[0].vecNorm).toBeCloseTo(1.0);
    // chunk 2: lexNorm = 50/100 = 0.5, vecNorm = 0.3/0.9 ≈ 0.333
    expect(results[1].lexNorm).toBeCloseTo(0.5);
    expect(results[1].vecNorm).toBeCloseTo(0.333, 2);
  });
});
