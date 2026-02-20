import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpDependencies } from '../McpServer.js';
import { ScanUseCase } from '../../application/ScanUseCase.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { GitModulesParser } from '../../infrastructure/vault/GitModulesParser.js';
import { loadConfig } from '../../config/ConfigLoader.js';

/**
 * MCP Tool: projmem_scan
 * 掃描 vault 與 repo，偵測 namespaces 和文件。
 */
export function registerScanTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_scan',
    'Scan vault and repo to detect namespaces and documents',
    {},
    async () => {
      try {
        const config = loadConfig(deps.repoRoot);
        const vault = new FileSystemVaultAdapter();
        const gitModulesParser = new GitModulesParser();
        const useCase = new ScanUseCase(vault, gitModulesParser);

        const result = await useCase.scan(deps.repoRoot, {
          vaultRoot: config.vault.root,
          folders: config.vault.folders,
          namespacePatterns: config.namespacePatterns,
        });

        const lines: string[] = [
          `# Scan Results`,
          '',
          `Namespaces: ${result.namespaces.length}`,
          `Documents: ${result.docs.length}`,
        ];

        if (result.warnings.length > 0) {
          lines.push(`Warnings: ${result.warnings.length}`);
        }

        lines.push('', '## Namespaces');
        for (const ns of result.namespaces) {
          lines.push(`  - ${ns.name} (${ns.kind})${ns.gitUrl ? ` → ${ns.gitUrl}` : ''}`);
        }

        lines.push('', '## Documents');
        for (const doc of result.docs) {
          const sizeKb = (doc.fileSize / 1024).toFixed(1);
          lines.push(`  - ${doc.docPath} — "${doc.title}" (${sizeKb} KB)`);
        }

        if (result.warnings.length > 0) {
          lines.push('', '## Warnings');
          for (const w of result.warnings) {
            lines.push(`  ⚠ ${w}`);
          }
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Scan failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
