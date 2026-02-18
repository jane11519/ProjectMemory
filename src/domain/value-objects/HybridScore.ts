export interface RankedResult {
  chunkId: number;
  finalScore: number;
  lexNorm: number;
  vecNorm: number;
}

/**
 * 混合檢索分數融合
 * BM25（越大越好，已翻轉） + Vector similarity（越大越好）
 * Per-query max normalization → 加權線性融合
 */
export class HybridScore {
  static fuse(
    lexScores: Map<number, number> | null,
    vecScores: Map<number, number> | null,
    lexWeight: number,
    vecWeight: number,
  ): RankedResult[] {
    const lex = lexScores ?? new Map<number, number>();
    const vec = vecScores ?? new Map<number, number>();

    const allIds = new Set<number>([...lex.keys(), ...vec.keys()]);
    if (allIds.size === 0) return [];

    const maxLex = lex.size > 0 ? Math.max(...lex.values()) : 1;
    const maxVec = vec.size > 0 ? Math.max(...vec.values()) : 1;

    const ranked: RankedResult[] = [];
    for (const chunkId of allIds) {
      const lexRaw = lex.get(chunkId) ?? 0;
      const vecRaw = vec.get(chunkId) ?? 0;

      const lexNorm = maxLex > 0 ? lexRaw / maxLex : 0;
      const vecNorm = maxVec > 0 ? vecRaw / maxVec : 0;
      const finalScore = lexWeight * lexNorm + vecWeight * vecNorm;

      ranked.push({ chunkId, finalScore, lexNorm, vecNorm });
    }

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked;
  }
}
