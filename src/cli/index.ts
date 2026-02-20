#!/usr/bin/env node

import { Command } from 'commander';
import { registerScanCommand } from './commands/scan.js';
import { registerIndexCommand } from './commands/index.js';
import { registerSearchCommand } from './commands/search.js';
import { registerSessionCommand } from './commands/session.js';
import { registerHealthCommand } from './commands/health.js';
import { registerInitCommand } from './commands/init.js';
import { registerMcpCommand } from './commands/mcp.js';
import { registerContextCommand } from './commands/context.js';

const program = new Command();

program
  .name('projmem')
  .description('Project-level Obsidian knowledge base with hybrid BM25+vector search')
  .version('0.2.0');

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
