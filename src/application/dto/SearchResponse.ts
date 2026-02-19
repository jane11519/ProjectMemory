import type { SearchResult } from '../../domain/entities/SearchResult.js';

/** 搜尋回應 */
export interface SearchResponse {
  results: SearchResult[];
  searchMode: 'hybrid' | 'bm25_only' | 'vec_only' | 'deep';
  totalCandidates: number;
  durationMs: number;
  warnings: string[];
  /** deep 模式：擴展後的查詢列表 */
  expandedQueries?: string[];
  /** deep 模式：是否偵測到強訊號（跳過 expansion） */
  strongSignalDetected?: boolean;
  /** deep 模式：是否套用了 LLM re-ranking */
  rerankApplied?: boolean;
  /** deep 模式：管線各階段執行資訊 */
  pipelineStages?: PipelineStageInfo[];
}

/** 管線階段執行資訊 */
export interface PipelineStageInfo {
  name: string;
  durationMs: number;
  /** 該階段是否被跳過 */
  skipped: boolean;
  /** 跳過原因 */
  skipReason?: string;
}
