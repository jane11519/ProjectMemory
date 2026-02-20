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
import { registerInitTool } from './tools/InitTool.js';
import { registerScanTool } from './tools/ScanTool.js';
import { registerIndexBuildTool } from './tools/IndexBuildTool.js';
import { registerIndexUpdateTool } from './tools/IndexUpdateTool.js';
import { registerContextAddTool } from './tools/ContextAddTool.js';
import { registerContextListTool } from './tools/ContextListTool.js';
import { registerContextRemoveTool } from './tools/ContextRemoveTool.js';
import { registerSessionSaveTool } from './tools/SessionSaveTool.js';
import { registerSessionCompactTool } from './tools/SessionCompactTool.js';

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
  const server = new SDKMcpServer(
    { name: 'projmem', version: '0.3.0' },
    { instructions: buildInstructions(deps.repoRoot) },
  );

  // === 搜尋與檢索 tools ===
  registerSearchTool(server, deps);
  registerVectorSearchTool(server, deps);
  registerDeepSearchTool(server, deps);
  registerGetTool(server, deps);
  registerMultiGetTool(server, deps);
  registerStatusTool(server, deps);

  // === 管理類 tools（不需條件判斷） ===
  registerInitTool(server, deps);
  registerScanTool(server, deps);
  registerIndexBuildTool(server, deps);
  registerIndexUpdateTool(server, deps);
  registerContextAddTool(server, deps);
  registerContextListTool(server, deps);
  registerContextRemoveTool(server, deps);

  // === Session tools（需要 sessionPort + vaultRoot） ===
  if (deps.sessionPort && deps.vaultRoot) {
    const sessionsDir = `${deps.vaultRoot}/sessions`;
    const sessionUseCase = new SessionUseCase(deps.sessionPort, sessionsDir, deps.vaultRoot);

    registerSessionListTool(server, sessionUseCase);
    registerSessionTranscriptTool(server, sessionUseCase);
    registerSessionUpdateSummaryTool(server, sessionUseCase);
    registerSessionSaveTool(server, sessionUseCase);
    registerSessionCompactTool(server, sessionUseCase);
  }

  return server;
}

/** 建構 MCP server 的 instructions 文字 */
export function buildInstructions(repoRoot: string): string {
  return [
    'projmem: Project-level knowledge base with hybrid BM25+vector search.',
    '',
    'Available tools:',
    '',
    '## Project Management',
    '- projmem_init: Initialize projmem (skills, commands, settings, vault)',
    '- projmem_scan: Scan vault to detect namespaces and documents',
    '- projmem_index_build: Full rebuild of the search index',
    '- projmem_index_update: Incremental index update (dirty files only)',
    '',
    '## Search & Retrieval',
    '- projmem_search: BM25 keyword search (fast, exact matches)',
    '- projmem_vector_search: Semantic vector search (concept matching)',
    '- projmem_deep_search: Full pipeline with query expansion + re-ranking',
    '- projmem_get: Retrieve a specific chunk by ID or doc by path',
    '- projmem_multi_get: Batch retrieve multiple chunks or docs',
    '- projmem_status: Index stats and collection info',
    '',
    '## Context Management',
    '- projmem_context_add: Add or update context metadata for a path',
    '- projmem_context_list: List all context entries',
    '- projmem_context_rm: Remove context for a path',
    '',
    '## Session Management',
    '- projmem_session_list: List sessions with summary status',
    '- projmem_session_transcript: Read full conversation transcript',
    '- projmem_session_update_summary: Save structured session summary',
    '- projmem_session_save: Save a session snapshot',
    '- projmem_session_compact: Compact session rolling summary',
    '',
    'Recommended workflow:',
    '1. projmem_init to set up project structure',
    '2. Add Markdown notes to vault/code-notes/',
    '3. projmem_scan to detect documents',
    '4. projmem_index_build to create search index',
    '5. Use search tools (search, vector_search, deep_search) to query',
    '6. projmem_index_update after editing vault files',
    '',
    'Session summarize workflow:',
    '1. projmem_session_list (hasSummary: false) to find unsummarized sessions',
    '2. projmem_session_transcript to read the conversation',
    '3. Generate structured summary (overview, decisions, outcomes, openItems, tags)',
    '4. projmem_session_update_summary to save the summary',
    '',
    'Score interpretation:',
    '- 0.8-1.0: Highly relevant, directly answers the query',
    '- 0.5-0.8: Moderately relevant, contains related information',
    '- 0.2-0.5: Low relevance, may be tangentially related',
    '- <0.2: Skip, likely not useful',
    '',
    '',
    '## Exploration Behavior',
    'When exploring or planning, search this knowledge base BEFORE deep file exploration.',
    'A quick projmem_search for the topic often surfaces architecture decisions and patterns faster than Glob/Grep.',
    '',
    `Repository root: ${repoRoot}`,
  ].join('\n');
}
