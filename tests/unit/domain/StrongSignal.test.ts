import { describe, it, expect } from 'vitest';
import { StrongSignal } from '../../../src/domain/value-objects/StrongSignal.js';

/**
 * Feature: 強訊號偵測
 *
 * 作為搜尋管線，我需要在 BM25 結果中偵測到高度相關的結果時，
 * 跳過 Query Expansion 以節省 LLM 呼叫成本。
 */
describe('StrongSignal', () => {
  /**
   * Scenario: 偵測到強訊號
   * Given BM25 結果中最高分遠超其他結果
   * When 最高正規化分數 ≥ 0.85 且 gap ≥ 0.15
   * Then detected 為 true
   */
  it('should detect strong signal when top score is dominant', () => {
    const scores = new Map<number, number>([
      [1, 10.0],  // 正規化後 = 1.0
      [2, 7.0],   // 正規化後 = 0.7, gap = 0.3
      [3, 3.0],
    ]);

    const result = StrongSignal.detect(scores, 0.85, 0.15);

    expect(result.detected).toBe(true);
    expect(result.topScore).toBe(1.0);
    expect(result.gap).toBeCloseTo(0.3, 5);
  });

  /**
   * Scenario: 分數差距不足
   * Given BM25 結果中前兩名分數接近
   * When gap < 0.15
   * Then detected 為 false
   */
  it('should not detect when gap is too small', () => {
    const scores = new Map<number, number>([
      [1, 10.0],  // 正規化後 = 1.0
      [2, 9.5],   // 正規化後 = 0.95, gap = 0.05
    ]);

    const result = StrongSignal.detect(scores, 0.85, 0.15);

    expect(result.detected).toBe(false);
    expect(result.gap).toBeCloseTo(0.05, 5);
  });

  /**
   * Scenario: 空結果集
   * Given 空的 BM25 分數 Map
   * Then detected 為 false，topScore 和 gap 為 0
   */
  it('should return not detected for empty scores', () => {
    const result = StrongSignal.detect(new Map());

    expect(result.detected).toBe(false);
    expect(result.topScore).toBe(0);
    expect(result.gap).toBe(0);
  });

  /**
   * Scenario: 所有分數為零
   * Given 所有結果分數為 0
   * Then detected 為 false
   */
  it('should return not detected when all scores are zero', () => {
    const scores = new Map<number, number>([[1, 0], [2, 0]]);
    const result = StrongSignal.detect(scores);

    expect(result.detected).toBe(false);
    expect(result.topScore).toBe(0);
  });

  /**
   * Scenario: 只有一個結果
   * Given 只有一個 BM25 結果
   * When 正規化分數為 1.0，gap 為 1.0
   * Then detected 為 true（gap=1.0 ≥ 0.15）
   */
  it('should detect strong signal with single result', () => {
    const scores = new Map<number, number>([[1, 5.0]]);
    const result = StrongSignal.detect(scores, 0.85, 0.15);

    expect(result.detected).toBe(true);
    expect(result.topScore).toBe(1.0);
    expect(result.gap).toBe(1.0);
  });

  /**
   * Scenario: 自訂閾值
   * Given 自訂 minScore=0.9, minGap=0.3
   * When 分數差距為 0.2（< minGap）
   * Then detected 為 false
   */
  it('should respect custom thresholds', () => {
    const scores = new Map<number, number>([
      [1, 10.0],
      [2, 8.0],  // gap = 0.2
    ]);

    const result = StrongSignal.detect(scores, 0.9, 0.3);
    expect(result.detected).toBe(false);
  });

  /**
   * Scenario: detectFromNormalized 使用已正規化的分數
   * Given 已正規化的分數陣列
   * When 最高分 ≥ 0.85 且 gap ≥ 0.15
   * Then 正確偵測強訊號
   */
  describe('detectFromNormalized', () => {
    it('should detect strong signal from pre-normalized scores', () => {
      const result = StrongSignal.detectFromNormalized([0.95, 0.6, 0.3]);

      expect(result.detected).toBe(true);
      expect(result.topScore).toBe(0.95);
      expect(result.gap).toBeCloseTo(0.35, 5);
    });

    it('should not detect when top score is below threshold', () => {
      const result = StrongSignal.detectFromNormalized([0.7, 0.3]);

      expect(result.detected).toBe(false);
      expect(result.topScore).toBe(0.7);
    });

    it('should handle empty array', () => {
      const result = StrongSignal.detectFromNormalized([]);

      expect(result.detected).toBe(false);
      expect(result.topScore).toBe(0);
      expect(result.gap).toBe(0);
    });
  });
});
