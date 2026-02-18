/** 搜尋請求 */
export interface SearchRequest {
  query: string;
  topK?: number;
  namespaceId?: number;
  /** 搜尋模式：hybrid（預設）, bm25_only, vec_only */
  mode?: 'hybrid' | 'bm25_only' | 'vec_only';
}
