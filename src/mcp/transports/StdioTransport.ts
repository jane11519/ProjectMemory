import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Stdio Transport
 *
 * 設計意圖：標準 MCP 傳輸方式，透過 stdin/stdout 與 LLM client 通訊。
 * 適用於 Claude Code 和其他支援 stdio MCP 的工具。
 */
export async function startStdioTransport(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
