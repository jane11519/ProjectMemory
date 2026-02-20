import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpDependencies } from '../McpServer.js';
import { ContextUseCase } from '../../application/ContextUseCase.js';

/**
 * MCP Tool: projmem_context_list
 * 列出所有 context metadata。
 */
export function registerContextListTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_context_list',
    'List all context metadata entries',
    {},
    async () => {
      try {
        const useCase = new ContextUseCase(deps.db);
        const contexts = useCase.listContexts();

        if (contexts.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No contexts defined.' }],
          };
        }

        const lines = [`Found ${contexts.length} context(s)\n`];
        for (const c of contexts) {
          lines.push(`- ${c.virtualPath}: ${c.description}`);
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Context list failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
