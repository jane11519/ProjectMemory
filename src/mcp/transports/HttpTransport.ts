import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import http from 'node:http';
import { Logger } from '../../shared/Logger.js';

/**
 * HTTP Transport（SSE-based）
 *
 * 設計意圖：透過 HTTP SSE 提供 MCP 服務，適用於 daemon 模式。
 * 預設監聽 localhost:8181，只接受本地連線。
 */

const logger = new Logger('HttpTransport');

export async function startHttpTransport(
  server: McpServer,
  port: number = 8181,
): Promise<http.Server> {
  let sseTransport: SSEServerTransport | null = null;

  const httpServer = http.createServer(async (req, res) => {
    // CORS 與安全 headers
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/sse' && req.method === 'GET') {
      // SSE 連線
      sseTransport = new SSEServerTransport('/messages', res);
      await server.connect(sseTransport);
      logger.info('SSE client connected');
    } else if (url.pathname === '/messages' && req.method === 'POST') {
      // 接收 client 訊息
      if (!sseTransport) {
        res.writeHead(400);
        res.end('No active SSE connection');
        return;
      }
      await sseTransport.handlePostMessage(req, res);
    } else if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: 'projmem-mcp' }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    httpServer.listen(port, '127.0.0.1', () => {
      logger.info(`MCP HTTP server listening on http://127.0.0.1:${port}`);
      resolve(httpServer);
    });
  });
}
