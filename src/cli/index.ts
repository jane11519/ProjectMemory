#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerScanCommand } from './commands/scan.js';
import { registerIndexCommand } from './commands/index.js';
import { registerSearchCommand } from './commands/search.js';
import { registerSessionCommand } from './commands/session.js';
import { registerHealthCommand } from './commands/health.js';
import { registerInitCommand } from './commands/init.js';
import { registerMcpCommand } from './commands/mcp.js';
import { registerContextCommand } from './commands/context.js';

// 從 package.json 動態讀取版本號，避免硬編碼導致版本不同步
const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('projmem')
  .description('Project-level Obsidian knowledge base with hybrid BM25+vector search')
  .version(version);

registerScanCommand(program);
registerIndexCommand(program);
registerSearchCommand(program);
registerSessionCommand(program);
registerHealthCommand(program);
registerInitCommand(program);
registerMcpCommand(program);
registerContextCommand(program);

/** 全域錯誤處理 */
program.exitOverride();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    if (err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
      process.exit(0);
    }
    process.stderr.write(`Error: ${err?.message ?? 'Unknown error'}\n`);
    process.exit(1);
  }
}

main();
