/**
 * LLM 抽象介面
 *
 * 設計意圖：將 LLM 相關操作（Query Expansion、Re-ranking）抽象為 Port，
 * 使 SearchUseCase 不依賴具體的 LLM 實作。
 * 支援 NullLLMAdapter（無 LLM 時的空實作）和 HttpLLMAdapter（遠端 API）。
 */

/** Re-ranking 結果 */
export interface RerankResult {
  chunkId: number;
  /** LLM 給出的相關性分數（0.0 ~ 1.0） */
  relevanceScore: number;
  /** LLM 給出的相關性理由（optional） */
  reasoning?: string;
}

/** LLM 抽象介面 */
export interface LLMPort {
  readonly providerId: string;

  /**
   * Query Expansion：將原始查詢擴展為多組替代查詢
   * @param query - 原始查詢字串
   * @returns 替代查詢陣列（通常 2 組）
   */
  expandQuery(query: string): Promise<string[]>;

  /**
   * Re-ranking：對候選結果進行相關性重排
   * @param query - 原始查詢字串
   * @param candidates - 候選結果（chunkId + 文字摘要）
   * @returns 重排後的結果（含相關性分數）
   */
  rerank(
    query: string,
    candidates: Array<{ chunkId: number; text: string }>,
  ): Promise<RerankResult[]>;

  /**
   * 檢查 LLM 服務是否可用
   */
  isAvailable(): Promise<boolean>;
}
