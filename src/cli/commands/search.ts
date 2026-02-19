import type { Command } from 'commander';
import path from 'node:path';
import { SearchUseCase } from '../../application/SearchUseCase.js';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../infrastructure/sqlite/FTS5Adapter.js';
import { SqliteVecAdapter } from '../../infrastructure/sqlite/SqliteVecAdapter.js';
import { OpenAIEmbeddingAdapter } from '../../infrastructure/embedding/OpenAIEmbeddingAdapter.js';
import { NullLLMAdapter } from '../../infrastructure/llm/NullLLMAdapter.js';
import { HttpLLMAdapter } from '../../infrastructure/llm/HttpLLMAdapter.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { ProgressiveDisclosureFormatter } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { OutputFormat, DetailLevel } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { LLMPort } from '../../domain/ports/LLMPort.js';
import type Database from 'better-sqlite3';

/** 註冊 search 指令群組 */
export function registerSearchCommand(program: Command): void {
  const searchCmd = program
    .command('search')
    .description('Search the knowledge base');

  // 主搜尋指令（預設子指令）
  searchCmd
    .argument('<query>', 'Search query')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--top-k <number>', 'Number of results to return', '10')
    .option('--namespace <id>', 'Filter by namespace ID')
    .option('--mode <mode>', 'Search mode: hybrid, bm25_only, vec_only, deep', 'hybrid')
    .option('--level <level>', 'Detail level: brief, normal, full', 'normal')
    .option('--format <format>', 'Output format: json or text', 'text')
    .option('--skip-expansion', 'Skip query expansion in deep mode')
    .option('--skip-reranking', 'Skip LLM re-ranking in deep mode')
    .action(async (query: string, opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const level: DetailLevel = opts.level;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = createSearchUseCase(dbMgr, config);
        const response = await useCase.search({
          query,
          topK: parseInt(opts.topK, 10),
          namespaceId: opts.namespace ? parseInt(opts.namespace, 10) : undefined,
          mode: opts.mode,
          skipExpansion: opts.skipExpansion ?? false,
          skipReranking: opts.skipReranking ?? false,
        });

        if (response.warnings.length > 0) {
          process.stderr.write(response.warnings.map((w) => `Warning: ${w}`).join('\n') + '\n');
        }

        process.stdout.write(
          formatter.formatSearchResults(response.results, format, level) + '\n',
        );
      } finally {
        dbMgr.close();
      }
    });

  // expand 子指令：展開單一 chunk 的完整文字
  searchCmd
    .command('expand <chunkId>')
    .description('Expand a chunk to show its full text')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (chunkIdStr: string, opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const db = dbMgr.getDb();
        const chunkId = parseInt(chunkIdStr, 10);

        const row = db.prepare(`
          SELECT c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
                 d.doc_path, d.title, n.name AS namespace_name
          FROM chunks c
          JOIN docs d ON c.doc_id = d.doc_id
          JOIN namespaces n ON d.namespace_id = n.namespace_id
          WHERE c.chunk_id = ?
        `).get(chunkId) as any;

        if (!row) {
          process.stderr.write(`Chunk ${chunkId} not found.\n`);
          process.exitCode = 1;
          return;
        }

        const result = {
          chunkId: row.chunk_id,
          docPath: row.doc_path,
          title: row.title,
          headingPath: row.heading_path,
          startLine: row.start_line,
          endLine: row.end_line,
          namespaceName: row.namespace_name,
          text: row.text,
        };

        process.stdout.write(formatter.formatObject(result, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });

  // full 子指令：顯示整份文件的所有 chunks
  searchCmd
    .command('full <docPath>')
    .description('Show all chunks of a document')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (docPath: string, opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const db = dbMgr.getDb();
        const rows = db.prepare(`
          SELECT c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
                 d.doc_path, d.title, n.name AS namespace_name
          FROM chunks c
          JOIN docs d ON c.doc_id = d.doc_id
          JOIN namespaces n ON d.namespace_id = n.namespace_id
          WHERE d.doc_path = ?
          ORDER BY c.chunk_index
        `).all(docPath) as any[];

        if (rows.length === 0) {
          process.stderr.write(`Document "${docPath}" not found.\n`);
          process.exitCode = 1;
          return;
        }

        const chunks = rows.map((row) => ({
          chunkId: row.chunk_id,
          headingPath: row.heading_path,
          startLine: row.start_line,
          endLine: row.end_line,
          text: row.text,
        }));

        const result = {
          docPath: rows[0].doc_path,
          title: rows[0].title,
          namespaceName: rows[0].namespace_name,
          totalChunks: chunks.length,
          chunks,
        };

        process.stdout.write(formatter.formatObject(result, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });
}

/** 根據設定建構 LLM adapter */
function createLLMAdapter(config: ReturnType<typeof loadConfig>, db?: Database.Database): LLMPort {
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

/** 建立 SearchUseCase 所需的依賴 */
function createSearchUseCase(dbMgr: DatabaseManager, config: ReturnType<typeof loadConfig>): SearchUseCase {
  const db = dbMgr.getDb();
  const llm = createLLMAdapter(config, db);

  return new SearchUseCase(
    db,
    new FTS5Adapter(db),
    new SqliteVecAdapter(db),
    new OpenAIEmbeddingAdapter({
      apiKey: config.embedding.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      model: config.embedding.model,
      dimension: config.embedding.dimension,
      baseUrl: config.embedding.baseUrl,
    }),
    llm,
    config.search,
  );
}
