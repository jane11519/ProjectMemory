import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchUseCase } from '../../application/SearchUseCase.js';
import type { McpDependencies } from '../McpServer.js';

/**
 * MCP Tool: projmem_search
 * 對應 CLI: projmem search <query>
 * BM25 關鍵字搜尋，適合精確匹配和已知術語。
 */
export function registerSearchTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_search',
    'BM25 keyword search for exact term matches in the knowledge base',
    {
      query: z.string().describe('Search query string'),
      topK: z.number().optional().default(10).describe('Number of results to return'),
      namespaceId: z.number().optional().describe('Filter by namespace ID'),
    },
    async ({ query, topK, namespaceId }) => {
      const useCase = new SearchUseCase(
        deps.db, deps.fts5, deps.vec, deps.embedding,
        deps.llm, deps.searchConfig,
      );

      const response = await useCase.search({
        query,
        topK,
        namespaceId,
        mode: 'bm25_only',
      });

      return {
        content: [{
          type: 'text' as const,
          text: formatSearchResponse(response),
        }],
      };
    },
  );
}

function formatSearchResponse(response: any): string {
  const lines: string[] = [];
  lines.push(`Found ${response.results.length} results (mode: ${response.searchMode}, ${response.durationMs}ms)`);

  if (response.warnings.length > 0) {
    lines.push(`Warnings: ${response.warnings.join('; ')}`);
  }

  lines.push('');
  for (const r of response.results) {
    lines.push(`[#${r.chunkId}] ${r.title} — ${r.headingPath || '(root)'}`);
    lines.push(`  Score: ${r.finalScore.toFixed(4)} | ${r.docPath}:${r.startLine}-${r.endLine}`);
    if (r.snippet) lines.push(`  ${r.snippet}`);
    lines.push('');
  }

  return lines.join('\n');
}
