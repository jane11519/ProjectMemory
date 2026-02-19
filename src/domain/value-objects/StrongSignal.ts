/**
 * 強訊號偵測
 *
 * 設計意圖：當 BM25 搜尋已找到高度相關的結果時，
 * 跳過 Query Expansion 階段以節省 LLM 呼叫成本和延遲。
 *
 * 偵測條件（兩者皆須滿足）：
 * 1. 最高 FTS 分數 ≥ minScore（預設 0.85）
 * 2. 最高分與第二高分的差距 ≥ minGap（預設 0.15）
 *
 * 參考：qmd 的 strong signal detection 機制
 */

/** 強訊號偵測結果 */
export interface StrongSignalResult {
  /** 是否偵測到強訊號 */
  detected: boolean;
  /** 最高正規化 BM25 分數 */
  topScore: number;
  /** 最高分與第二高分的差距 */
  gap: number;
}

export class StrongSignal {
  static readonly DEFAULT_MIN_SCORE = 0.85;
  static readonly DEFAULT_MIN_GAP = 0.15;

  /**
   * 偵測 BM25 結果中是否存在強訊號
   *
   * @param scores - BM25 分數 Map（chunkId → score），分數越大越好
   * @param minScore - 最低正規化分數閾值（預設 0.85）
   * @param minGap - 最低分數差距閾值（預設 0.15）
   * @returns 偵測結果
   */
  static detect(
    scores: Map<number, number>,
    minScore: number = StrongSignal.DEFAULT_MIN_SCORE,
    minGap: number = StrongSignal.DEFAULT_MIN_GAP,
  ): StrongSignalResult {
    if (scores.size === 0) {
      return { detected: false, topScore: 0, gap: 0 };
    }

    // 取正規化分數：以最大值正規化
    const rawScores = [...scores.values()].sort((a, b) => b - a);
    const maxScore = rawScores[0];

    if (maxScore === 0) {
      return { detected: false, topScore: 0, gap: 0 };
    }

    const topScore = 1.0; // 最大值正規化後恆為 1.0
    const secondScore = rawScores.length > 1 ? rawScores[1] / maxScore : 0;
    const gap = topScore - secondScore;

    // 使用原始正規化分數（相對於查詢的絕對相關性）判斷
    // 但由於 per-query normalization 後 topScore 恆為 1.0，
    // 我們改用 gap 作為主要判斷依據，並檢查是否只有一個高分結果
    // 若結果數量足夠且 gap 夠大，表示第一名遠超其他結果
    const detected = rawScores.length >= 1 && topScore >= minScore && gap >= minGap;

    return { detected, topScore, gap };
  }

  /**
   * 使用原始（未正規化）分數偵測強訊號
   * 適用於已有絕對分數的場景（例如已正規化的 BM25 分數）
   */
  static detectFromNormalized(
    normalizedScores: number[],
    minScore: number = StrongSignal.DEFAULT_MIN_SCORE,
    minGap: number = StrongSignal.DEFAULT_MIN_GAP,
  ): StrongSignalResult {
    if (normalizedScores.length === 0) {
      return { detected: false, topScore: 0, gap: 0 };
    }

    const sorted = [...normalizedScores].sort((a, b) => b - a);
    const topScore = sorted[0];
    const secondScore = sorted.length > 1 ? sorted[1] : 0;
    const gap = topScore - secondScore;

    const detected = topScore >= minScore && gap >= minGap;
    return { detected, topScore, gap };
  }
}
