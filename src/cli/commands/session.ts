import type { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionUseCase } from '../../application/SessionUseCase.js';
import { VaultSessionAdapter } from '../../infrastructure/session/VaultSessionAdapter.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { DatabaseManager } from '../../infrastructure/sqlite/DatabaseManager.js';
import { parseTranscript } from '../../infrastructure/session/TranscriptParser.js';
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

  sessionCmd
    .command('capture')
    .description('Capture current conversation transcript into session')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = path.resolve(opts.repoRoot);
      const format: OutputFormat = opts.format;
      const formatter = new ProgressiveDisclosureFormatter();

      // 1. 找到最新的 JSONL transcript
      const claudeDir = getClaudeProjectDataDir(repoRoot);
      const transcriptPath = findLatestTranscript(claudeDir);
      if (!transcriptPath) {
        // 不是所有環境都有 transcript，靜默退出
        if (format === 'json') {
          process.stdout.write(JSON.stringify({ skipped: true, reason: 'no transcript found' }) + '\n');
        }
        return;
      }

      // 2. 讀取並解析 transcript
      const jsonlContent = fs.readFileSync(transcriptPath, 'utf-8');
      const summary = parseTranscript(jsonlContent);

      if (summary.turnCount === 0) {
        if (format === 'json') {
          process.stdout.write(JSON.stringify({ skipped: true, reason: 'empty transcript' }) + '\n');
        }
        return;
      }

      // 3. 複製原始 JSONL 到 vault/.projmem/transcripts/
      const config = loadConfig(repoRoot);
      const transcriptsDir = path.join(repoRoot, config.vault.root, '.projmem', 'transcripts');
      const backupPath = path.join(transcriptsDir, `${summary.sessionId}.jsonl`);

      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(transcriptsDir, { recursive: true });
        fs.copyFileSync(transcriptPath, backupPath);
      }

      // 4. 建構 rolling summary：擷取前幾回合文字（上限 2000 字元）
      const rollingSummary = buildRollingSummary(summary.turns);

      // 5. 存入 DB + 寫 markdown
      const dbPath = path.join(repoRoot, config.index.dbPath);
      const sessionsDir = path.join(repoRoot, config.vault.root, 'sessions');
      const dbMgr = new DatabaseManager(dbPath, config.embedding.dimension);

      try {
        const useCase = createSessionUseCase(dbMgr, sessionsDir);
        const session = await useCase.save({
          sessionId: summary.sessionId,
          projectDir: repoRoot,
          turnCount: summary.turnCount,
          rollingSummary,
          decisions: [],
          searchFootprint: summary.toolsUsed,
          status: 'active',
        });

        process.stdout.write(formatter.formatObject(session, format) + '\n');
      } finally {
        dbMgr.close();
      }
    });
}

/** 從 repoRoot 推導 Claude Code 的專案資料目錄 */
export function getClaudeProjectDataDir(repoRoot: string): string {
  const resolved = path.resolve(repoRoot);
  // Windows: D:\foo → D--foo, Unix: /home/foo → -home-foo
  const encoded = resolved.replace(/:/g, '-').replace(/[\\/]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

/** 找最近修改的 JSONL transcript */
export function findLatestTranscript(claudeProjectDir: string): string | undefined {
  if (!fs.existsSync(claudeProjectDir)) return undefined;

  const files = fs.readdirSync(claudeProjectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(claudeProjectDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files[0] ? path.join(claudeProjectDir, files[0].name) : undefined;
}

/**
 * 從對話回合建構可讀的 rolling summary
 * 保留所有回合文字，不設字數上限
 */
function buildRollingSummary(
  turns: Array<{ role: string; text: string }>,
): string {
  const lines: string[] = [];

  for (const turn of turns) {
    if (!turn.text) continue;
    const prefix = turn.role === 'user' ? '**User**' : '**Assistant**';
    lines.push(`${prefix}: ${turn.text}`);
  }

  return lines.join('\n');
}

/** 建立 SessionUseCase 所需的依賴 */
function createSessionUseCase(dbMgr: DatabaseManager, sessionsDir: string): SessionUseCase {
  const vault = new FileSystemVaultAdapter();
  const adapter = new VaultSessionAdapter(dbMgr.getDb(), vault);
  return new SessionUseCase(adapter, sessionsDir);
}
