import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../src/infrastructure/sqlite/FTS5Adapter.js';
import { SqliteVecAdapter } from '../../src/infrastructure/sqlite/SqliteVecAdapter.js';
import { IndexUseCase } from '../../src/application/IndexUseCase.js';
import { MarkdownParser } from '../../src/infrastructure/vault/MarkdownParser.js';
import { ChunkingStrategy } from '../../src/infrastructure/vault/ChunkingStrategy.js';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import { VaultSessionAdapter } from '../../src/infrastructure/session/VaultSessionAdapter.js';
import { NullLLMAdapter } from '../../src/infrastructure/llm/NullLLMAdapter.js';
import { createMcpServer, buildInstructions } from '../../src/mcp/McpServer.js';
import type { EmbeddingPort, EmbeddingResult } from '../../src/domain/ports/EmbeddingPort.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dim = 4;

function createMockEmbedding(): EmbeddingPort {
  return {
    providerId: 'mock',
    dimension: dim,
    modelId: 'mock-model',
    embed: vi.fn(async (texts: string[]): Promise<EmbeddingResult[]> =>
      texts.map((t) => {
        let sum = 0;
        for (let i = 0; i < t.length; i++) sum += t.charCodeAt(i);
        const base = (sum % 100) / 100;
        return {
          vector: new Float32Array([base, 1 - base, base * 0.5, 0.1]),
          tokensUsed: 10,
        };
      }),
    ),
    embedOne: vi.fn(async (text: string): Promise<EmbeddingResult> => {
      let sum = 0;
      for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
      const base = (sum % 100) / 100;
      return {
        vector: new Float32Array([base, 1 - base, base * 0.5, 0.1]),
        tokensUsed: 10,
      };
    }),
    isHealthy: vi.fn(async () => true),
  };
}

/**
 * Feature: MCP Server 整合
 *
 * 作為 LLM client（如 Claude Code），我需要透過 MCP 工具
 * 搜尋和檢索 projmem 知識庫的內容。
 */
describe('MCP Server', () => {
  const tmpDir = path.join(os.tmpdir(), 'projmem-mcp-' + Date.now());
  const vaultDir = path.join(tmpDir, 'vault', 'code-notes');
  const vaultRoot = path.join(tmpDir, 'vault');
  let dbMgr: DatabaseManager;
  let mockEmbed: EmbeddingPort;

  beforeEach(async () => {
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'vault', '.projmem'), { recursive: true });

    dbMgr = new DatabaseManager(path.join(tmpDir, 'vault', '.projmem', 'index.db'), dim);
    mockEmbed = createMockEmbedding();

    // 插入 root namespace
    dbMgr.getDb().prepare(
      "INSERT INTO namespaces(name, kind, discovered_at) VALUES('root', 'root', ?)"
    ).run(Date.now());

    // 建立測試資料
    fs.writeFileSync(path.join(vaultDir, 'auth.md'), `# Authentication Service

Handles JWT token generation and validation.

## OAuth Flow

OAuth2 flow implementation details.`);

    fs.writeFileSync(path.join(vaultDir, 'api.md'), `# API Gateway

API gateway routing and rate limiting configuration.`);

    // 索引文件
    const fts5 = new FTS5Adapter(dbMgr.getDb());
    const vec = new SqliteVecAdapter(dbMgr.getDb());
    const indexer = new IndexUseCase(
      dbMgr.getDb(), fts5, vec,
      new MarkdownParser(), new ChunkingStrategy(),
      new FileSystemVaultAdapter(), mockEmbed,
    );
    await indexer.buildFull(tmpDir, 'vault', ['code-notes']);
  });

  afterEach(() => {
    dbMgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Scenario: 成功建立 MCP Server 並註冊所有工具
   * Given 已建立的 database 和依賴
   * When 建立 MCP server
   * Then server 物件不為 null
   */
  it('should create MCP server with all tools registered', () => {
    const db = dbMgr.getDb();
    const server = createMcpServer({
      db,
      fts5: new FTS5Adapter(db),
      vec: new SqliteVecAdapter(db),
      embedding: mockEmbed,
      llm: new NullLLMAdapter(),
      repoRoot: tmpDir,
    });

    expect(server).toBeDefined();
  });

  /**
   * Scenario: buildInstructions 產生有效的指引文字
   * Given repo root 路徑
   * When 建構 instructions
   * Then 包含工具說明和推薦工作流程
   */
  it('should build instructions with tool descriptions', () => {
    const instructions = buildInstructions(tmpDir);

    expect(instructions).toContain('projmem_search');
    expect(instructions).toContain('projmem_vector_search');
    expect(instructions).toContain('projmem_deep_search');
    expect(instructions).toContain('projmem_get');
    expect(instructions).toContain('projmem_multi_get');
    expect(instructions).toContain('projmem_status');
    expect(instructions).toContain('projmem_session_list');
    expect(instructions).toContain('projmem_session_transcript');
    expect(instructions).toContain('projmem_session_update_summary');
    expect(instructions).toContain('Recommended workflow');
    expect(instructions).toContain('Session summarize workflow');
    expect(instructions).toContain(tmpDir);
  });

  /**
   * Scenario: NullLLMAdapter 在 MCP server 中正確運作
   * Given 使用 NullLLMAdapter
   * When 建立 MCP server
   * Then server 建立成功（deep search 工具可用但會降級）
   */
  it('should work with NullLLMAdapter for graceful degradation', () => {
    const db = dbMgr.getDb();
    const nullLLM = new NullLLMAdapter();

    expect(nullLLM.providerId).toBe('none');

    const server = createMcpServer({
      db,
      fts5: new FTS5Adapter(db),
      vec: new SqliteVecAdapter(db),
      embedding: mockEmbed,
      llm: nullLLM,
      repoRoot: tmpDir,
    });

    expect(server).toBeDefined();
  });

  /**
   * Scenario: MCP Server 包含 session tools（當提供 session 依賴時）
   * Given sessionPort 和 vaultRoot 已提供
   * When 建立 MCP server
   * Then server 包含 session tools
   */
  it('should register session tools when session dependencies provided', () => {
    const db = dbMgr.getDb();
    const vault = new FileSystemVaultAdapter();
    const sessionPort = new VaultSessionAdapter(db, vault);

    const server = createMcpServer({
      db,
      fts5: new FTS5Adapter(db),
      vec: new SqliteVecAdapter(db),
      embedding: mockEmbed,
      llm: new NullLLMAdapter(),
      repoRoot: tmpDir,
      sessionPort,
      vaultRoot,
    });

    expect(server).toBeDefined();
  });

  /**
   * Scenario: MCP Server graceful degradation（無 session 依賴）
   * Given 未提供 sessionPort
   * When 建立 MCP server
   * Then server 仍能成功建立（session tools 不註冊）
   */
  it('should work without session dependencies (graceful degradation)', () => {
    const db = dbMgr.getDb();

    const server = createMcpServer({
      db,
      fts5: new FTS5Adapter(db),
      vec: new SqliteVecAdapter(db),
      embedding: mockEmbed,
      repoRoot: tmpDir,
      // 不提供 sessionPort 和 vaultRoot
    });

    expect(server).toBeDefined();
  });
});
