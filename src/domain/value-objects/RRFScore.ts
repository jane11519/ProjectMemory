/**
 * Reciprocal Rank Fusion (RRF) 分數融合
 *
 * 設計意圖：取代簡單的線性加權融合，使用排名而非原始分數進行融合。
 * RRF 的優勢在於不受個別排名系統分數量級差異的影響，
 * 且對於在多個排名中都出現在前列的結果會給予更高的分數。
 *
 * 公式：score = Σ(weight / (k + rank + 1))
 * - k=60 為平滑常數，降低高排名結果的影響力差異
 * - 原始查詢結果的權重為 2×，擴展查詢為 1×
 * - top-rank bonus: #1 +0.05, #2-3 +0.02（獎勵跨查詢一致排名靠前的結果）
 *
 * 參考：qmd 的 RRF 實作（Tobi Lutke）
 */

/** 單一排名列表中的結果 */
export interface RankedEntry {
  chunkId: number;
  /** 在該排名列表中的排名（0-based） */
  rank: number;
}

/** 一組排名結果及其權重 */
export interface RankingList {
  entries: RankedEntry[];
  /** 此排名列表的權重（原始查詢 2.0，擴展查詢 1.0） */
  weight: number;
}

/** RRF 融合後的結果 */
export interface RRFResult {
  chunkId: number;
  rrfScore: number;
}

export class RRFScore {
  /** RRF 平滑常數，降低排名差異的極端影響 */
  static readonly DEFAULT_K = 60;

  /** Top-rank bonus 設定 */
  static readonly RANK_1_BONUS = 0.05;
  static readonly RANK_2_3_BONUS = 0.02;

  /**
   * 對多組排名結果進行 RRF 融合
   *
   * @param rankings - 多組排名列表（含權重）
   * @param k - 平滑常數（預設 60）
   * @returns 融合後的結果，依分數降序排列
   */
  static fuse(rankings: RankingList[], k: number = RRFScore.DEFAULT_K): RRFResult[] {
    if (rankings.length === 0) return [];

    const scoreMap = new Map<number, number>();
    /** 追蹤每個 chunk 在各列表中的最佳排名，用於 top-rank bonus */
    const bestRankMap = new Map<number, number>();

    for (const ranking of rankings) {
      for (const entry of ranking.entries) {
        const rrfContribution = ranking.weight / (k + entry.rank + 1);
        const current = scoreMap.get(entry.chunkId) ?? 0;
        scoreMap.set(entry.chunkId, current + rrfContribution);

        // 追蹤最佳排名
        const currentBest = bestRankMap.get(entry.chunkId) ?? Infinity;
        if (entry.rank < currentBest) {
          bestRankMap.set(entry.chunkId, entry.rank);
        }
      }
    }

    // 加入 top-rank bonus
    for (const [chunkId, bestRank] of bestRankMap) {
      const current = scoreMap.get(chunkId)!;
      if (bestRank === 0) {
        scoreMap.set(chunkId, current + RRFScore.RANK_1_BONUS);
      } else if (bestRank <= 2) {
        scoreMap.set(chunkId, current + RRFScore.RANK_2_3_BONUS);
      }
    }

    // 轉換為結果陣列並排序
    const results: RRFResult[] = [];
    for (const [chunkId, rrfScore] of scoreMap) {
      results.push({ chunkId, rrfScore });
    }

    results.sort((a, b) => b.rrfScore - a.rrfScore);
    return results;
  }

  /**
   * 從原始分數 Map 建立排名列表
   * 將 Map<chunkId, score> 轉換為按分數排序的 RankedEntry[]
   */
  static fromScoreMap(scores: Map<number, number>): RankedEntry[] {
    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.map(([chunkId], rank) => ({ chunkId, rank }));
  }
}
