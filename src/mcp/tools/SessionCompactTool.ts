import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SessionUseCase } from '../../application/SessionUseCase.js';

/**
 * MCP Tool: projmem_session_compact
 * 壓縮 session rolling summary，更新 status 為 compacted。
 */
export function registerSessionCompactTool(
  server: McpServer,
  sessionUseCase: SessionUseCase,
): void {
  server.tool(
    'projmem_session_compact',
    'Compact a session\'s rolling summary and mark as compacted',
    {
      sessionId: z.string().describe('Session ID to compact'),
    },
    async ({ sessionId }) => {
      try {
        const session = await sessionUseCase.compact(sessionId);

        if (!session) {
          return {
            content: [{ type: 'text' as const, text: `Session "${sessionId}" not found.` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: [
              `Session compacted:`,
              `  ID: ${session.sessionId}`,
              `  Status: ${session.status}`,
              `  Compacted at: ${new Date(session.lastSavedAt).toISOString()}`,
            ].join('\n'),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Session compact failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
