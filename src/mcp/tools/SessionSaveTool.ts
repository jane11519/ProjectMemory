import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SessionUseCase } from '../../application/SessionUseCase.js';

/**
 * MCP Tool: projmem_session_save
 * 儲存 session snapshot 到 SQLite + vault Markdown。
 */
export function registerSessionSaveTool(
  server: McpServer,
  sessionUseCase: SessionUseCase,
): void {
  server.tool(
    'projmem_session_save',
    'Save a session snapshot (creates or updates session in DB and vault)',
    {
      sessionId: z.string().describe('Unique session identifier'),
      projectDir: z.string().describe('Project directory path'),
      turnCount: z.number().describe('Number of conversation turns'),
      rollingSummary: z.string().optional().default('')
        .describe('Rolling summary of the session'),
      decisions: z.array(z.string()).optional().default([])
        .describe('Key decisions made during the session'),
      searchFootprint: z.array(z.string()).optional().default([])
        .describe('Search queries used during the session'),
      status: z.enum(['active', 'compacted', 'closed']).optional().default('active')
        .describe('Session status'),
    },
    async ({ sessionId, projectDir, turnCount, rollingSummary, decisions, searchFootprint, status }) => {
      try {
        const session = await sessionUseCase.save({
          sessionId,
          projectDir,
          turnCount,
          rollingSummary,
          decisions,
          searchFootprint,
          status,
        });

        return {
          content: [{
            type: 'text' as const,
            text: [
              `Session saved:`,
              `  ID: ${session.sessionId}`,
              `  Status: ${session.status}`,
              `  Turns: ${session.turnCount}`,
              `  Saved at: ${new Date(session.lastSavedAt).toISOString()}`,
            ].join('\n'),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Session save failed: ${err?.message ?? 'unknown error'}` }],
          isError: true,
        };
      }
    },
  );
}
