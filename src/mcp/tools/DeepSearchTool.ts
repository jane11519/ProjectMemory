import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchUseCase } from '../../application/SearchUseCase.js';
import type { McpDependencies } from '../McpServer.js';

/**
 * MCP Tool: projmem_deep_search
 * 對應 CLI: projmem search --mode deep
 * 完整搜尋管線：Query Expansion + RRF 融合 + LLM Re-ranking。
 */
export function registerDeepSearchTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_deep_search',
    'Full search pipeline with query expansion, RRF fusion, and LLM re-ranking',
    {
      query: z.string().describe('Search query string'),
      topK: z.number().optional().default(10).describe('Number of results to return'),
      namespaceId: z.number().optional().describe('Filter by namespace ID'),
      skipExpansion: z.boolean().optional().default(false).describe('Skip query expansion'),
      skipReranking: z.boolean().optional().default(false).describe('Skip LLM re-ranking'),
    },
    async ({ query, topK, namespaceId, skipExpansion, skipReranking }) => {
      const useCase = new SearchUseCase(
        deps.db, deps.fts5, deps.vec, deps.embedding,
        deps.llm, deps.searchConfig,
      );

      const response = await useCase.search({
        query,
        topK,
        namespaceId,
        mode: 'deep',
        skipExpansion,
        skipReranking,
      });

      const lines: string[] = [];
      lines.push(`Found ${response.results.length} results (mode: ${response.searchMode}, ${response.durationMs}ms)`);

      if (response.expandedQueries && response.expandedQueries.length > 0) {
        lines.push(`Expanded queries: ${response.expandedQueries.join(' | ')}`);
      }
      if (response.strongSignalDetected) {
        lines.push('Strong signal detected (expansion skipped)');
      }
      if (response.rerankApplied) {
        lines.push('LLM re-ranking applied');
      }
      if (response.warnings.length > 0) {
        lines.push(`Warnings: ${response.warnings.join('; ')}`);
      }

      lines.push('');
      for (const r of response.results) {
        lines.push(`[#${r.chunkId}] ${r.title} — ${r.headingPath || '(root)'}`);
        const scores = [`score: ${r.finalScore.toFixed(4)}`];
        if (r.rrfScore !== undefined) scores.push(`rrf: ${r.rrfScore.toFixed(4)}`);
        if (r.rerankerScore !== undefined) scores.push(`reranker: ${r.rerankerScore.toFixed(4)}`);
        lines.push(`  ${scores.join(' | ')} | ${r.docPath}:${r.startLine}-${r.endLine}`);
        if (r.snippet) lines.push(`  ${r.snippet}`);
        lines.push('');
      }

      if (response.pipelineStages) {
        lines.push('Pipeline stages:');
        for (const stage of response.pipelineStages) {
          const status = stage.skipped ? `skipped (${stage.skipReason})` : `${stage.durationMs}ms`;
          lines.push(`  ${stage.name}: ${status}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
