import type { Command } from 'commander';
import { ScanUseCase } from '../../application/ScanUseCase.js';
import { FileSystemVaultAdapter } from '../../infrastructure/vault/FileSystemVaultAdapter.js';
import { GitModulesParser } from '../../infrastructure/vault/GitModulesParser.js';
import { loadConfig } from '../../config/ConfigLoader.js';
import { ProgressiveDisclosureFormatter } from '../formatters/ProgressiveDisclosureFormatter.js';
import type { OutputFormat } from '../formatters/ProgressiveDisclosureFormatter.js';

/** 註冊 scan 指令 */
export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Scan vault and repo to detect namespaces and documents')
    .option('--repo-root <path>', 'Repository root directory', '.')
    .option('--format <format>', 'Output format: json or text', 'text')
    .action(async (opts) => {
      const repoRoot = opts.repoRoot;
      const format: OutputFormat = opts.format;
      const config = loadConfig(repoRoot);

      const vault = new FileSystemVaultAdapter();
      const gitModulesParser = new GitModulesParser();
      const useCase = new ScanUseCase(vault, gitModulesParser);
      const formatter = new ProgressiveDisclosureFormatter();

      const result = await useCase.scan(repoRoot, {
        vaultRoot: config.vault.root,
        folders: config.vault.folders,
        namespacePatterns: config.namespacePatterns,
      });

      process.stdout.write(formatter.formatObject(result, format) + '\n');
    });
}
