import type { Command } from 'commander';
import path from 'node:path';
import { SessionUseCase } from '../../application/SessionUseCase.js';
import { VaultSessionAdapter } from '../../infrastructure/session/VaultSessionAdapter.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { ProgressiveDisclosureFormatter } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { OutputFormat } from '../formatters/ProgressiveDisclosureFormatter.js';

/** 註冊 session 指令群組 */
export function registerSessionCommand(program: Command): void {
  const sessionCmd = program
    .command('session')
    .description('Manage session state');

  sessionCmd
    .command('save')
    .description('Save current session state')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--session-id <id>', 'Session ID', `session-${Date.now()}`)
    .option('--project-dir <path>', 'Project directory')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const sessionsDir = path.join(repoRoot, config.vault.root, 'sessions');
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = createSessionUseCase(dbMgr, sessionsDir);
        const session = await useCase.save({
          sessionId: opts.sessionId,
          projectDir: opts.projectDir ?? repoRoot,
          turnCount: 0,
          rollingSummary: '',
          decisions: [],
          searchFootprint: [],
          status: 'active',
        });

        process.stdout.write(formatter.formatObject(session, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });

  sessionCmd
    .command('compact')
    .description('Compact session rolling summary')
    .requiredOption('--session-id <id>', 'Session ID to compact')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const sessionsDir = path.join(repoRoot, config.vault.root, 'sessions');
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = createSessionUseCase(dbMgr, sessionsDir);
        const result = await useCase.compact(opts.sessionId);

        if (!result) {
          process.stderr.write(`Session "${opts.sessionId}" not found.\n`);
          process.exitCode = 1;
          return;
        }

        process.stdout.write(formatter.formatObject(result, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });

  sessionCmd
    .command('list')
    .description('List active sessions')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);
      const formatter = new ProgressiveDisclosureFormatter();

      const dbPath = path.join(repoRoot, config.index.dbPath);
      const sessionsDir = path.join(repoRoot, config.vault.root, 'sessions');
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = createSessionUseCase(dbMgr, sessionsDir);
        const sessions = useCase.listActive();

        process.stdout.write(formatter.formatObject({ sessions, count: sessions.length }, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });
}

/** 建立 SessionUseCase 所需的依賴 */
function createSessionUseCase(dbMgr: DatabaseManager, sessionsDir: string): SessionUseCase {
  const vault = new FileSystemVaultAdapter();
  const adapter = new VaultSessionAdapter(dbMgr.getDb(), vault);
  return new SessionUseCase(adapter, sessionsDir);
}
