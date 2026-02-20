import { McpServer as SDKMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import type { FTS5Adapter } from '../infrastructure/sqlite/FTS5Adapter.js';
import type { SqliteVecAdapter } from '../infrastructure/sqlite/SqliteVecAdapter.js';
import type { EmbeddingPort } from '../domain/ports/EmbeddingPort.js';
import type { LLMPort } from '../domain/ports/LLMPort.js';
import type { SessionPort } from '../domain/ports/SessionPort.js';
import type { SearchConfig } from '../config/types.js';
import { SessionUseCase } from '../application/SessionUseCase.js';
import { registerSearchTool } from './tools/SearchTool.js';
import { registerVectorSearchTool } from './tools/VectorSearchTool.js';
import { registerDeepSearchTool } from './tools/DeepSearchTool.js';
import { registerGetTool } from './tools/GetTool.js';
import { registerMultiGetTool } from './tools/MultiGetTool.js';
import { registerStatusTool } from './tools/StatusTool.js';
import { registerSessionListTool } from './tools/SessionListTool.js';
import { registerSessionTranscriptTool } from './tools/SessionTranscriptTool.js';
import { registerSessionUpdateSummaryTool } from './tools/SessionUpdateSummaryTool.js';

/**
 * MCP Server Factory
 *
 * 設計意圖：建立 MCP server 實例並註冊所有工具。
 * 工具與 CLI 指令對應，提供一致的搜尋、檢索與狀態查詢功能。
 * 透過 stdio 或 HTTP transport 與 LLM client 通訊。
 */

export interface McpDependencies {
  db: Database.Database;
  fts5: FTS5Adapter;
  vec: SqliteVecAdapter;
  embedding: EmbeddingPort;
  llm?: LLMPort;
  searchConfig?: Partial<SearchConfig>;
  repoRoot: string;
  /** Session 相關依賴（可選，graceful degradation） */
  sessionPort?: SessionPort;
  vaultRoot?: string;
}

export function createMcpServer(deps: McpDependencies): SDKMcpServer {
  const server = new SDKMcpServer({
    name: 'projecthub',
    version: '0.2.0',
  });

  registerSearchTool(server, deps);
  registerVectorSearchTool(server, deps);
  registerDeepSearchTool(server, deps);
  registerGetTool(server, deps);
  registerMultiGetTool(server, deps);
  registerStatusTool(server, deps);

  // Session tools（需要 sessionPort + vaultRoot）
  if (deps.sessionPort && deps.vaultRoot) {
    const sessionsDir = `${deps.vaultRoot}/sessions`;
    const sessionUseCase = new SessionUseCase(deps.sessionPort, sessionsDir, deps.vaultRoot);

    registerSessionListTool(server, sessionUseCase);
    registerSessionTranscriptTool(server, sessionUseCase);
    registerSessionUpdateSummaryTool(server, sessionUseCase);
  }

  return server;
}

/** 建構 MCP server 的 instructions 文字 */
export function buildInstructions(repoRoot: string): string {
  return [
    'ProjectHub: Project-level knowledge base with hybrid BM25+vector search.',
    '',
    'Available tools:',
    '- projecthub_search: BM25 keyword search (fast, exact matches)',
    '- projecthub_vector_search: Semantic vector search (concept matching)',
    '- projecthub_deep_search: Full pipeline with query expansion + re-ranking',
    '- projecthub_get: Retrieve a specific chunk by ID or doc by path',
    '- projecthub_multi_get: Batch retrieve multiple chunks or docs',
    '- projecthub_status: Index stats and collection info',
    '- projecthub_session_list: List sessions with summary status',
    '- projecthub_session_transcript: Read full conversation transcript',
    '- projecthub_session_update_summary: Save structured session summary',
    '',
    'Recommended workflow:',
    '1. Start with projecthub_search for known keywords/terms',
    '2. Use projecthub_vector_search for conceptual/semantic queries',
    '3. Use projecthub_deep_search for complex research tasks',
    '',
    'Session summarize workflow:',
    '1. projecthub_session_list (hasSummary: false) to find unsummarized sessions',
    '2. projecthub_session_transcript to read the conversation',
    '3. Generate structured summary (overview, decisions, outcomes, openItems, tags)',
    '4. projecthub_session_update_summary to save the summary',
    '',
    'Score interpretation:',
    '- 0.8-1.0: Highly relevant, directly answers the query',
    '- 0.5-0.8: Moderately relevant, contains related information',
    '- 0.2-0.5: Low relevance, may be tangentially related',
    '- <0.2: Skip, likely not useful',
    '',
    `Repository root: ${repoRoot}`,
  ].join('\n');
}
