import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpDependencies } from '../McpServer.js';
import { IndexUseCase } from '../../application/IndexUseCase.js';
import { MarkdownParser } from '../../infrastructure/vault/MarkdownParser.js';
import { ChunkingStrategy } from '../../infrastructure/vault/ChunkingStrategy.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { loadConfig } from '../../config/ConfigLoader.js';

/**
 * MCP Tool: projmem_index_build
 * 全量重建索引（FTS5 + vec0）。
 * 複用 deps 中已有的 db/fts5/vec/embedding。
 */
export function registerIndexBuildTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_index_build',
    'Full rebuild of the search index from all markdown files',
    {},
    async () => {
      try {
        const config = loadConfig(deps.repoRoot);

        // 確保 root namespace 存在
        ensureRootNamespace(deps.db);

        const mdParser = new MarkdownParser();
        const chunker = new ChunkingStrategy(config.chunking.splitThresholdTokens);
        const vault = new FileSystemVaultAdapter();
        const useCase = new IndexUseCase(
          deps.db, deps.fts5, deps.vec,
          mdParser, chunker, vault, deps.embedding,
        );

        const stats = await useCase.buildFull(
          deps.repoRoot,
          config.vault.root,
          config.vault.folders,
        );

        const lines = [
          '# Index Build Complete',
          '',
          `Documents processed: ${stats.docsProcessed}`,
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
          content: [{ type: 'text' as const, text: `Index build failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}

/** 確保 root namespace 已存在（避免從 CLI commands 引入 DatabaseManager 依賴） */
function ensureRootNamespace(db: import('better-sqlite3').Database): void {
  const existing = db.prepare("SELECT namespace_id FROM namespaces WHERE name = 'root'").get();
  if (!existing) {
    db.prepare(
      "INSERT INTO namespaces(name, kind, discovered_at) VALUES('root', 'root', ?)",
    ).run(Date.now());
  }
}
