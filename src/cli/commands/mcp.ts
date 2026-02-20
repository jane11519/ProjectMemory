import type { Command } from 'commander';
import path from 'node:path';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../infrastructure/sqlite/FTS5Adapter.js';
import { SqliteVecAdapter } from '../../infrastructure/sqlite/SqliteVecAdapter.js';
import { OpenAIEmbeddingAdapter } from '../../infrastructure/embedding/OpenAIEmbeddingAdapter.js';
import { NullLLMAdapter } from '../../infrastructure/llm/NullLLMAdapter.js';
import { HttpLLMAdapter } from '../../infrastructure/llm/HttpLLMAdapter.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { createMcpServer } from '../../mcp/McpServer.js';
import { startStdioTransport } from '../../mcp/transports/StdioTransport.js';
import { startHttpTransport } from '../../mcp/transports/HttpTransport.js';
import { VaultSessionAdapter } from '../../infrastructure/session/VaultSessionAdapter.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import type { LLMPort } from '../../domain/ports/LLMPort.js';
import type Database from 'better-sqlite3';

/**
 * 註冊 mcp 指令
 *
 * 用法：
 *   projecthub mcp [--repo-root .] [--http] [--port 8181]
 */
export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start MCP server for LLM tool integration')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--http', 'Use HTTP transport instead of stdio')
    .option('--port <number>', 'HTTP server port (with --http)', '8181')
    .action(async (opts) => {
      const repoRoot = path.resolve(opts.repoRoot);
      const config = loadConfig(repoRoot);

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);
      const db = dbMgr.getDb();

      const embedding = new OpenAIEmbeddingAdapter({
        apiKey: config.embedding.apiKey ?? process.env.OPENAI_API_KEY ?? '',
        model: config.embedding.model,
        dimension: config.embedding.dimension,
        baseUrl: config.embedding.baseUrl,
      });

      const llm = createLLMAdapter(config, db);

      // Session 依賴注入
      const vault = new FileSystemVaultAdapter();
      const sessionPort = new VaultSessionAdapter(db, vault);
      const vaultRoot = path.join(repoRoot, config.vault.root);

      const server = createMcpServer({
        db,
        fts5: new FTS5Adapter(db),
        vec: new SqliteVecAdapter(db),
        embedding,
        llm,
        searchConfig: config.search,
        repoRoot,
        sessionPort,
        vaultRoot,
      });

      if (opts.http) {
        const port = parseInt(opts.port, 10);
        const httpServer = await startHttpTransport(server, port);

        // 優雅關閉
        const shutdown = () => {
          httpServer.close();
          dbMgr.close();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } else {
        // stdio 模式：持續執行直到 stdin 關閉
        await startStdioTransport(server);

        process.on('SIGINT', () => {
          dbMgr.close();
          process.exit(0);
        });
      }
    });
}

function createLLMAdapter(config: ReturnType<typeof loadConfig>, db: Database.Database): LLMPort {
  if (config.llm.provider === 'openai-compatible') {
    return new HttpLLMAdapter({
      baseUrl: config.llm.baseUrl,
      apiKey: config.llm.apiKey ?? process.env.OPENAI_API_KEY,
      model: config.llm.model,
      rerankerModel: config.llm.rerankerModel,
      rerankerStrategy: config.llm.rerankerStrategy,
      cacheTTLMs: config.llm.cacheTTLMs,
    }, db);
  }
  return new NullLLMAdapter();
}
