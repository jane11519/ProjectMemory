import type Database from 'better-sqlite3';
import type { FTS5Adapter } from '../infrastructure/sqlite/FTS5Adapter.js';
import type { SqliteVecAdapter } from '../infrastructure/sqlite/SqliteVecAdapter.js';
import type { EmbeddingPort } from '../domain/ports/EmbeddingPort.js';
import type { LLMPort } from '../domain/ports/LLMPort.js';
import type { SearchRequest } from './dto/SearchRequest.js';
import type { SearchResponse, PipelineStageInfo } from './dto/SearchResponse.js';
import type { SearchResult } from '../domain/entities/SearchResult.js';
import type { SearchConfig } from '../config/types.js';
import { HybridScore } from '../domain/value-objects/HybridScore.js';
import { RRFScore } from '../domain/value-objects/RRFScore.js';
import type { RankingList } from '../domain/value-objects/RRFScore.js';
import { StrongSignal } from '../domain/value-objects/StrongSignal.js';

/**
 * 多階段搜尋管線
 *
 * 設計意圖：支援從簡單的 BM25/Vector 搜尋到完整的 deep search 管線。
 * Deep search 管線階段：
 *   (1) 初始 BM25 搜尋
 *   (2) 強訊號檢查（決定是否跳過 expansion）
 *   (3) Query Expansion（LLM 擴展查詢）
 *   (4) 多查詢搜尋（原始 + 擴展，最多 6 組結果）
 *   (5) RRF 融合
 *   (6) LLM Re-ranking
 *   (7) Position-aware blending
 *   (8) 結果豐富化
 *
 * 向後相容：
 * - fusionMethod: 'linear' 保持原有行為
 * - 無 LLM 時 deep 模式降級為 RRF-only
 * - hybrid/bm25_only/vec_only 模式不受影響
 */
export class SearchUseCase {
  private readonly candidateMultiplier: number;
  private readonly searchConfig: SearchConfig;

  constructor(
    private readonly db: Database.Database,
    private readonly fts5: FTS5Adapter,
    private readonly vec: SqliteVecAdapter,
    private readonly embedding: EmbeddingPort,
    private readonly llm?: LLMPort,
    searchConfig?: Partial<SearchConfig>,
  ) {
    this.searchConfig = {
      defaultTopK: searchConfig?.defaultTopK ?? 10,
      candidateMultiplier: searchConfig?.candidateMultiplier ?? 5,
      weights: searchConfig?.weights ?? { lexical: 0.7, vector: 0.3 },
      fts5FieldWeights: searchConfig?.fts5FieldWeights ?? {
        title: 8.0, headingPath: 4.0, body: 1.0, tags: 2.0, properties: 3.0,
      },
      fusionMethod: searchConfig?.fusionMethod ?? 'rrf',
      rrfK: searchConfig?.rrfK ?? 60,
      strongSignalMinScore: searchConfig?.strongSignalMinScore ?? 0.85,
      strongSignalMinGap: searchConfig?.strongSignalMinGap ?? 0.15,
      rerankCandidateLimit: searchConfig?.rerankCandidateLimit ?? 20,
      rerankBlending: searchConfig?.rerankBlending ?? {
        topRrfWeight: 0.75, midRrfWeight: 0.60, tailRrfWeight: 0.40,
      },
    };
    this.candidateMultiplier = this.searchConfig.candidateMultiplier;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const start = Date.now();
    const mode = request.mode ?? 'hybrid';

    if (mode === 'deep') {
      return this.deepSearch(request, start);
    }

    return this.classicSearch(request, mode, start);
  }

  // ────────────────────────────────────────────────
  //  經典搜尋模式（hybrid / bm25_only / vec_only）
  // ────────────────────────────────────────────────

  private async classicSearch(
    request: SearchRequest,
    initialMode: 'hybrid' | 'bm25_only' | 'vec_only',
    start: number,
  ): Promise<SearchResponse> {
    const topK = request.topK ?? this.searchConfig.defaultTopK;
    const candidateK = topK * this.candidateMultiplier;
    const warnings: string[] = [];

    let mode = initialMode;
    let lexScores: Map<number, number> | null = null;
    let vecScores: Map<number, number> | null = null;

    // BM25 路徑
    if (mode === 'hybrid' || mode === 'bm25_only') {
      try {
        lexScores = this.fts5.searchBM25(request.query, candidateK, request.namespaceId);
      } catch (err: any) {
        warnings.push(`BM25 search failed: ${err?.message}`);
        if (mode === 'bm25_only') {
          return this.emptyResponse(mode, warnings, start);
        }
        mode = 'vec_only';
      }
    }

    // Vector 路徑
    if (mode === 'hybrid' || mode === 'vec_only') {
      try {
        const queryEmbed = await this.embedding.embedOne(request.query);
        vecScores = this.vec.searchKNN(queryEmbed.vector, candidateK);
      } catch (err: any) {
        warnings.push(`Vector search failed: ${err?.message}`);
        if (mode === 'vec_only') {
          return this.emptyResponse(mode, warnings, start);
        }
        mode = 'bm25_only';
      }
    }

    // 根據 fusionMethod 選擇融合策略
    let topResults: Array<{ chunkId: number; finalScore: number; lexNorm: number; vecNorm: number; rrfScore?: number }>;

    if (this.searchConfig.fusionMethod === 'rrf' && lexScores && vecScores) {
      topResults = this.fuseWithRRF(lexScores, vecScores, topK);
    } else {
      const finalLexWeight = mode === 'vec_only' ? 0 : this.searchConfig.weights.lexical;
      const finalVecWeight = mode === 'bm25_only' ? 0 : this.searchConfig.weights.vector;
      const ranked = HybridScore.fuse(lexScores, vecScores, finalLexWeight, finalVecWeight);
      topResults = ranked.slice(0, topK);
    }

    const results = this.enrichResults(topResults);

    return {
      results,
      searchMode: mode,
      totalCandidates: topResults.length,
      durationMs: Date.now() - start,
      warnings,
    };
  }

  // ────────────────────────────────────────────────
  //  Deep Search 管線
  // ────────────────────────────────────────────────

  private async deepSearch(request: SearchRequest, start: number): Promise<SearchResponse> {
    const topK = request.topK ?? this.searchConfig.defaultTopK;
    const candidateK = topK * this.candidateMultiplier;
    const warnings: string[] = [];
    const stages: PipelineStageInfo[] = [];
    const llmAvailable = this.llm ? await this.llm.isAvailable() : false;

    // ── Stage 1: 初始 BM25 搜尋 ──
    let initialBM25: Map<number, number> | null = null;
    const stage1Start = Date.now();
    try {
      initialBM25 = this.fts5.searchBM25(request.query, candidateK, request.namespaceId);
    } catch (err: any) {
      warnings.push(`Initial BM25 search failed: ${err?.message}`);
    }
    stages.push({ name: 'initial_bm25', durationMs: Date.now() - stage1Start, skipped: false });

    // ── Stage 2: 強訊號檢查 ──
    const stage2Start = Date.now();
    let strongSignalDetected = false;
    if (initialBM25 && initialBM25.size > 0) {
      const signal = StrongSignal.detect(
        initialBM25,
        this.searchConfig.strongSignalMinScore,
        this.searchConfig.strongSignalMinGap,
      );
      strongSignalDetected = signal.detected;
    }
    stages.push({ name: 'strong_signal_check', durationMs: Date.now() - stage2Start, skipped: false });

    // ── Stage 3: Query Expansion ──
    const stage3Start = Date.now();
    let expandedQueries: string[] = [];
    const shouldSkipExpansion = request.skipExpansion || strongSignalDetected || !llmAvailable;

    if (!shouldSkipExpansion && this.llm) {
      try {
        expandedQueries = await this.llm.expandQuery(request.query);
      } catch (err: any) {
        warnings.push(`Query expansion failed: ${err?.message}`);
      }
    }
    stages.push({
      name: 'query_expansion',
      durationMs: Date.now() - stage3Start,
      skipped: shouldSkipExpansion,
      skipReason: request.skipExpansion
        ? 'user_requested'
        : strongSignalDetected
          ? 'strong_signal_detected'
          : !llmAvailable
            ? 'llm_unavailable'
            : undefined,
    });

    // ── Stage 4: 多查詢搜尋 ──
    const stage4Start = Date.now();
    const allQueries = [request.query, ...expandedQueries];
    const rankings: RankingList[] = [];

    for (let i = 0; i < allQueries.length; i++) {
      const q = allQueries[i];
      const isOriginal = i === 0;
      const weight = isOriginal ? 2.0 : 1.0;

      // BM25 搜尋
      try {
        const bm25Scores = this.fts5.searchBM25(q, candidateK, request.namespaceId);
        if (bm25Scores.size > 0) {
          rankings.push({
            entries: RRFScore.fromScoreMap(bm25Scores),
            weight,
          });
        }
      } catch (err: any) {
        warnings.push(`BM25 search failed for query "${q.slice(0, 50)}": ${err?.message}`);
      }

      // Vector 搜尋
      try {
        const queryEmbed = await this.embedding.embedOne(q);
        const vecScores = this.vec.searchKNN(queryEmbed.vector, candidateK);
        if (vecScores.size > 0) {
          rankings.push({
            entries: RRFScore.fromScoreMap(vecScores),
            weight,
          });
        }
      } catch (err: any) {
        warnings.push(`Vector search failed for query "${q.slice(0, 50)}": ${err?.message}`);
      }
    }
    stages.push({ name: 'multi_query_search', durationMs: Date.now() - stage4Start, skipped: false });

    // ── Stage 5: RRF 融合 ──
    const stage5Start = Date.now();
    const rrfResults = RRFScore.fuse(rankings, this.searchConfig.rrfK);
    const rrfTopK = rrfResults.slice(0, this.searchConfig.rerankCandidateLimit);
    stages.push({ name: 'rrf_fusion', durationMs: Date.now() - stage5Start, skipped: false });

    // ── Stage 6: LLM Re-ranking ──
    const stage6Start = Date.now();
    let rerankApplied = false;
    const shouldSkipReranking = request.skipReranking || !llmAvailable;
    let rerankScoreMap = new Map<number, number>();

    if (!shouldSkipReranking && this.llm && rrfTopK.length > 0) {
      try {
        const candidates = this.fetchCandidateTexts(rrfTopK.map((r) => r.chunkId));
        if (candidates.length > 0) {
          const rerankResults = await this.llm.rerank(request.query, candidates);
          for (const r of rerankResults) {
            rerankScoreMap.set(r.chunkId, r.relevanceScore);
          }
          rerankApplied = true;
        }
      } catch (err: any) {
        warnings.push(`Re-ranking failed: ${err?.message}`);
      }
    }
    stages.push({
      name: 'llm_reranking',
      durationMs: Date.now() - stage6Start,
      skipped: shouldSkipReranking,
      skipReason: request.skipReranking
        ? 'user_requested'
        : !llmAvailable
          ? 'llm_unavailable'
          : undefined,
    });

    // ── Stage 7: Position-aware blending ──
    const stage7Start = Date.now();
    let finalRanked: Array<{
      chunkId: number; finalScore: number; lexNorm: number; vecNorm: number;
      rrfScore?: number; rerankerScore?: number;
    }>;

    if (rerankApplied) {
      finalRanked = this.positionAwareBlend(rrfTopK, rerankScoreMap);
    } else {
      finalRanked = rrfTopK.map((r) => ({
        chunkId: r.chunkId,
        finalScore: r.rrfScore,
        lexNorm: 0,
        vecNorm: 0,
        rrfScore: r.rrfScore,
      }));
    }

    finalRanked = finalRanked.slice(0, topK);
    stages.push({ name: 'position_aware_blending', durationMs: Date.now() - stage7Start, skipped: !rerankApplied });

    // ── Stage 8: 結果豐富化 ──
    const stage8Start = Date.now();
    const results = this.enrichResults(finalRanked);
    stages.push({ name: 'enrichment', durationMs: Date.now() - stage8Start, skipped: false });

    return {
      results,
      searchMode: 'deep',
      totalCandidates: rrfResults.length,
      durationMs: Date.now() - start,
      warnings,
      expandedQueries: expandedQueries.length > 0 ? expandedQueries : undefined,
      strongSignalDetected,
      rerankApplied,
      pipelineStages: stages,
    };
  }

  // ────────────────────────────────────────────────
  //  RRF 融合（classic hybrid 模式用）
  // ────────────────────────────────────────────────

  private fuseWithRRF(
    lexScores: Map<number, number>,
    vecScores: Map<number, number>,
    topK: number,
  ): Array<{ chunkId: number; finalScore: number; lexNorm: number; vecNorm: number; rrfScore: number }> {
    const rankings: RankingList[] = [
      { entries: RRFScore.fromScoreMap(lexScores), weight: 1.0 },
      { entries: RRFScore.fromScoreMap(vecScores), weight: 1.0 },
    ];
    const rrfResults = RRFScore.fuse(rankings, this.searchConfig.rrfK);

    return rrfResults.slice(0, topK).map((r) => ({
      chunkId: r.chunkId,
      finalScore: r.rrfScore,
      lexNorm: 0,
      vecNorm: 0,
      rrfScore: r.rrfScore,
    }));
  }

  // ────────────────────────────────────────────────
  //  Position-Aware Blending
  // ────────────────────────────────────────────────

  /**
   * Position-aware blending 公式：
   * ranks 1-3:   finalScore = topRrfWeight × rrfScore + (1-topRrfWeight) × rerankerScore
   * ranks 4-10:  finalScore = midRrfWeight × rrfScore + (1-midRrfWeight) × rerankerScore
   * ranks 11+:   finalScore = tailRrfWeight × rrfScore + (1-tailRrfWeight) × rerankerScore
   */
  private positionAwareBlend(
    rrfResults: Array<{ chunkId: number; rrfScore: number }>,
    rerankScoreMap: Map<number, number>,
  ): Array<{
    chunkId: number; finalScore: number; lexNorm: number; vecNorm: number;
    rrfScore: number; rerankerScore?: number;
  }> {
    const { topRrfWeight, midRrfWeight, tailRrfWeight } = this.searchConfig.rerankBlending;

    // 先對 RRF 分數正規化到 0-1 範圍
    const maxRrf = rrfResults.length > 0 ? Math.max(...rrfResults.map((r) => r.rrfScore)) : 1;

    const blended = rrfResults.map((r, index) => {
      const rrfNorm = maxRrf > 0 ? r.rrfScore / maxRrf : 0;
      const rerankerScore = rerankScoreMap.get(r.chunkId);
      const rerankerNorm = rerankerScore ?? 0;

      let rrfWeight: number;
      if (index < 3) {
        rrfWeight = topRrfWeight;
      } else if (index < 10) {
        rrfWeight = midRrfWeight;
      } else {
        rrfWeight = tailRrfWeight;
      }

      const rerankerWeight = 1.0 - rrfWeight;
      const finalScore = rrfWeight * rrfNorm + rerankerWeight * rerankerNorm;

      return {
        chunkId: r.chunkId,
        finalScore,
        lexNorm: 0,
        vecNorm: 0,
        rrfScore: r.rrfScore,
        rerankerScore,
      };
    });

    // 依 finalScore 重新排序
    blended.sort((a, b) => b.finalScore - a.finalScore);
    return blended;
  }

  // ────────────────────────────────────────────────
  //  共用輔助方法
  // ────────────────────────────────────────────────

  /** 從 DB 取 chunk 文字（用於 LLM re-ranking 輸入） */
  private fetchCandidateTexts(chunkIds: number[]): Array<{ chunkId: number; text: string }> {
    if (chunkIds.length === 0) return [];

    const placeholders = chunkIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT chunk_id, text FROM chunks WHERE chunk_id IN (${placeholders})`,
    ).all(...chunkIds) as Array<{ chunk_id: number; text: string }>;

    return rows.map((r) => ({ chunkId: r.chunk_id, text: r.text }));
  }

  /** 從 DB 取 chunk/doc/namespace 詳細資訊 */
  private enrichResults(
    ranked: Array<{
      chunkId: number; finalScore: number; lexNorm: number; vecNorm: number;
      rrfScore?: number; rerankerScore?: number;
    }>,
  ): SearchResult[] {
    if (ranked.length === 0) return [];

    const results: SearchResult[] = [];

    for (const item of ranked) {
      const row = this.db.prepare(`
        SELECT
          c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
          d.doc_path, d.title,
          n.name AS namespace_name
        FROM chunks c
        JOIN docs d ON c.doc_id = d.doc_id
        JOIN namespaces n ON d.namespace_id = n.namespace_id
        WHERE c.chunk_id = ?
      `).get(item.chunkId) as any;

      if (!row) continue;

      const snippet = row.text.length > 200
        ? row.text.slice(0, 200) + '...'
        : row.text;

      results.push({
        chunkId: row.chunk_id,
        docPath: row.doc_path,
        title: row.title,
        headingPath: row.heading_path ?? '',
        startLine: row.start_line,
        endLine: row.end_line,
        namespaceName: row.namespace_name,
        finalScore: item.finalScore,
        lexNorm: item.lexNorm,
        vecNorm: item.vecNorm,
        snippet,
        text: row.text,
        rrfScore: item.rrfScore,
        rerankerScore: item.rerankerScore,
      });
    }

    return results;
  }

  private emptyResponse(
    mode: 'hybrid' | 'bm25_only' | 'vec_only' | 'deep',
    warnings: string[],
    start: number,
  ): SearchResponse {
    return {
      results: [],
      searchMode: mode,
      totalCandidates: 0,
      durationMs: Date.now() - start,
      warnings,
    };
  }
}
