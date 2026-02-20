import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchUseCase } from '../../application/SearchUseCase.js';
import type { McpDependencies } from '../McpServer.js';

/**
 * MCP Tool: projmem_vector_search
 * 對應 CLI: projmem search --mode vec_only
 * 語意向量搜尋，適合概念性和語意相似的查詢。
 */
export function registerVectorSearchTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_vector_search',
    'Semantic vector search for conceptual/meaning-based queries',
    {
      query: z.string().describe('Search query (semantic meaning is used)'),
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
        mode: 'vec_only',
      });

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

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
