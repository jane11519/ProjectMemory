import type { Command } from 'commander';
import path from 'node:path';
import { HealthCheckUseCase } from '../../application/HealthCheckUseCase.js';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../infrastructure/sqlite/FTS5Adapter.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { ProgressiveDisclosureFormatter } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { OutputFormat } from '../formatters/ProgressiveDisclosureFormatter.js';

/** 註冊 health 指令 */
export function registerHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Check index health and consistency')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--fix', 'Attempt to fix issues', false)
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const db = dbMgr.getDb();
        const fts5 = new FTS5Adapter(db);
        const useCase = new HealthCheckUseCase(db, fts5);

        const report = useCase.check({ fix: opts.fix });

        process.stdout.write(formatter.formatObject(report, format) + '\n');
        process.exitCode = report.healthy ? 0 : 1;
      } finally {
        dbMgr.close();
      }
    });
}
