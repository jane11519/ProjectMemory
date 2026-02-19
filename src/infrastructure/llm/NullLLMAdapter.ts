import type { LLMPort, RerankResult } from '../../domain/ports/LLMPort.js';

/**
 * 空 LLM 實作
 *
 * 設計意圖：當 LLM 未啟用（llm.provider: 'none'）時使用。
 * 所有方法回傳空結果或 false，確保 SearchUseCase 可優雅降級。
 * 遵循 Null Object Pattern，避免在呼叫端進行 null 檢查。
 */
export class NullLLMAdapter implements LLMPort {
  readonly providerId = 'none';

  async expandQuery(_query: string): Promise<string[]> {
    return [];
  }

  async rerank(
    _query: string,
    _candidates: Array<{ chunkId: number; text: string }>,
  ): Promise<RerankResult[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
