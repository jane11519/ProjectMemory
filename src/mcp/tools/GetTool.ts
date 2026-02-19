import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpDependencies } from '../McpServer.js';

/**
 * MCP Tool: projecthub_get
 * 對應 CLI: projecthub search expand <id> 或 search full <docPath>
 * 以 chunkId 或 docPath 取回完整文件內容。
 */
export function registerGetTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projecthub_get',
    'Retrieve a specific chunk by ID (e.g. "#123") or all chunks of a document by path',
    {
      identifier: z.string().describe('Chunk ID (e.g. "#123" or "123") or document path'),
    },
    async ({ identifier }) => {
      // 判斷是 chunkId 還是 docPath
      const chunkIdMatch = identifier.match(/^#?(\d+)$/);

      if (chunkIdMatch) {
        // 取回單一 chunk
        const chunkId = parseInt(chunkIdMatch[1], 10);
        const row = deps.db.prepare(`
          SELECT c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
                 d.doc_path, d.title, n.name AS namespace_name
          FROM chunks c
          JOIN docs d ON c.doc_id = d.doc_id
          JOIN namespaces n ON d.namespace_id = n.namespace_id
          WHERE c.chunk_id = ?
        `).get(chunkId) as any;

        if (!row) {
          return {
            content: [{ type: 'text' as const, text: `Chunk #${chunkId} not found.` }],
            isError: true,
          };
        }

        const lines = [
          `# ${row.title}`,
          `Path: ${row.doc_path} | Chunk #${row.chunk_id} | Lines ${row.start_line}-${row.end_line}`,
          row.heading_path ? `Heading: ${row.heading_path}` : '',
          `Namespace: ${row.namespace_name}`,
          '',
          row.text,
        ].filter(Boolean);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } else {
        // 取回整份文件的所有 chunks
        const rows = deps.db.prepare(`
          SELECT c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
                 d.doc_path, d.title, n.name AS namespace_name
          FROM chunks c
          JOIN docs d ON c.doc_id = d.doc_id
          JOIN namespaces n ON d.namespace_id = n.namespace_id
          WHERE d.doc_path = ?
          ORDER BY c.chunk_index
        `).all(identifier) as any[];

        if (rows.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `Document "${identifier}" not found.` }],
            isError: true,
          };
        }

        const lines = [
          `# ${rows[0].title}`,
          `Path: ${rows[0].doc_path} | ${rows.length} chunks | Namespace: ${rows[0].namespace_name}`,
          '',
        ];

        for (const row of rows) {
          lines.push(`--- Chunk #${row.chunk_id} (lines ${row.start_line}-${row.end_line}) ---`);
          if (row.heading_path) lines.push(`[${row.heading_path}]`);
          lines.push(row.text);
          lines.push('');
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      }
    },
  );
}
