import type { Command } from 'commander';
import path from 'node:path';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { ContextUseCase } from '../../application/ContextUseCase.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { ProgressiveDisclosureFormatter } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { OutputFormat } from '../formatters/ProgressiveDisclosureFormatter.js';

/**
 * 註冊 context 指令群組
 *
 * 用法：
 *   projmem context add <path> <description>
 *   projmem context list
 *   projmem context check <path>
 *   projmem context rm <path>
 */
export function registerContextCommand(program: Command): void {
  const contextCmd = program
    .command('context')
    .description('Manage hierarchical context metadata');

  contextCmd
    .command('add <virtualPath> <description>')
    .description('Add or update context for a virtual path')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action((virtualPath: string, description: string, opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = new ContextUseCase(dbMgr.getDb());
        const context = useCase.addContext(virtualPath, description);

        process.stdout.write(formatter.formatObject({
          action: 'added',
          contextId: context.contextId,
          virtualPath: context.virtualPath,
          description: context.description,
        }, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });

  contextCmd
    .command('list')
    .description('List all contexts')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action((opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = new ContextUseCase(dbMgr.getDb());
        const contexts = useCase.listContexts();

        process.stdout.write(formatter.formatObject({
          totalContexts: contexts.length,
          contexts: contexts.map((c) => ({
            virtualPath: c.virtualPath,
            description: c.description,
          })),
        }, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });

  contextCmd
    .command('check <virtualPath>')
    .description('Check applicable contexts for a path (includes ancestors)')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action((virtualPath: string, opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = new ContextUseCase(dbMgr.getDb());
        const contexts = useCase.checkContext(virtualPath);

        process.stdout.write(formatter.formatObject({
          path: virtualPath,
          applicableContexts: contexts.map((c) => ({
            virtualPath: c.virtualPath,
            description: c.description,
          })),
        }, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });

  contextCmd
    .command('rm <virtualPath>')
    .description('Remove context for a virtual path')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .action((virtualPath: string, opts) => {
      const repoRoot = opts.repoRoot;
      const config = loadConfig(repoRoot);

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = new ContextUseCase(dbMgr.getDb());
        const removed = useCase.removeContext(virtualPath);

        if (removed) {
          process.stdout.write(`Context "${virtualPath}" removed.\n`);
        } else {
          process.stderr.write(`Context "${virtualPath}" not found.\n`);
          process.exitCode = 1;
        }
      } finally {
        dbMgr.close();
      }
    });
}
