import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SessionUseCase } from '../../application/SessionUseCase.js';

/**
 * MCP Tool: projmem_session_transcript
 * 讀取完整 transcript，讓 Claude 閱讀後生成 summary。
 * 若未指定 sessionId，預設取最近的 session。
 */
export function registerSessionTranscriptTool(
  server: McpServer,
  sessionUseCase: SessionUseCase,
): void {
  server.tool(
    'projmem_session_transcript',
    'Get full conversation transcript for a session. Returns formatted conversation turns.',
    {
      sessionId: z.string().optional()
        .describe('Session ID. If omitted, uses the most recent session.'),
    },
    async ({ sessionId }) => {
      // 若未指定 sessionId，取最近的 session
      let targetId = sessionId;
      if (!targetId) {
        const sessions = sessionUseCase.listSessions({ limit: 1 });
        if (sessions.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No sessions found.' }],
          };
        }
        targetId = sessions[0].sessionId;
      }

      const transcript = sessionUseCase.getTranscript(targetId);
      if (!transcript) {
        return {
          content: [{
            type: 'text' as const,
            text: `Transcript not found for session "${targetId}". Ensure "session capture" has been run.`,
          }],
        };
      }

      // 格式化為可讀文字
      const lines: string[] = [];
      const startDate = transcript.startedAt
        ? new Date(transcript.startedAt).toISOString().slice(0, 19).replace('T', ' ')
        : 'unknown';
      const endDate = transcript.endedAt
        ? new Date(transcript.endedAt).toISOString().slice(0, 19).replace('T', ' ')
        : 'unknown';

      lines.push(`Session: ${transcript.sessionId}`);
      lines.push(`Duration: ${startDate} → ${endDate}`);
      lines.push(`Turns: ${transcript.turnCount} | Tools: ${transcript.toolsUsed.join(', ') || 'none'}`);
      lines.push(`Files Modified: ${transcript.filesModified.join(', ') || 'none'}`);
      lines.push('');
      lines.push('---');

      for (const turn of transcript.turns) {
        const role = turn.role === 'user' ? '[User]' : '[Assistant]';
        const tools = turn.toolNames?.length ? ` (tools: ${turn.toolNames.join(', ')})` : '';
        const ts = turn.timestamp ? ` ${turn.timestamp}` : '';
        lines.push(`${role}${ts}${tools}`);
        lines.push(turn.text);
        lines.push('');
      }

      lines.push('---');

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    },
  );
}
