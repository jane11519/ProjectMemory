import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SessionUseCase } from '../../application/SessionUseCase.js';

/**
 * MCP Tool: projmem_session_list
 * 列出 sessions，支援 status / hasSummary 過濾。
 * 讓 Claude 知道哪些 session 需要 summarize。
 */
export function registerSessionListTool(
  server: McpServer,
  sessionUseCase: SessionUseCase,
): void {
  server.tool(
    'projmem_session_list',
    'List sessions with optional filters. Shows which sessions have summaries.',
    {
      status: z.enum(['active', 'compacted', 'closed']).optional()
        .describe('Filter by session status'),
      hasSummary: z.boolean().optional()
        .describe('Filter by summary status: true = has summary, false = no summary'),
      limit: z.number().optional().default(10)
        .describe('Maximum number of sessions to return'),
    },
    async ({ status, hasSummary, limit }) => {
      const sessions = sessionUseCase.listSessions({ status, hasSummary, limit });

      const lines: string[] = [];
      lines.push(`Found ${sessions.length} session(s)\n`);

      for (const s of sessions) {
        const date = new Date(s.lastSavedAt).toISOString().slice(0, 19).replace('T', ' ');
        const hasSummaryFlag = s.summaryJson ? '[summarized]' : '[no summary]';
        lines.push(`- ${s.sessionId}  ${hasSummaryFlag}  status:${s.status}  turns:${s.turnCount}  ${date}`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    },
  );
}
