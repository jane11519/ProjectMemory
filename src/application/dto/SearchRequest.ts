/** 搜尋請求 */
export interface SearchRequest {
  query: string;
  topK?: number;
  namespaceId?: number;
  /** 搜尋模式：hybrid（預設）, bm25_only, vec_only, deep（完整管線） */
  mode?: 'hybrid' | 'bm25_only' | 'vec_only' | 'deep';
  /** 跳過 Query Expansion（deep 模式下有效） */
  skipExpansion?: boolean;
  /** 跳過 LLM Re-ranking（deep 模式下有效） */
  skipReranking?: boolean;
}
