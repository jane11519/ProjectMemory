import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../../config/defaults.js';

/** init 指令的結果型別 */
export interface InitResult {
  repoRoot: string;
  pluginFilesCopied: number;
  pluginFilesSkipped: number;
  pluginRegistered: boolean;
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
export interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookMatcherGroup[];
    TaskCompleted?: HookMatcherGroup[];
    Stop?: HookMatcherGroup[];
    [key: string]: HookMatcherGroup[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * 從 import.meta.url 解析出 package root 下的 assets/plugin/ 目錄
 * dist/cli/commands/init.js → 往上 3 層 → package root → assets/plugin/
 */
export function getAssetsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(thisFile), '..', '..', '..');
  return path.join(packageRoot, 'assets', 'plugin');
}

/**
 * 遞迴複製目錄
 * @param src - 來源目錄
 * @param dest - 目標目錄
 * @param force - 是否覆寫已存在的檔案
 * @returns 複製與跳過的檔案數
 */
export function copyDirRecursive(
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

/** 舊版 hook 的 command 前綴（用於遷移偵測） */
const LEGACY_HOOK_PREFIX = 'bash .claude/skills/projecthub/scripts/';

/**
 * projmem 預設的 hook 定義
 * 使用 .claude/plugins/projmem/scripts/ 相對路徑
 */
function getDefaultHooks(): Required<NonNullable<ClaudeSettings['hooks']>> {
  return {
    PostToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [{
          type: 'command',
          command: 'bash .claude/plugins/projmem/scripts/track-dirty.sh "$TOOL_INPUT_FILE_PATH"',
          timeout: 5,
        }],
      },
    ],
    TaskCompleted: [
      {
        hooks: [{
          type: 'command',
          command: 'bash .claude/plugins/projmem/scripts/on-task-completed.sh',
          timeout: 120,
        }],
      },
    ],
    Stop: [
      {
        hooks: [{
          type: 'command',
          command: 'bash .claude/plugins/projmem/scripts/on-stop.sh',
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
 * 自動遷移舊版 .claude/skills/projecthub/ 路徑
 */
export function mergeSettings(existing: ClaudeSettings): ClaudeSettings {
  const result = { ...existing };
  if (!result.hooks) {
    result.hooks = {};
  }

  // 遷移舊版 hook 路徑
  migrateLegacyHookPaths(result.hooks);

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
 * 將舊版 .claude/skills/projecthub/scripts/ 路徑遷移為
 * .claude/plugins/projmem/scripts/
 */
function migrateLegacyHookPaths(hooks: NonNullable<ClaudeSettings['hooks']>): void {
  const OLD_PLUGIN_PREFIX = 'bash .claude/plugins/projecthub/scripts/';
  const NEW_PREFIX = 'bash .claude/plugins/projmem/scripts/';
  for (const groups of Object.values(hooks)) {
    if (!groups) continue;
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        if (hook.command?.startsWith(LEGACY_HOOK_PREFIX)) {
          hook.command = hook.command.replace(LEGACY_HOOK_PREFIX, NEW_PREFIX);
        } else if (hook.command?.startsWith(OLD_PLUGIN_PREFIX)) {
          hook.command = hook.command.replace(OLD_PLUGIN_PREFIX, NEW_PREFIX);
        }
      }
    }
  }
}

/**
 * 條件建立 .projmem.json（從 DEFAULT_CONFIG 程式化產生）
 * @returns 是否新建了設定檔
 */
export function ensureProjectConfig(repoRoot: string): boolean {
  const configPath = path.join(repoRoot, '.projmem.json');
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
export function ensureVaultDirs(repoRoot: string): number {
  const vaultRoot = path.join(repoRoot, DEFAULT_CONFIG.vault.root);
  const dirs = [
    ...DEFAULT_CONFIG.vault.folders.map((f) => path.join(vaultRoot, f)),
    path.join(vaultRoot, '.projmem'),
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
      '# projmem SQLite database and runtime artifacts',
      '.projmem/index.db',
      '.projmem/index.db-wal',
      '.projmem/index.db-shm',
      '.projmem/dirty-files.txt',
      '.projmem/audit.log',
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
 * 確保目標專案的 .mcp.json 中包含 projmem MCP server 設定
 * 若檔案不存在則建立，若已存在則 merge（不覆蓋使用者的其他 MCP servers）
 * @returns 是否有實際寫入變更
 */
export function ensureMcpConfig(repoRoot: string): boolean {
  const mcpPath = path.join(repoRoot, '.mcp.json');
  const projmemServer: McpServerEntry = {
    command: 'npx',
    args: ['-y', 'projmem', 'mcp'],
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

  // 已有 projmem 設定，不覆蓋
  if (existing.mcpServers?.projmem) {
    return false;
  }

  const merged: McpConfig = {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      projmem: projmemServer,
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
export async function initDatabase(repoRoot: string): Promise<{ ok: boolean; error?: string }> {
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
export function formatTextResult(result: InitResult): string {
  const lines = [
    `projmem initialized in: ${result.repoRoot}`,
    `Plugin files installed: ${result.pluginFilesCopied} file(s)${result.pluginFilesSkipped > 0 ? ` (${result.pluginFilesSkipped} skipped)` : ''}`,
    `Plugin registered: ${result.pluginRegistered ? 'yes' : 'already registered'}`,
    `Settings merged: ${result.settingsMerged ? 'yes' : 'no changes needed'}`,
    `Config created: ${result.configCreated ? 'yes (new .projmem.json)' : 'already exists'}`,
    `MCP config: ${result.mcpConfigured ? 'yes (projmem added to .mcp.json)' : 'already configured'}`,
    `Vault directories created: ${result.vaultDirsCreated}`,
    `Database initialized: ${result.dbInitialized ? 'yes' : `no (${result.dbError ?? 'skipped'})`}`,
    '',
    'Next steps:',
    '  1. Add Markdown notes to vault/code-notes/',
    '  2. Set OPENAI_API_KEY and OPENAI_BASE_URL in .mcp.json env field',
    '  3. Run: npx projmem scan',
    '  4. Run: npx projmem index build',
    '  5. Restart Claude Code to activate MCP server',
    '  6. Use projmem_search / projmem_deep_search MCP tools in Claude Code',
  ];
  return lines.join('\n');
}

/** installed_plugins.json 的結構型別 */
interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, InstalledPluginEntry[]>;
}

interface InstalledPluginEntry {
  scope: 'user' | 'local';
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
}

/**
 * 取得 Claude Code 的 installed_plugins.json 路徑
 * 跨平台支援：Windows → %APPDATA%/claude/plugins/
 *              macOS/Linux → ~/.claude/plugins/
 */
function getInstalledPluginsPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return path.join(home, '.claude', 'plugins', 'installed_plugins.json');
}

/**
 * 將 plugin 註冊到 Claude Code 的 installed_plugins.json
 * 以 local scope 安裝，綁定特定 projectPath
 * @returns 是否成功註冊（false = 已存在或寫入失敗）
 */
export function registerPlugin(repoRoot: string, pluginInstallPath: string): boolean {
  const pluginsPath = getInstalledPluginsPath();
  const pluginKey = 'projmem@local';
  const absoluteInstallPath = path.resolve(pluginInstallPath);
  const absoluteRepoRoot = path.resolve(repoRoot);

  try {
    let data: InstalledPluginsFile = { version: 2, plugins: {} };
    if (fs.existsSync(pluginsPath)) {
      data = JSON.parse(fs.readFileSync(pluginsPath, 'utf-8')) as InstalledPluginsFile;
    }

    const entries = data.plugins[pluginKey] ?? [];

    // 檢查是否已有此 project 的 local 安裝
    const existingIdx = entries.findIndex(
      (e) => e.scope === 'local' && e.projectPath === absoluteRepoRoot,
    );

    const now = new Date().toISOString();
    const newEntry: InstalledPluginEntry = {
      scope: 'local',
      projectPath: absoluteRepoRoot,
      installPath: absoluteInstallPath,
      version: '0.3.0',
      installedAt: existingIdx >= 0 ? entries[existingIdx].installedAt : now,
      lastUpdated: now,
    };

    if (existingIdx >= 0) {
      // 更新既有項目
      entries[existingIdx] = newEntry;
    } else {
      entries.push(newEntry);
    }

    data.plugins[pluginKey] = entries;
    fs.mkdirSync(path.dirname(pluginsPath), { recursive: true });
    fs.writeFileSync(pluginsPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return existingIdx < 0; // 只有新增時回傳 true
  } catch {
    // 註冊失敗不中斷流程（hooks/settings.json 仍可作為 fallback）
    return false;
  }
}

/**
 * 清理舊版 project-level skill 和 command 目錄
 * 遷移到 plugin 結構後不再需要
 */
function cleanupLegacyDirs(repoRoot: string): void {
  const legacySkillDir = path.join(repoRoot, '.claude', 'skills', 'projecthub');
  const legacyPluginDir = path.join(repoRoot, '.claude', 'plugins', 'projecthub');
  const legacyCommandFile = path.join(repoRoot, '.claude', 'commands', 'summarize.md');

  if (fs.existsSync(legacySkillDir)) {
    fs.rmSync(legacySkillDir, { recursive: true, force: true });
  }
  if (fs.existsSync(legacyPluginDir)) {
    fs.rmSync(legacyPluginDir, { recursive: true, force: true });
  }
  if (fs.existsSync(legacyCommandFile)) {
    fs.rmSync(legacyCommandFile, { force: true });
    // 如果 commands 目錄為空，也一併清理
    const commandsDir = path.join(repoRoot, '.claude', 'commands');
    try {
      const remaining = fs.readdirSync(commandsDir);
      if (remaining.length === 0) {
        fs.rmSync(commandsDir, { recursive: true, force: true });
      }
    } catch { /* 目錄不存在，無需處理 */ }
  }
}

/** 註冊 init 指令 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize projmem plugin in the target project')
    .option('--repo-root <path>', 'Target project root directory', '.')
    .option('--force', 'Overwrite existing plugin files', false)
    .option('--skip-db', 'Skip database initialization', false)
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = path.resolve(opts.repoRoot);
      const force: boolean = opts.force;
      const skipDb: boolean = opts.skipDb;
      const format: string = opts.format;

      // 1. 複製 plugin 檔案到 .claude/plugins/projmem/
      const assetsDir = getAssetsDir();
      if (!fs.existsSync(assetsDir)) {
        throw new Error(
          `Assets directory not found: ${assetsDir}. Ensure the package is installed correctly.`
        );
      }

      const pluginDest = path.join(repoRoot, '.claude', 'plugins', 'projmem');
      const { copied, skipped } = copyDirRecursive(assetsDir, pluginDest, force);

      // 1b. 清理舊版 skill/command 目錄（若存在）
      cleanupLegacyDirs(repoRoot);

      // 1c. 將 plugin 註冊到 Claude Code installed_plugins.json
      const pluginRegistered = registerPlugin(repoRoot, pluginDest);

      // 2. 合併 .claude/settings.json（hooks 路徑遷移 + 去重）
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

      // 3. 建立 .projmem.json
      const configCreated = ensureProjectConfig(repoRoot);

      // 4. 建立 vault 目錄結構
      const vaultDirsCreated = ensureVaultDirs(repoRoot);

      // 5. 確保 .mcp.json 包含 projmem MCP server
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
        pluginFilesCopied: copied,
        pluginFilesSkipped: skipped,
        pluginRegistered,
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
