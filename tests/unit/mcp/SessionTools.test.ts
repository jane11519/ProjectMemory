import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionUseCase } from '../../../src/application/SessionUseCase.js';
import type { SessionPort, SessionListFilter } from '../../../src/domain/ports/SessionPort.js';
import type { Session } from '../../../src/domain/entities/Session.js';
import { registerSessionListTool } from '../../../src/mcp/tools/SessionListTool.js';
import { registerSessionTranscriptTool } from '../../../src/mcp/tools/SessionTranscriptTool.js';
import { registerSessionUpdateSummaryTool } from '../../../src/mcp/tools/SessionUpdateSummaryTool.js';

/**
 * Feature: MCP Session Tools
 *
 * 作為 Claude（MCP client），我需要透過 MCP tools
 * 列出 sessions、讀取 transcript、儲存 summary。
 */

/** 建構 mock SessionPort */
function createMockSessionPort(sessions: Session[] = []): SessionPort {
  const store = new Map<string, Session>();
  for (const s of sessions) store.set(s.sessionId, s);

  return {
    saveSession: vi.fn((session: Session) => { store.set(session.sessionId, session); }),
    getSession: vi.fn((id: string) => store.get(id)),
    listActiveSessions: vi.fn(() => [...store.values()].filter((s) => s.status === 'active')),
    listSessions: vi.fn((filter?: SessionListFilter) => {
      let result = [...store.values()];
      if (filter?.status) result = result.filter((s) => s.status === filter.status);
      if (filter?.hasSummary === true) result = result.filter((s) => s.summaryJson != null);
      if (filter?.hasSummary === false) result = result.filter((s) => s.summaryJson == null);
      result.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
      if (filter?.limit) result = result.slice(0, filter.limit);
      return result;
    }),
    updateSession: vi.fn(),
    writeSessionMarkdown: vi.fn(async () => {}),
  };
}

describe('MCP Session Tools', () => {
  const now = Date.now();

  const sampleSessions: Session[] = [
    {
      sessionId: 'sess-001',
      projectDir: '/proj',
      startedAt: now - 3600000,
      lastSavedAt: now - 1000,
      turnCount: 10,
      rollingSummary: 'Implemented auth module.',
      decisionsJson: '["Use JWT"]',
      searchFootprintJson: '["auth"]',
      status: 'active',
    },
    {
      sessionId: 'sess-002',
      projectDir: '/proj',
      startedAt: now - 7200000,
      lastSavedAt: now - 2000,
      turnCount: 5,
      rollingSummary: 'Fixed bug in parser.',
      decisionsJson: '[]',
      searchFootprintJson: '[]',
      summaryJson: JSON.stringify({
        overview: 'Fixed parsing bug.',
        decisions: [],
        outcomes: ['Fixed parser'],
        openItems: [],
        tags: ['bugfix'],
      }),
      status: 'closed',
    },
  ];

  describe('SessionListTool', () => {
    /**
     * Scenario: 列出所有 sessions
     * Given 有 2 個 sessions 在 DB 中
     * When 不帶過濾條件呼叫 session_list
     * Then 回傳 2 個 sessions
     */
    it('should list all sessions without filters', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const sessions = useCase.listSessions({});
      expect(sessions).toHaveLength(2);
    });

    /**
     * Scenario: 過濾無 summary 的 sessions
     * Given 1 個有 summary、1 個無 summary 的 session
     * When 以 hasSummary: false 過濾
     * Then 只回傳無 summary 的 session
     */
    it('should filter sessions without summary', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const sessions = useCase.listSessions({ hasSummary: false });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('sess-001');
    });

    /**
     * Scenario: 過濾有 summary 的 sessions
     * Given 1 個有 summary、1 個無 summary 的 session
     * When 以 hasSummary: true 過濾
     * Then 只回傳有 summary 的 session
     */
    it('should filter sessions with summary', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const sessions = useCase.listSessions({ hasSummary: true });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('sess-002');
    });

    /**
     * Scenario: 以 status 過濾
     * Given sessions 中有 active 和 closed
     * When 以 status: 'active' 過濾
     * Then 只回傳 active sessions
     */
    it('should filter by status', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const sessions = useCase.listSessions({ status: 'active' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('sess-001');
    });

    /**
     * Scenario: limit 限制回傳數量
     * Given 2 個 sessions
     * When limit: 1
     * Then 只回傳 1 個（最近的）
     */
    it('should respect limit', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const sessions = useCase.listSessions({ limit: 1 });
      expect(sessions).toHaveLength(1);
    });
  });

  describe('SessionUpdateSummaryTool', () => {
    /**
     * Scenario: 成功儲存 summary
     * Given 一個已存在的 session
     * When 呼叫 updateSummary
     * Then session 的 summaryJson 應被更新
     */
    it('should update session with summary', async () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const result = await useCase.updateSummary('sess-001', {
        overview: 'Implemented auth module with JWT tokens.',
        decisions: ['Use JWT for stateless auth'],
        outcomes: ['Added auth middleware', 'Created token service'],
        openItems: ['Add refresh token support'],
        tags: ['auth', 'jwt'],
      });

      expect(result).toBeDefined();
      expect(result!.summaryJson).toBeDefined();

      const parsed = JSON.parse(result!.summaryJson!);
      expect(parsed.overview).toBe('Implemented auth module with JWT tokens.');
      expect(parsed.decisions).toHaveLength(1);
      expect(parsed.outcomes).toHaveLength(2);
      expect(parsed.tags).toContain('jwt');
    });

    /**
     * Scenario: 更新不存在的 session
     * Given 一個不存在的 session ID
     * When 呼叫 updateSummary
     * Then 回傳 undefined
     */
    it('should return undefined for non-existent session', async () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const result = await useCase.updateSummary('non-existent', {
        overview: 'test',
        decisions: [],
        outcomes: [],
        openItems: [],
        tags: [],
      });

      expect(result).toBeUndefined();
    });
  });

  describe('SessionTranscriptTool', () => {
    /**
     * Scenario: transcript 不存在時回傳 undefined
     * Given 沒有設定 vaultRoot
     * When 呼叫 getTranscript
     * Then 回傳 undefined
     */
    it('should return undefined when vaultRoot not set', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions');

      const result = useCase.getTranscript('sess-001');
      expect(result).toBeUndefined();
    });

    /**
     * Scenario: transcript 檔案不存在時回傳 undefined
     * Given vaultRoot 已設定但檔案不存在
     * When 呼叫 getTranscript
     * Then 回傳 undefined
     */
    it('should return undefined when transcript file does not exist', () => {
      const port = createMockSessionPort(sampleSessions);
      const useCase = new SessionUseCase(port, '/vault/sessions', '/nonexistent/vault');

      const result = useCase.getTranscript('sess-001');
      expect(result).toBeUndefined();
    });
  });
});
