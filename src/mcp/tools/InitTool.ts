import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import type { McpDependencies } from '../McpServer.js';
import {
  getAssetsDir,
  copyDirRecursive,
  mergeSettings,
  registerPlugin,
  ensureProjectConfig,
  ensureVaultDirs,
  formatTextResult,
  type InitResult,
  type ClaudeSettings,
} from '../../cli/commands/init.js';

/**
 * MCP Tool: projmem_init
 * 初始化專案結構（plugin files、settings、config、vault dirs）。
 * 跳過 .mcp.json（MCP 已在運行）和 DB（已在運行）。
 */
export function registerInitTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_init',
    'Initialize projmem project structure (plugin, settings, config, vault dirs)',
    {
      force: z.boolean().optional().default(false)
        .describe('Overwrite existing plugin files'),
    },
    async ({ force }) => {
      try {
        const repoRoot = deps.repoRoot;

        // 1. 複製 plugin 檔案
        const assetsDir = getAssetsDir();
        if (!fs.existsSync(assetsDir)) {
          return {
            content: [{ type: 'text' as const, text: `Assets directory not found: ${assetsDir}` }],
            isError: true,
          };
        }

        const pluginDest = path.join(repoRoot, '.claude', 'plugins', 'projmem');
        const { copied, skipped } = copyDirRecursive(assetsDir, pluginDest, force);

        // 1b. 將 plugin 註冊到 Claude Code installed_plugins.json
        const pluginRegistered = registerPlugin(repoRoot, pluginDest);

        // 2. 合併 settings.json（hooks 路徑遷移 + 去重）
        const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
        let settingsMerged = false;
        let existingSettings: ClaudeSettings = {};
        if (fs.existsSync(settingsPath)) {
          existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
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

        // 跳過 .mcp.json（MCP 已在運行）和 DB（已在運行）
        const result: InitResult = {
          repoRoot,
          pluginFilesCopied: copied,
          pluginFilesSkipped: skipped,
          pluginRegistered,
          settingsMerged,
          configCreated,
          mcpConfigured: false,
          vaultDirsCreated,
          dbInitialized: true,
          dbError: undefined,
        };

        return {
          content: [{ type: 'text' as const, text: formatTextResult(result) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Init failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
