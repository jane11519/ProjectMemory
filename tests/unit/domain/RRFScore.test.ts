import { describe, it, expect } from 'vitest';
import { RRFScore } from '../../../src/domain/value-objects/RRFScore.js';
import type { RankingList } from '../../../src/domain/value-objects/RRFScore.js';

/**
 * Feature: Reciprocal Rank Fusion (RRF) 分數融合
 *
 * 作為搜尋管線，我需要將多組排名結果融合為單一排名，
 * 使得在多個排名中都排名靠前的結果獲得更高的最終分數。
 */
describe('RRFScore', () => {
  /**
   * Scenario: 基本 RRF 融合公式正確
   * Given 兩組排名列表各有 3 個結果
   * When 以 k=60 進行 RRF 融合
   * Then 同時出現在兩組中的結果分數最高
   */
  it('should give higher score to chunks appearing in multiple rankings', () => {
    const rankings: RankingList[] = [
      { entries: [{ chunkId: 1, rank: 0 }, { chunkId: 2, rank: 1 }, { chunkId: 3, rank: 2 }], weight: 1.0 },
      { entries: [{ chunkId: 1, rank: 0 }, { chunkId: 4, rank: 1 }, { chunkId: 2, rank: 2 }], weight: 1.0 },
    ];

    const results = RRFScore.fuse(rankings, 60);

    // chunk 1 出現在兩組排名的 #1 → 分數最高
    expect(results[0].chunkId).toBe(1);
    // chunk 2 也出現在兩組，但排名較低
    const chunk2 = results.find((r) => r.chunkId === 2)!;
    expect(chunk2.rrfScore).toBeGreaterThan(0);
    // chunk 1 分數 > chunk 2 分數
    expect(results[0].rrfScore).toBeGreaterThan(chunk2.rrfScore);
  });

  /**
   * Scenario: 原始查詢 2× 權重
   * Given 原始查詢（weight=2.0）和擴展查詢（weight=1.0）
   * When chunk A 只在原始查詢 #1，chunk B 只在擴展查詢 #1
   * Then chunk A 分數高於 chunk B
   */
  it('should weight original query results (2×) higher than expanded (1×)', () => {
    const rankings: RankingList[] = [
      { entries: [{ chunkId: 10, rank: 0 }], weight: 2.0 },
      { entries: [{ chunkId: 20, rank: 0 }], weight: 1.0 },
    ];

    const results = RRFScore.fuse(rankings, 60);
    const chunk10 = results.find((r) => r.chunkId === 10)!;
    const chunk20 = results.find((r) => r.chunkId === 20)!;

    // 2× 權重 → 分數約為 1× 的兩倍（加上 bonus 後略有差異）
    expect(chunk10.rrfScore).toBeGreaterThan(chunk20.rrfScore);
  });

  /**
   * Scenario: Top-rank bonus 正確計算
   * Given 一組排名列表
   * When chunk 在某列表中排名 #1
   * Then 獲得 +0.05 bonus
   */
  it('should apply rank-1 bonus (+0.05)', () => {
    const rankings: RankingList[] = [
      { entries: [{ chunkId: 1, rank: 0 }], weight: 1.0 },
    ];

    const results = RRFScore.fuse(rankings, 60);
    // 基礎分數 = 1.0 / (60 + 0 + 1) = 1/61 ≈ 0.01639
    // + bonus 0.05
    const expected = 1.0 / 61 + 0.05;
    expect(results[0].rrfScore).toBeCloseTo(expected, 5);
  });

  /**
   * Scenario: Top-rank bonus for rank 2-3 (+0.02)
   * Given chunk 的最佳排名為 #2（rank=1）
   * Then 獲得 +0.02 bonus
   */
  it('should apply rank-2/3 bonus (+0.02)', () => {
    const rankings: RankingList[] = [
      { entries: [{ chunkId: 99, rank: 0 }, { chunkId: 1, rank: 1 }], weight: 1.0 },
    ];

    const results = RRFScore.fuse(rankings, 60);
    const chunk1 = results.find((r) => r.chunkId === 1)!;
    const expected = 1.0 / (60 + 1 + 1) + 0.02; // rank=1 → 1/62 + 0.02
    expect(chunk1.rrfScore).toBeCloseTo(expected, 5);
  });

  /**
   * Scenario: 無 bonus（排名 >= 4）
   * Given chunk 的最佳排名為 #5（rank=4）
   * Then 不獲得任何 bonus
   */
  it('should not apply bonus for rank >= 4', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ chunkId: i + 1, rank: i }));
    const rankings: RankingList[] = [{ entries, weight: 1.0 }];

    const results = RRFScore.fuse(rankings, 60);
    const chunk5 = results.find((r) => r.chunkId === 5)!;
    const expected = 1.0 / (60 + 4 + 1); // rank=4 → 1/65, no bonus
    expect(chunk5.rrfScore).toBeCloseTo(expected, 5);
  });

  /**
   * Scenario: 空排名列表
   * Given 空的排名列表陣列
   * Then 回傳空結果
   */
  it('should return empty results for empty rankings', () => {
    const results = RRFScore.fuse([]);
    expect(results).toHaveLength(0);
  });

  /**
   * Scenario: 結果按分數降序排列
   * Given 多組排名結果
   * When 進行 RRF 融合
   * Then 結果按 rrfScore 降序排列
   */
  it('should sort results by rrfScore descending', () => {
    const rankings: RankingList[] = [
      { entries: [{ chunkId: 1, rank: 2 }, { chunkId: 2, rank: 0 }, { chunkId: 3, rank: 1 }], weight: 1.0 },
      { entries: [{ chunkId: 3, rank: 0 }, { chunkId: 1, rank: 1 }], weight: 1.0 },
    ];

    const results = RRFScore.fuse(rankings, 60);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].rrfScore).toBeLessThanOrEqual(results[i - 1].rrfScore);
    }
  });

  /**
   * Scenario: 自訂 k 值
   * Given k=10（較小的平滑常數）
   * When 比較兩個排名靠後（無 bonus）的結果分數比例
   * Then k 較小時排名差異對分數的影響更大
   */
  it('should respect custom k value', () => {
    // 使用 rank >= 3 避免 top-rank bonus 干擾比例計算
    const rankings: RankingList[] = [
      { entries: [
        { chunkId: 0, rank: 0 }, { chunkId: 1, rank: 1 }, { chunkId: 2, rank: 2 },
        { chunkId: 10, rank: 3 }, { chunkId: 20, rank: 8 },
      ], weight: 1.0 },
    ];

    const resultsK10 = RRFScore.fuse(rankings, 10);
    const resultsK60 = RRFScore.fuse(rankings, 60);

    const getScore = (results: typeof resultsK10, id: number) =>
      results.find((r) => r.chunkId === id)!.rrfScore;

    // k=10: rank 3 → 1/(10+3+1)=1/14, rank 8 → 1/(10+8+1)=1/19
    // ratio = 19/14 ≈ 1.357
    const ratio10 = getScore(resultsK10, 10) / getScore(resultsK10, 20);
    // k=60: rank 3 → 1/(60+3+1)=1/64, rank 8 → 1/(60+8+1)=1/69
    // ratio = 69/64 ≈ 1.078
    const ratio60 = getScore(resultsK60, 10) / getScore(resultsK60, 20);
    expect(ratio10).toBeGreaterThan(ratio60);
  });

  /**
   * Scenario: fromScoreMap 正確轉換
   * Given 一個 score Map
   * When 轉換為 RankedEntry[]
   * Then 按分數降序排列並指派正確的 rank
   */
  describe('fromScoreMap', () => {
    it('should convert score map to ranked entries sorted by score', () => {
      const scores = new Map<number, number>([
        [10, 0.5],
        [20, 0.9],
        [30, 0.7],
      ]);

      const entries = RRFScore.fromScoreMap(scores);

      expect(entries).toHaveLength(3);
      // 按分數降序：20(0.9) > 30(0.7) > 10(0.5)
      expect(entries[0]).toEqual({ chunkId: 20, rank: 0 });
      expect(entries[1]).toEqual({ chunkId: 30, rank: 1 });
      expect(entries[2]).toEqual({ chunkId: 10, rank: 2 });
    });

    it('should handle empty map', () => {
      const entries = RRFScore.fromScoreMap(new Map());
      expect(entries).toHaveLength(0);
    });
  });
});
