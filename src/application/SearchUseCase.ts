import type Database from 'better-sqlite3';
import type { FTS5Adapter } from '../infrastructure/sqlite/FTS5Adapter.js';
import type { SqliteVecAdapter } from '../infrastructure/sqlite/SqliteVecAdapter.js';
import type { EmbeddingPort } from '../domain/ports/EmbeddingPort.js';
import type { SearchRequest } from './dto/SearchRequest.js';
import type { SearchResponse } from './dto/SearchResponse.js';
import type { SearchResult } from '../domain/entities/SearchResult.js';
import { HybridScore } from '../domain/value-objects/HybridScore.js';

/**
 * 混合搜尋用例：BM25 + KNN → HybridScore 融合
 * 支援 hybrid / bm25_only / vec_only 三種模式
 * 自動降級：vec 失敗 → bm25_only，BM25 失敗 → vec_only
 */
export class SearchUseCase {
  private readonly lexWeight: number = 0.7;
  private readonly vecWeight: number = 0.3;
  private readonly candidateMultiplier: number = 5;

  constructor(
    private readonly db: Database.Database,
    private readonly fts5: FTS5Adapter,
    private readonly vec: SqliteVecAdapter,
    private readonly embedding: EmbeddingPort,
  ) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    const start = Date.now();
    const topK = request.topK ?? 10;
    const candidateK = topK * this.candidateMultiplier;
    const warnings: string[] = [];

    let mode = request.mode ?? 'hybrid';
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
        // hybrid 模式下 BM25 失敗 → 降級為 vec_only
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
        // hybrid 模式下 vec 失敗 → 降級為 bm25_only
        mode = 'bm25_only';
      }
    }

    // 決定最終權重
    const finalLexWeight = mode === 'vec_only' ? 0 : this.lexWeight;
    const finalVecWeight = mode === 'bm25_only' ? 0 : this.vecWeight;

    // 融合分數
    const ranked = HybridScore.fuse(lexScores, vecScores, finalLexWeight, finalVecWeight);
    const topResults = ranked.slice(0, topK);

    // 豐富化結果：從 DB 取 chunk 詳細資訊
    const results = this.enrichResults(topResults);

    return {
      results,
      searchMode: mode,
      totalCandidates: ranked.length,
      durationMs: Date.now() - start,
      warnings,
    };
  }

  /** 從 DB 取 chunk/doc/namespace 詳細資訊 */
  private enrichResults(
    ranked: Array<{ chunkId: number; finalScore: number; lexNorm: number; vecNorm: number }>,
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

      // 產生摘要片段（前 200 字元）
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
      });
    }

    return results;
  }

  private emptyResponse(
    mode: 'hybrid' | 'bm25_only' | 'vec_only',
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
