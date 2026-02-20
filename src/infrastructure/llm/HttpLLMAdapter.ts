import OpenAI from 'openai';
import type Database from 'better-sqlite3';
import type { LLMPort, RerankResult } from '../../domain/ports/LLMPort.js';
import { Logger } from '../../shared/Logger.js';
import { createHash } from 'node:crypto';

/**
 * HTTP LLM Adapter
 *
 * 設計意圖：透過 OpenAI-compatible API 呼叫遠端 LLM，支援：
 * - Query Expansion：要求模型產生 2 組替代查詢
 * - Re-ranking：逐一評估候選結果與查詢的相關性
 *
 * 支援任何 OpenAI-compatible endpoint（OpenAI、Ollama、vLLM、LiteLLM 等）。
 * 結果快取於 SQLite llm_cache 表以減少重複呼叫。
 */

export interface HttpLLMConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  rerankerModel?: string;
  /** Reranker 策略：'chat' 用 chat completions，'endpoint' 用 /v1/rerank API */
  rerankerStrategy?: 'chat' | 'endpoint';
  /** 快取 TTL（毫秒），預設 1 小時 */
  cacheTTLMs?: number;
}

export class HttpLLMAdapter implements LLMPort {
  readonly providerId = 'openai-compatible';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly rerankerModel: string;
  private readonly rerankerStrategy: 'chat' | 'endpoint';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly cacheTTLMs: number;
  private readonly logger = new Logger('HttpLLMAdapter');
  private db?: Database.Database;

  constructor(config: HttpLLMConfig, db?: Database.Database) {
    this.model = config.model;
    this.rerankerModel = config.rerankerModel ?? config.model;
    this.rerankerStrategy = config.rerankerStrategy ?? 'chat';
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey || 'not-needed';
    this.cacheTTLMs = config.cacheTTLMs ?? 3600000;
    this.db = db;

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      maxRetries: 1,
      timeout: 30000,
    });

    this.ensureCacheTable();
  }

  async expandQuery(query: string): Promise<string[]> {
    // 檢查快取
    const cacheKey = this.buildCacheKey('expand', query);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as string[];

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a search query expansion assistant. Given a search query, generate exactly 2 alternative search queries that capture different aspects or phrasings of the same intent. Return ONLY a JSON array of 2 strings, no other text.`,
          },
          {
            role: 'user',
            content: `Expand this search query: "${query}"`,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? '[]';
      const parsed = this.parseJsonArray(content);
      const result = parsed.slice(0, 2);

      this.setCache(cacheKey, result);
      return result;
    } catch (err: any) {
      this.logger.warn('Query expansion failed', { error: err?.message });
      throw err;
    }
  }

  async rerank(
    query: string,
    candidates: Array<{ chunkId: number; text: string }>,
  ): Promise<RerankResult[]> {
    if (candidates.length === 0) return [];

    // 檢查快取
    const candidateIds = candidates.map((c) => c.chunkId).sort().join(',');
    const cacheKey = this.buildCacheKey('rerank', `${query}::${candidateIds}`);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as RerankResult[];

    // 依策略分派：chat 用 chat completions，endpoint 用 /v1/rerank API
    const results = this.rerankerStrategy === 'endpoint'
      ? await this.rerankViaEndpoint(query, candidates)
      : await this.rerankViaChat(query, candidates);

    this.setCache(cacheKey, results);
    return results;
  }

  /** 透過 chat completions API 請模型以 JSON 回傳相關性分數 */
  private async rerankViaChat(
    query: string,
    candidates: Array<{ chunkId: number; text: string }>,
  ): Promise<RerankResult[]> {
    try {
      const results: RerankResult[] = [];

      // 批量評估：將所有候選合併為單一 prompt
      const candidateList = candidates.map((c, i) =>
        `[${i + 1}] (ID: ${c.chunkId})\n${c.text.slice(0, 500)}`,
      ).join('\n\n');

      const response = await this.client.chat.completions.create({
        model: this.rerankerModel,
        messages: [
          {
            role: 'system',
            content: `You are a relevance scoring assistant. Score how relevant each document is to the query.
Return a JSON array where each element has "id" (the document ID number) and "score" (0.0 to 1.0 relevance score).
Return ONLY the JSON array, no other text.`,
          },
          {
            role: 'user',
            content: `Query: "${query}"\n\nDocuments:\n${candidateList}`,
          },
        ],
        temperature: 0.0,
        max_tokens: candidates.length * 30 + 50,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? '[]';
      const parsed = this.parseJsonArray(content);

      for (const item of parsed) {
        if (typeof item === 'object' && item !== null && 'id' in item && 'score' in item) {
          const chunkId = typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10);
          const score = typeof item.score === 'number'
            ? Math.max(0, Math.min(1, item.score))
            : 0;

          if (!isNaN(chunkId) && candidates.some((c) => c.chunkId === chunkId)) {
            results.push({ chunkId, relevanceScore: score });
          }
        }
      }

      return results;
    } catch (err: any) {
      this.logger.warn('Re-ranking (chat) failed', { error: err?.message });
      throw err;
    }
  }

  /** 透過 /v1/rerank endpoint 呼叫專用 cross-encoder reranker */
  private async rerankViaEndpoint(
    query: string,
    candidates: Array<{ chunkId: number; text: string }>,
  ): Promise<RerankResult[]> {
    const url = `${this.baseUrl}/rerank`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && this.apiKey !== 'not-needed'
            ? { Authorization: `Bearer ${this.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.rerankerModel,
          query,
          documents: candidates.map((c) => c.text.slice(0, 500)),
          top_n: candidates.length,
        }),
      });

      if (!response.ok) {
        throw new Error(`Rerank endpoint returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as { results?: { index: number; relevance_score?: number }[] };
      // Jina/Cohere/LocalAI 格式：{ results: [{ index, relevance_score }] }
      return (data.results ?? [])
        .filter((r: any) => typeof r.index === 'number' && r.index < candidates.length)
        .map((r: any) => ({
          chunkId: candidates[r.index].chunkId,
          relevanceScore: Math.max(0, Math.min(1, r.relevance_score ?? 0)),
        }));
    } catch (err: any) {
      this.logger.warn('Re-ranking (endpoint) failed', { error: err?.message });
      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── 快取操作 ──

  private ensureCacheTable(): void {
    if (!this.db) return;
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS llm_cache (
          cache_key TEXT PRIMARY KEY,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
    } catch {
      // 如果表已存在或 DB 問題，忽略
    }
  }

  private buildCacheKey(operation: string, input: string): string {
    const hash = createHash('sha256')
      .update(`${operation}:${this.model}:${input}`)
      .digest('hex')
      .slice(0, 32);
    return `${operation}:${hash}`;
  }

  private getFromCache(key: string): unknown | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(
        'SELECT result_json, created_at FROM llm_cache WHERE cache_key = ?',
      ).get(key) as { result_json: string; created_at: number } | undefined;

      if (!row) return null;

      // 檢查 TTL
      if (Date.now() - row.created_at > this.cacheTTLMs) {
        this.db.prepare('DELETE FROM llm_cache WHERE cache_key = ?').run(key);
        return null;
      }

      return JSON.parse(row.result_json);
    } catch {
      return null;
    }
  }

  private setCache(key: string, result: unknown): void {
    if (!this.db) return;
    try {
      this.db.prepare(
        'INSERT OR REPLACE INTO llm_cache (cache_key, result_json, created_at) VALUES (?, ?, ?)',
      ).run(key, JSON.stringify(result), Date.now());
    } catch {
      // 快取寫入失敗不影響主流程
    }
  }

  /** 解析 LLM 回應中的 JSON 陣列，處理常見格式問題 */
  private parseJsonArray(content: string): any[] {
    try {
      // 嘗試直接解析
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      // 嘗試從 markdown code block 中擷取
      const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1].trim());
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // 忽略
        }
      }

      // 嘗試找到第一個 [ 和最後一個 ]
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          const parsed = JSON.parse(content.slice(start, end + 1));
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // 忽略
        }
      }

      return [];
    }
  }
}
