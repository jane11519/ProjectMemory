import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpLLMAdapter } from '../../../src/infrastructure/llm/HttpLLMAdapter.js';

/**
 * Feature: HTTP LLM Adapter（OpenAI-compatible）
 *
 * 作為搜尋管線，我需要透過 HTTP API 呼叫遠端 LLM
 * 以進行 Query Expansion 和 Re-ranking。
 */

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
      constructor(_config: any) {}
    },
  };
});

describe('HttpLLMAdapter', () => {
  let adapter: HttpLLMAdapter;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new HttpLLMAdapter({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:1.7b',
      rerankerModel: 'qwen3:0.6b',
    });

    // 取得 mock 的 create 方法
    mockCreate = (adapter as any).client.chat.completions.create;
  });

  /**
   * Scenario: 成功的 Query Expansion
   * Given LLM 回傳有效的 JSON 陣列
   * When 呼叫 expandQuery
   * Then 回傳 2 組替代查詢
   */
  it('should expand query into alternative queries', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '["authentication flow", "login validation"]' } }],
    });

    const result = await adapter.expandQuery('auth');

    expect(result).toHaveLength(2);
    expect(result[0]).toBe('authentication flow');
    expect(result[1]).toBe('login validation');
  });

  /**
   * Scenario: LLM 回傳 markdown code block 包裹的 JSON
   * Given LLM 回傳 ```json [...] ``` 格式
   * When 解析回應
   * Then 正確擷取 JSON 陣列
   */
  it('should parse JSON from markdown code blocks', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: '```json\n["query one", "query two"]\n```',
        },
      }],
    });

    const result = await adapter.expandQuery('test');
    expect(result).toEqual(['query one', 'query two']);
  });

  /**
   * Scenario: LLM 回傳非 JSON 格式
   * Given LLM 回傳無法解析的文字
   * When 解析回應
   * Then 回傳空陣列
   */
  it('should return empty array for unparseable response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Here are some alternatives: auth flow, login check' } }],
    });

    const result = await adapter.expandQuery('test');
    expect(result).toEqual([]);
  });

  /**
   * Scenario: 成功的 Re-ranking
   * Given LLM 回傳含 id + score 的 JSON 陣列
   * When 呼叫 rerank
   * Then 回傳正確的 RerankResult[]
   */
  it('should rerank candidates with relevance scores', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: '[{"id": 1, "score": 0.95}, {"id": 2, "score": 0.3}]',
        },
      }],
    });

    const candidates = [
      { chunkId: 1, text: 'Authentication service handles JWT.' },
      { chunkId: 2, text: 'User avatar upload logic.' },
    ];

    const result = await adapter.rerank('authentication', candidates);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ chunkId: 1, relevanceScore: 0.95 });
    expect(result[1]).toEqual({ chunkId: 2, relevanceScore: 0.3 });
  });

  /**
   * Scenario: Re-ranking 分數被 clamp 到 [0, 1]
   * Given LLM 回傳超出範圍的分數
   * When 解析結果
   * Then 分數被限制在 0.0 ~ 1.0
   */
  it('should clamp rerank scores to [0, 1]', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: '[{"id": 1, "score": 1.5}, {"id": 2, "score": -0.3}]',
        },
      }],
    });

    const candidates = [
      { chunkId: 1, text: 'text1' },
      { chunkId: 2, text: 'text2' },
    ];

    const result = await adapter.rerank('query', candidates);

    expect(result[0].relevanceScore).toBe(1.0);
    expect(result[1].relevanceScore).toBe(0.0);
  });

  /**
   * Scenario: Re-ranking 過濾無效的 chunkId
   * Given LLM 回傳不存在的 chunkId
   * When 解析結果
   * Then 忽略該結果
   */
  it('should filter out invalid chunk IDs from rerank results', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: '[{"id": 1, "score": 0.9}, {"id": 999, "score": 0.5}]',
        },
      }],
    });

    const candidates = [{ chunkId: 1, text: 'text1' }];
    const result = await adapter.rerank('query', candidates);

    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe(1);
  });

  /**
   * Scenario: 空候選列表
   * Given 空的候選結果列表
   * When 呼叫 rerank
   * Then 回傳空陣列（不呼叫 LLM）
   */
  it('should return empty for empty candidates', async () => {
    const result = await adapter.rerank('query', []);

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  /**
   * Scenario: isAvailable 在 API 正常時回傳 true
   */
  it('should return true for isAvailable when API responds', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    const result = await adapter.isAvailable();
    expect(result).toBe(true);
  });

  /**
   * Scenario: isAvailable 在 API 失敗時回傳 false
   */
  it('should return false for isAvailable when API fails', async () => {
    mockCreate.mockRejectedValue(new Error('Connection refused'));

    const result = await adapter.isAvailable();
    expect(result).toBe(false);
  });

  /**
   * Scenario: expandQuery 限制最多回傳 2 組查詢
   * Given LLM 回傳超過 2 組查詢
   * When 解析結果
   * Then 只取前 2 組
   */
  it('should limit expanded queries to 2', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: '["q1", "q2", "q3", "q4"]' },
      }],
    });

    const result = await adapter.expandQuery('test');
    expect(result).toHaveLength(2);
  });
});
