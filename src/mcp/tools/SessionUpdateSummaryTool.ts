import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SessionUseCase } from '../../application/SessionUseCase.js';
import type { SessionSummary } from '../../domain/value-objects/SessionSummary.js';

/**
 * MCP Tool: projmem_session_update_summary
 * 儲存 Claude 生成的結構化 summary。
 * Claude 讀取 transcript 後呼叫此 tool 寫回 DB + vault。
 */
export function registerSessionUpdateSummaryTool(
  server: McpServer,
  sessionUseCase: SessionUseCase,
): void {
  server.tool(
    'projmem_session_update_summary',
    'Save a structured summary for a session. Call this after reading the transcript and generating a summary.',
    {
      sessionId: z.string().describe('Session ID to update'),
      overview: z.string().describe('2-3 sentence overview of what was accomplished'),
      decisions: z.array(z.string()).describe('Key architectural/design decisions made'),
      outcomes: z.array(z.string()).describe('What was achieved (features, files, fixes)'),
      openItems: z.array(z.string()).describe('TODOs, unresolved issues, next steps'),
      tags: z.array(z.string()).describe('Topic tags for searchability'),
    },
    async ({ sessionId, overview, decisions, outcomes, openItems, tags }) => {
      const summary: SessionSummary = {
        overview,
        decisions,
        outcomes,
        openItems,
        tags,
      };

      const updated = await sessionUseCase.updateSummary(sessionId, summary);

      if (!updated) {
        return {
          content: [{
            type: 'text' as const,
            text: `Session "${sessionId}" not found.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Summary saved for session "${sessionId}".\n\nOverview: ${overview}\nDecisions: ${decisions.length}\nOutcomes: ${outcomes.length}\nOpen Items: ${openItems.length}\nTags: ${tags.join(', ')}`,
        }],
      };
    },
  );
}
