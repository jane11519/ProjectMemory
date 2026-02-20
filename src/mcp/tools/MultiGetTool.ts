import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpDependencies } from '../McpServer.js';

/**
 * MCP Tool: projmem_multi_get
 * 批量取回多個 chunk 或 doc 的內容。
 * 支援 chunkId 列表或 docPath glob pattern。
 */
export function registerMultiGetTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projmem_multi_get',
    'Batch retrieve multiple chunks by IDs or documents by path pattern',
    {
      chunkIds: z.array(z.number()).optional().describe('List of chunk IDs to retrieve'),
      docPaths: z.array(z.string()).optional().describe('List of document paths to retrieve'),
      pathPattern: z.string().optional().describe('Glob-like pattern for doc paths (e.g. "code-notes/auth%")'),
    },
    async ({ chunkIds, docPaths, pathPattern }) => {
      const lines: string[] = [];

      // 批量取回 chunks
      if (chunkIds && chunkIds.length > 0) {
        const placeholders = chunkIds.map(() => '?').join(',');
        const rows = deps.db.prepare(`
          SELECT c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
                 d.doc_path, d.title
          FROM chunks c
          JOIN docs d ON c.doc_id = d.doc_id
          WHERE c.chunk_id IN (${placeholders})
          ORDER BY c.chunk_id
        `).all(...chunkIds) as any[];

        lines.push(`## Chunks (${rows.length}/${chunkIds.length} found)`);
        lines.push('');
        for (const row of rows) {
          lines.push(`### [#${row.chunk_id}] ${row.title} — ${row.heading_path || '(root)'}`);
          lines.push(`${row.doc_path}:${row.start_line}-${row.end_line}`);
          lines.push('');
          lines.push(row.text);
          lines.push('');
        }
      }

      // 批量取回 docs by path
      if (docPaths && docPaths.length > 0) {
        for (const docPath of docPaths) {
          const rows = deps.db.prepare(`
            SELECT c.chunk_id, c.heading_path, c.start_line, c.end_line, c.text,
                   d.doc_path, d.title
            FROM chunks c
            JOIN docs d ON c.doc_id = d.doc_id
            WHERE d.doc_path = ?
            ORDER BY c.chunk_index
          `).all(docPath) as any[];

          if (rows.length > 0) {
            lines.push(`## ${rows[0].title} (${rows.length} chunks)`);
            lines.push(`Path: ${docPath}`);
            lines.push('');
            for (const row of rows) {
              lines.push(row.text);
              lines.push('');
            }
          }
        }
      }

      // 以 pattern 取回 docs（SQL LIKE）
      if (pathPattern) {
        const rows = deps.db.prepare(`
          SELECT DISTINCT d.doc_path, d.title
          FROM docs d
          WHERE d.doc_path LIKE ?
          ORDER BY d.doc_path
          LIMIT 20
        `).all(pathPattern) as any[];

        lines.push(`## Documents matching "${pathPattern}" (${rows.length} found)`);
        lines.push('');
        for (const row of rows) {
          lines.push(`- ${row.doc_path}: ${row.title}`);
        }
      }

      if (lines.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No results. Provide chunkIds, docPaths, or pathPattern.' }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
