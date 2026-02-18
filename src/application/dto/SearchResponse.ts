import type { SearchResult } from '../../domain/entities/SearchResult.js';

/** 搜尋回應 */
export interface SearchResponse {
  results: SearchResult[];
  searchMode: 'hybrid' | 'bm25_only' | 'vec_only';
  totalCandidates: number;
  durationMs: number;
  warnings: string[];
}
