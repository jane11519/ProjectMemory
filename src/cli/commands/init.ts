import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../../config/defaults.js';

/** init 指令的結果型別 */
interface InitResult {
  repoRoot: string;
  skillFilesCopied: number;
  skillFilesSkipped: number;
  settingsMerged: boolean;
  configCreated: boolean;
  mcpConfigured: boolean;
  vaultDirsCreated: number;
  dbInitialized: boolean;
  dbError?: string;
}

/** .mcp.json 的結構型別 */
interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}
interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** Claude Code hook handler（新格式） */
interface HookHandler {
  type: 'command';
  command: string;
  timeout?: number;
  async?: boolean;
}

/** Claude Code hook matcher group（新格式） */
interface HookMatcherGroup {
  matcher?: string;
  hooks: HookHandler[];
}

/** Claude Code settings.json 的結構 */
interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookMatcherGroup[];
    TaskCompleted?: HookMatcherGroup[];
    Stop?: HookMatcherGroup[];
    [key: string]: HookMatcherGroup[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * 從 import.meta.url 解析出 package root 下的 assets/skill/ 目錄
 * dist/cli/commands/init.js → 往上 3 層 → package root → assets/skill/
 */
function getAssetsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(thisFile), '..', '..', '..');
  return path.join(packageRoot, 'assets', 'skill');
}

/**
 * 遞迴複製目錄
 * @param src - 來源目錄
 * @param dest - 目標目錄
 * @param force - 是否覆寫已存在的檔案
 * @returns 複製與跳過的檔案數
 */
function copyDirRecursive(
  src: string,
  dest: string,
  force: boolean
): { copied: number; skipped: number } {
  let copied = 0;
  let skipped = 0;

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const sub = copyDirRecursive(srcPath, destPath, force);
      copied += sub.copied;
      skipped += sub.skipped;
    } else {
      if (!force && fs.existsSync(destPath)) {
        skipped++;
      } else {
        fs.copyFileSync(srcPath, destPath);
        copied++;
      }
    }
  }

  return { copied, skipped };
}

/**
 * ProjectHub 預設的 hook 定義
 * 使用 .claude/skills/projecthub/scripts/ 相對路徑
 */
function getDefaultHooks(): Required<NonNullable<ClaudeSettings['hooks']>> {
  return {
    PostToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [{
          type: 'command',
          command: 'bash .claude/skills/projecthub/scripts/track-dirty.sh "$TOOL_INPUT_FILE_PATH"',
          timeout: 5,
        }],
      },
    ],
    TaskCompleted: [
      {
        hooks: [{
          type: 'command',
          command: 'bash .claude/skills/projecthub/scripts/on-task-completed.sh',
          timeout: 120,
        }],
      },
    ],
    Stop: [
      {
        hooks: [{
          type: 'command',
          command: 'bash .claude/skills/projecthub/scripts/on-stop.sh',
          timeout: 60,
          async: true,
        }],
      },
    ],
  };
}

/**
 * 合併 hooks 到現有 settings，以 command 字串去重
 * 不會覆寫使用者已有的其他 hooks
 */
function mergeSettings(existing: ClaudeSettings): ClaudeSettings {
  const result = { ...existing };
  if (!result.hooks) {
    result.hooks = {};
  }

  const defaultHooks = getDefaultHooks();

  for (const [eventName, newGroups] of Object.entries(defaultHooks)) {
    if (!newGroups) continue;
    const existingGroups = result.hooks[eventName] ?? [];
    const merged = [...existingGroups];

    for (const group of newGroups) {
      const cmd = group.hooks[0]?.command;
      const alreadyExists = merged.some((g) =>
        g.hooks?.some((h) => h.command === cmd),
      );
      if (!alreadyExists) merged.push(group);
    }

    result.hooks[eventName] = merged;
  }

  return result;
}

/**
 * 條件建立 .projecthub.json（從 DEFAULT_CONFIG 程式化產生）
 * @returns 是否新建了設定檔
 */
function ensureProjectConfig(repoRoot: string): boolean {
  const configPath = path.join(repoRoot, '.projecthub.json');
  if (fs.existsSync(configPath)) {
    return false;
  }

  // 從 DEFAULT_CONFIG 精簡版寫入（省略可由 defaults 推導的欄位，保持可讀）
  const config = {
    version: DEFAULT_CONFIG.version,
    vault: DEFAULT_CONFIG.vault,
    index: DEFAULT_CONFIG.index,
    embedding: {
      provider: DEFAULT_CONFIG.embedding.provider,
      model: DEFAULT_CONFIG.embedding.model,
      dimension: DEFAULT_CONFIG.embedding.dimension,
      maxBatchSize: DEFAULT_CONFIG.embedding.maxBatchSize,
    },
    search: {
      defaultTopK: DEFAULT_CONFIG.search.defaultTopK,
      candidateMultiplier: DEFAULT_CONFIG.search.candidateMultiplier,
      weights: DEFAULT_CONFIG.search.weights,
      fts5FieldWeights: DEFAULT_CONFIG.search.fts5FieldWeights,
    },
    llm: {
      provider: DEFAULT_CONFIG.llm.provider,
      baseUrl: DEFAULT_CONFIG.llm.baseUrl,
      model: DEFAULT_CONFIG.llm.model,
      rerankerModel: '',
      cacheTTLMs: DEFAULT_CONFIG.llm.cacheTTLMs,
    },
    chunking: DEFAULT_CONFIG.chunking,
    session: DEFAULT_CONFIG.session,
    namespacePatterns: DEFAULT_CONFIG.namespacePatterns,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * 建立 vault 目錄結構
 * @returns 建立的目錄數
 */
function ensureVaultDirs(repoRoot: string): number {
  const vaultRoot = path.join(repoRoot, DEFAULT_CONFIG.vault.root);
  const dirs = [
    ...DEFAULT_CONFIG.vault.folders.map((f) => path.join(vaultRoot, f)),
    path.join(vaultRoot, '.projecthub'),
  ];

  let created = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created++;
    }
  }

  // 建立 vault/.gitignore（排除 DB 與暫存檔）
  const gitignorePath = path.join(vaultRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = [
      '# ProjectHub SQLite database and runtime artifacts',
      '.projecthub/index.db',
      '.projecthub/index.db-wal',
      '.projecthub/index.db-shm',
      '.projecthub/dirty-files.txt',
      '.projecthub/audit.log',
      '',
    ].join('\n');
    fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  }

  return created;
}

/**
 * 確保 .gitignore 包含指定項目（避免敏感檔案進版控）
 */
function ensureGitignoreEntry(repoRoot: string, entry: string): void {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.split('\n').some((line) => line.trim() === entry)) return;
    fs.appendFileSync(gitignorePath, `\n${entry}\n`, 'utf-8');
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
  }
}

/**
 * 確保目標專案的 .mcp.json 中包含 ProjectHub MCP server 設定
 * 若檔案不存在則建立，若已存在則 merge（不覆蓋使用者的其他 MCP servers）
 * @returns 是否有實際寫入變更
 */
function ensureMcpConfig(repoRoot: string): boolean {
  const mcpPath = path.join(repoRoot, '.mcp.json');
  const projecthubServer: McpServerEntry = {
    command: 'npx',
    args: ['-y', 'projecthub', 'mcp'],
    env: {
      OPENAI_API_KEY: '${OPENAI_API_KEY}',
      OPENAI_BASE_URL: '${OPENAI_BASE_URL}',
    },
  };

  let existing: McpConfig = {};
  if (fs.existsSync(mcpPath)) {
    const raw = fs.readFileSync(mcpPath, 'utf-8');
    existing = JSON.parse(raw) as McpConfig;
  }

  // 已有 projecthub 設定，不覆蓋
  if (existing.mcpServers?.projecthub) {
    return false;
  }

  const merged: McpConfig = {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      projecthub: projecthubServer,
    },
  };

  fs.writeFileSync(mcpPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  // 確保 .mcp.json 被 .gitignore 排除（含 API key，不應進版控）
  ensureGitignoreEntry(repoRoot, '.mcp.json');

  return true;
}

/**
 * 動態 import DatabaseManager 並初始化 SQLite DB
 * 失敗時只回傳錯誤訊息，不中斷流程
 */
async function initDatabase(repoRoot: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { DatabaseManager } = await import(
      '../../infrastructure/sqlite/DatabaseManager.js'
    );
    const dbPath = path.join(repoRoot, DEFAULT_CONFIG.index.dbPath);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseManager(dbPath);
    db.close();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unknown database error' };
  }
}

/** 格式化 init 結果為人類可讀文字 */
function formatTextResult(result: InitResult): string {
  const lines = [
    `ProjectHub initialized in: ${result.repoRoot}`,
    `Skill files installed: ${result.skillFilesCopied} file(s)${result.skillFilesSkipped > 0 ? ` (${result.skillFilesSkipped} skipped)` : ''}`,
    `Settings merged: ${result.settingsMerged ? 'yes' : 'no changes needed'}`,
    `Config created: ${result.configCreated ? 'yes (new .projecthub.json)' : 'already exists'}`,
    `MCP config: ${result.mcpConfigured ? 'yes (projecthub added to .mcp.json)' : 'already configured'}`,
    `Vault directories created: ${result.vaultDirsCreated}`,
    `Database initialized: ${result.dbInitialized ? 'yes' : `no (${result.dbError ?? 'skipped'})`}`,
    '',
    'Next steps:',
    '  1. Add Markdown notes to vault/code-notes/',
    '  2. Set OPENAI_API_KEY and OPENAI_BASE_URL in .mcp.json env field',
    '  3. Run: npx projecthub scan',
    '  4. Run: npx projecthub index build',
    '  5. Restart Claude Code to activate MCP server',
    '  6. Use /projecthub in Claude Code',
  ];
  return lines.join('\n');
}

/** 註冊 init 指令 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize ProjectHub skill in the target project')
    .option('--repo-root <path>', 'Target project root directory', '.')
    .option('--force', 'Overwrite existing skill files', false)
    .option('--skip-db', 'Skip database initialization', false)
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = path.resolve(opts.repoRoot);
      const force: boolean = opts.force;
      const skipDb: boolean = opts.skipDb;
      const format: string = opts.format;

      // 1. 複製 skill 檔案到 .claude/skills/projecthub/
      const assetsDir = getAssetsDir();
      if (!fs.existsSync(assetsDir)) {
        throw new Error(
          `Assets directory not found: ${assetsDir}. Ensure the package is installed correctly.`
        );
      }

      const skillDest = path.join(repoRoot, '.claude', 'skills', 'projecthub');
      const { copied, skipped } = copyDirRecursive(assetsDir, skillDest, force);

      // 2. 合併 .claude/settings.json
      const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
      let settingsMerged = false;

      let existingSettings: ClaudeSettings = {};
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        existingSettings = JSON.parse(raw) as ClaudeSettings;
      }

      const mergedSettings = mergeSettings(existingSettings);
      const mergedStr = JSON.stringify(mergedSettings, null, 2) + '\n';
      const existingStr = fs.existsSync(settingsPath)
        ? fs.readFileSync(settingsPath, 'utf-8')
        : '';

      if (mergedStr !== existingStr) {
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, mergedStr, 'utf-8');
        settingsMerged = true;
      }

      // 3. 建立 .projecthub.json
      const configCreated = ensureProjectConfig(repoRoot);

      // 4. 建立 vault 目錄結構
      const vaultDirsCreated = ensureVaultDirs(repoRoot);

      // 5. 確保 .mcp.json 包含 projecthub MCP server
      const mcpConfigured = ensureMcpConfig(repoRoot);

      // 6. 初始化資料庫
      let dbInitialized = false;
      let dbError: string | undefined;

      if (!skipDb) {
        const dbResult = await initDatabase(repoRoot);
        dbInitialized = dbResult.ok;
        dbError = dbResult.error;
      } else {
        dbError = 'skipped';
      }

      const result: InitResult = {
        repoRoot,
        skillFilesCopied: copied,
        skillFilesSkipped: skipped,
        settingsMerged,
        configCreated,
        mcpConfigured,
        vaultDirsCreated,
        dbInitialized,
        dbError,
      };

      if (format === 'json') {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(formatTextResult(result) + '\n');
      }
    });
}
