import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpDependencies } from '../McpServer.js';

/**
 * MCP Tool: projecthub_status
 * 對應 CLI: projecthub health
 * 索引狀態、文件統計與 collection 資訊。
 */
export function registerStatusTool(server: McpServer, deps: McpDependencies): void {
  server.tool(
    'projecthub_status',
    'Show index statistics, collection info, and health status',
    {},
    async () => {
      const db = deps.db;

      const docCount = (db.prepare('SELECT COUNT(*) as count FROM docs').get() as any).count;
      const chunkCount = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any).count;
      const nsCount = (db.prepare('SELECT COUNT(*) as count FROM namespaces').get() as any).count;

      // 各 source_kind 的文件數
      const kindCounts = db.prepare(
        'SELECT source_kind, COUNT(*) as count FROM docs GROUP BY source_kind ORDER BY count DESC',
      ).all() as Array<{ source_kind: string; count: number }>;

      // 命名空間清單
      const namespaces = db.prepare(
        'SELECT name, kind FROM namespaces ORDER BY name',
      ).all() as Array<{ name: string; kind: string }>;

      // Embedding 維度
      const dimRow = db.prepare(
        "SELECT value FROM schema_meta WHERE key = 'embedding_dimension'",
      ).get() as { value: string } | undefined;

      // LLM 快取大小
      let cacheSize = 0;
      try {
        const cacheRow = db.prepare('SELECT COUNT(*) as count FROM llm_cache').get() as any;
        cacheSize = cacheRow?.count ?? 0;
      } catch {
        // llm_cache 表可能不存在
      }

      const lines: string[] = [
        '# ProjectHub Index Status',
        '',
        `Documents: ${docCount}`,
        `Chunks: ${chunkCount}`,
        `Namespaces: ${nsCount}`,
        `Embedding dimension: ${dimRow?.value ?? 'unknown'}`,
        `LLM cache entries: ${cacheSize}`,
        '',
        '## Documents by Kind',
      ];

      for (const { source_kind, count } of kindCounts) {
        lines.push(`  ${source_kind}: ${count}`);
      }

      lines.push('');
      lines.push('## Namespaces');
      for (const ns of namespaces) {
        lines.push(`  ${ns.name} (${ns.kind})`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
