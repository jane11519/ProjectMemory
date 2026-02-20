import { describe, it, expect } from 'vitest';
import type { SessionSummary } from '../../../src/domain/value-objects/SessionSummary.js';

/**
 * Feature: SessionSummary Value Object
 *
 * 作為開發者，我需要一個結構化的 session 摘要格式，
 * 以便 Claude 生成的摘要可以被一致地序列化和反序列化。
 */
describe('SessionSummary', () => {
  /**
   * Scenario: 完整的 SessionSummary 可以被序列化為 JSON
   * Given 一個包含所有欄位的 SessionSummary
   * When 序列化為 JSON 字串再反序列化
   * Then 所有欄位應保持一致
   */
  it('should serialize and deserialize correctly', () => {
    const summary: SessionSummary = {
      overview: 'Implemented session summarize feature with MCP tools.',
      decisions: ['Use Claude as summarizer instead of external LLM', 'Store summary as JSON in SQLite'],
      outcomes: ['Added 3 new MCP tools', 'Updated VaultSessionAdapter'],
      openItems: ['Add batch summarize support', 'Add search by tags'],
      tags: ['session', 'mcp', 'summarize'],
    };

    const json = JSON.stringify(summary);
    const parsed: SessionSummary = JSON.parse(json);

    expect(parsed.overview).toBe(summary.overview);
    expect(parsed.decisions).toEqual(summary.decisions);
    expect(parsed.outcomes).toEqual(summary.outcomes);
    expect(parsed.openItems).toEqual(summary.openItems);
    expect(parsed.tags).toEqual(summary.tags);
  });

  /**
   * Scenario: 空陣列欄位的 SessionSummary 可以被序列化
   * Given 一個只有 overview 而其他欄位為空陣列的 SessionSummary
   * When 序列化為 JSON
   * Then 空陣列應保持為空陣列
   */
  it('should handle empty arrays', () => {
    const summary: SessionSummary = {
      overview: 'Quick bug fix session.',
      decisions: [],
      outcomes: [],
      openItems: [],
      tags: [],
    };

    const json = JSON.stringify(summary);
    const parsed: SessionSummary = JSON.parse(json);

    expect(parsed.decisions).toEqual([]);
    expect(parsed.outcomes).toEqual([]);
    expect(parsed.openItems).toEqual([]);
    expect(parsed.tags).toEqual([]);
  });

  /**
   * Scenario: SessionSummary 中的中文內容可以正確序列化
   * Given 包含中文的 SessionSummary
   * When 序列化為 JSON 再反序列化
   * Then 中文內容不變
   */
  it('should preserve unicode content', () => {
    const summary: SessionSummary = {
      overview: '實作了 session summarize 功能，透過 MCP tools 讓 Claude 生成摘要。',
      decisions: ['使用 Claude 作為 summarizer，不呼叫外部 LLM'],
      outcomes: ['新增 3 個 MCP tools'],
      openItems: ['支援批次 summarize'],
      tags: ['會話管理', 'MCP'],
    };

    const json = JSON.stringify(summary);
    const parsed: SessionSummary = JSON.parse(json);

    expect(parsed.overview).toBe(summary.overview);
    expect(parsed.decisions[0]).toContain('Claude');
  });
});
