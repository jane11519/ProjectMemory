import type { Command } from 'commander';
import path from 'node:path';
import { IndexUseCase } from '../../application/IndexUseCase.js';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../infrastructure/sqlite/FTS5Adapter.js';
import { SqliteVecAdapter } from '../../infrastructure/sqlite/SqliteVecAdapter.js';
import { MarkdownParser } from '../../infrastructure/vault/MarkdownParser.js';
import { ChunkingStrategy } from '../../infrastructure/vault/ChunkingStrategy.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { OpenAIEmbeddingAdapter } from '../../infrastructure/embedding/OpenAIEmbeddingAdapter.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { ProgressiveDisclosureFormatter } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { OutputFormat } from '../formatters/ProgressiveDisclosureFormatter.js';

/** 註冊 index 指令群組 */
export function registerIndexCommand(program: Command): void {
  const indexCmd = program
    .command('index')
    .description('Manage search index');

  indexCmd
    .command('build')
    .description('Full rebuild of the search index')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        // 確保 root namespace 存在
        ensureRootNamespace(dbMgr);

        const useCase = createIndexUseCase(dbMgr, config);
        const stats = await useCase.buildFull(
          repoRoot,
          config.vault.root,
          config.vault.folders,
        );

        process.stdout.write(formatter.formatObject(stats, format) + '\n');
        process.exitCode = stats.embeddingFailed ? 1 : 0;
      } finally {
        dbMgr.close();
      }
    });

  indexCmd
    .command('update')
    .description('Incremental index update for dirty files')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--dirty-file <path>', 'Path to dirty files list')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dirtyFilePath = opts.dirtyFile ?? path.join(repoRoot, config.index.dirtyFilePath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = createIndexUseCase(dbMgr, config);
        const stats = await useCase.buildIncremental(
          repoRoot,
          config.vault.root,
          dirtyFilePath,
        );

        process.stdout.write(formatter.formatObject(stats, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });
}

/** 建立 IndexUseCase 所需的所有依賴 */
function createIndexUseCase(dbMgr: DatabaseManager, config: ReturnType<typeof loadConfig>): IndexUseCase {
  const db = dbMgr.getDb();
  const fts5 = new FTS5Adapter(db);
  const vec = new SqliteVecAdapter(db);
  const mdParser = new MarkdownParser();
  const chunker = new ChunkingStrategy();
  const vault = new FileSystemVaultAdapter();
  const embedding = new OpenAIEmbeddingAdapter({
    apiKey: config.embedding.apiKey ?? process.env.OPENAI_API_KEY ?? '',
    model: config.embedding.model,
    dimension: config.embedding.dimension,
    baseUrl: config.embedding.baseUrl,
  });

  return new IndexUseCase(db, fts5, vec, mdParser, chunker, vault, embedding);
}

/** 確保 root namespace 已存在 */
export function ensureRootNamespace(dbMgr: DatabaseManager): void {
  const db = dbMgr.getDb();
  const existing = db.prepare("SELECT namespace_id FROM namespaces WHERE name = 'root'").get();
  if (!existing) {
    db.prepare(
      "INSERT INTO namespaces(name, kind, discovered_at) VALUES('root', 'root', ?)"
    ).run(Date.now());
  }
}
