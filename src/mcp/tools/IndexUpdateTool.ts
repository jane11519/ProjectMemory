import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpDependencies } from '../McpServer.js';
import { IndexUseCase } from '../../application/IndexUseCase.js';
import { MarkdownParser } from '../../infrastructure/vault/MarkdownParser.js';
import { ChunkingStrategy } from '../../infrastructure/vault/ChunkingStrategy.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { loadConfig } from '../../config/ConfigLoader.js';

/**
 * MCP Tool: projmem_index_update
 * 增量更新索引（只處理 dirty files）。
 */
export function registerIndexUpdateTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_index_update',
    'Incremental index update for dirty/changed files only',
    {},
    async () => {
      try {
        const config = loadConfig(deps.repoRoot);
        const dirtyFilePath = path.join(deps.repoRoot, config.index.dirtyFilePath);

        const mdParser = new MarkdownParser();
        const chunker = new ChunkingStrategy(config.chunking.splitThresholdTokens);
        const vault = new FileSystemVaultAdapter();
        const useCase = new IndexUseCase(
          deps.db, deps.fts5, deps.vec,
          mdParser, chunker, vault, deps.embedding,
        );

        const stats = await useCase.buildIncremental(
          deps.repoRoot,
          config.vault.root,
          dirtyFilePath,
        );

        const lines = [
          '# Index Update Complete',
          '',
          `Documents processed: ${stats.docsProcessed}`,
          `Documents skipped (unchanged): ${stats.docsSkipped}`,
          `Documents deleted: ${stats.docsDeleted}`,
          `Chunks created: ${stats.chunksCreated}`,
          `FTS5 rows: ${stats.ftsRowsInserted}`,
          `Vector rows: ${stats.vecRowsInserted}`,
          `Duration: ${stats.durationMs}ms`,
        ];

        if (stats.embeddingFailed) {
          lines.push('', 'Warning: Embedding failed — FTS5 index still available for BM25 search.');
        }

        if (stats.warnings.length > 0) {
          lines.push('', '## Warnings');
          for (const w of stats.warnings) {
            lines.push(`  - ${w}`);
          }
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Index update failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
