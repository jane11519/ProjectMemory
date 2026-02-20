import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpDependencies } from '../McpServer.js';
import { ContextUseCase } from '../../application/ContextUseCase.js';

/**
 * MCP Tool: projmem_context_rm
 * 移除指定路徑的 context metadata。
 */
export function registerContextRemoveTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_context_rm',
    'Remove context metadata for a virtual path',
    {
      virtualPath: z.string().describe('Virtual path to remove context from'),
    },
    async ({ virtualPath }) => {
      try {
        const useCase = new ContextUseCase(deps.db);
        const removed = useCase.removeContext(virtualPath);

        if (removed) {
          return {
            content: [{ type: 'text' as const, text: `Context "${virtualPath}" removed.` }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Context "${virtualPath}" not found.` }],
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Context remove failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
