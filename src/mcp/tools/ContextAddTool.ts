import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpDependencies } from '../McpServer.js';
import { ContextUseCase } from '../../application/ContextUseCase.js';

/**
 * MCP Tool: projmem_context_add
 * 新增或更新 context metadata。
 */
export function registerContextAddTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_context_add',
    'Add or update context metadata for a virtual path',
    {
      virtualPath: z.string().describe('Virtual path (e.g. "code-notes/services/auth")'),
      description: z.string().describe('Context description for this path'),
    },
    async ({ virtualPath, description }) => {
      try {
        const useCase = new ContextUseCase(deps.db);
        const context = useCase.addContext(virtualPath, description);

        return {
          content: [{
            type: 'text' as const,
            text: [
              `Context saved:`,
              `  ID: ${context.contextId}`,
              `  Path: ${context.virtualPath}`,
              `  Description: ${context.description}`,
            ].join('\n'),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Context add failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
