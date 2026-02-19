import { McpServer as SDKMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import type { FTS5Adapter } from '../infrastructure/sqlite/FTS5Adapter.js';
import type { SqliteVecAdapter } from '../infrastructure/sqlite/SqliteVecAdapter.js';
import type { EmbeddingPort } from '../domain/ports/EmbeddingPort.js';
import type { LLMPort } from '../domain/ports/LLMPort.js';
import type { SearchConfig } from '../config/types.js';
import { registerSearchTool } from './tools/SearchTool.js';
import { registerVectorSearchTool } from './tools/VectorSearchTool.js';
import { registerDeepSearchTool } from './tools/DeepSearchTool.js';
import { registerGetTool } from './tools/GetTool.js';
import { registerMultiGetTool } from './tools/MultiGetTool.js';
import { registerStatusTool } from './tools/StatusTool.js';

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
}

export function createMcpServer(deps: McpDependencies): SDKMcpServer {
  const server = new SDKMcpServer({
    name: 'projecthub',
    version: '0.1.0',
  });

  registerSearchTool(server, deps);
  registerVectorSearchTool(server, deps);
  registerDeepSearchTool(server, deps);
  registerGetTool(server, deps);
  registerMultiGetTool(server, deps);
  registerStatusTool(server, deps);

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
    '',
    'Recommended workflow:',
    '1. Start with projecthub_search for known keywords/terms',
    '2. Use projecthub_vector_search for conceptual/semantic queries',
    '3. Use projecthub_deep_search for complex research tasks',
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
