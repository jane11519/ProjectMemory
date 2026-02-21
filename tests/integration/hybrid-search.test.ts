import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchUseCase } from '../../src/application/SearchUseCase.js';
import { IndexUseCase } from '../../src/application/IndexUseCase.js';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../src/infrastructure/sqlite/FTS5Adapter.js';
import { SqliteVecAdapter } from '../../src/infrastructure/sqlite/SqliteVecAdapter.js';
import { MarkdownParser } from '../../src/infrastructure/vault/MarkdownParser.js';
import { ChunkingStrategy } from '../../src/infrastructure/vault/ChunkingStrategy.js';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import type { EmbeddingPort, EmbeddingResult } from '../../src/domain/ports/EmbeddingPort.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dim = 4;

function createMockEmbedding(): EmbeddingPort {
  // 根據文字內容產生不同的向量，讓 KNN 有區分度
  return {
    providerId: 'mock',
    dimension: dim,
    modelId: 'mock-model',
    embed: vi.fn(async (texts: string[]): Promise<EmbeddingResult[]> =>
      texts.map((t) => {
        // 根據 text hash 產生偽向量
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

describe('SearchUseCase', () => {
  const tmpDir = path.join(os.tmpdir(), 'projmem-search-' + Date.now());
  const vaultDir = path.join(tmpDir, 'vault', 'code-notes');
  let dbMgr: DatabaseManager;
  let fts5: FTS5Adapter;
  let vec: SqliteVecAdapter;
  let searchUseCase: SearchUseCase;
  let mockEmbed: EmbeddingPort;

  beforeEach(async () => {
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'vault', '.projmem'), { recursive: true });

    dbMgr = new DatabaseManager(path.join(tmpDir, 'vault', '.projmem', 'index.db'), dim);
    fts5 = new FTS5Adapter(dbMgr.getDb());
    vec = new SqliteVecAdapter(dbMgr.getDb());
    mockEmbed = createMockEmbedding();

    // 插入 root namespace
    dbMgr.getDb().prepare(
      "INSERT INTO namespaces(name, kind, discovered_at) VALUES('root', 'root', ?)"
    ).run(Date.now());

    // 建立測試資料
    fs.writeFileSync(path.join(vaultDir, 'auth.md'), `# Authentication Service

Handles JWT token generation and JIRA-1234 validation.

## OAuth Flow

OAuth2 flow implementation details.`);

    fs.writeFileSync(path.join(vaultDir, 'user.md'), `# User Profile

User management and avatar upload.

## Settings

User preference settings.`);

    fs.writeFileSync(path.join(vaultDir, 'gateway.md'), `# API Gateway

API gateway routing and rate limiting configuration.

## Health Check

Gateway health monitoring.`);

    // 索引所有文件
    const indexer = new IndexUseCase(
      dbMgr.getDb(), fts5, vec,
      new MarkdownParser(), new ChunkingStrategy(),
      new FileSystemVaultAdapter(), mockEmbed,
    );
    await indexer.buildFull(tmpDir, 'vault', ['code-notes']);

    searchUseCase = new SearchUseCase(dbMgr.getDb(), fts5, vec, mockEmbed);
  });

  afterEach(() => {
    dbMgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find exact keyword "JIRA-1234" with lex_norm > vec_norm', async () => {
    const response = await searchUseCase.search({
      query: 'JIRA-1234',
      topK: 5,
    });

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.searchMode).toBe('hybrid');
    // 精確關鍵字 → BM25 貢獻大，lex_norm 應高
    const top = response.results[0];
    expect(top.text).toContain('JIRA-1234');
  });

  it('should return results for general query', async () => {
    const response = await searchUseCase.search({
      query: 'authentication',
      topK: 10,
    });

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should fallback to BM25-only when vec search fails', async () => {
    // 建立 vec adapter 上覆寫 searchKNN 來模擬失敗
    const failingVec = {
      insertRows: vec.insertRows.bind(vec),
      deleteRows: vec.deleteRows.bind(vec),
      searchKNN: () => { throw new Error('vec index corrupt'); },
    } as unknown as SqliteVecAdapter;

    const failSearchUseCase = new SearchUseCase(
      dbMgr.getDb(), fts5, failingVec, mockEmbed,
    );

    const response = await failSearchUseCase.search({
      query: 'gateway',
      topK: 5,
    });

    expect(response.searchMode).toBe('bm25_only');
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.warnings.length).toBeGreaterThan(0);
  });

  describe('ref_code_paths in search results', () => {
    it('should include refCodePaths when document has ref_code_paths', async () => {
      // 建立帶 ref_code_paths 的文件
      fs.writeFileSync(path.join(vaultDir, 'with-refs.md'), `---
title: Ref Code Test
ref_code_paths:
  - src/services/AuthService.ts
  - src/middleware/jwt.ts
---
# Ref Code Test

Authentication implementation with JWT tokens.`);

      // 重新索引
      const indexer = new IndexUseCase(
        dbMgr.getDb(), fts5, vec,
        new MarkdownParser(), new ChunkingStrategy(),
        new FileSystemVaultAdapter(), mockEmbed,
      );
      await indexer.buildFull(tmpDir, 'vault', ['code-notes']);

      searchUseCase = new SearchUseCase(dbMgr.getDb(), fts5, vec, mockEmbed);
      const response = await searchUseCase.search({
        query: 'Ref Code Test',
        topK: 10,
        mode: 'bm25_only',
      });

      const match = response.results.find((r) => r.title === 'Ref Code Test');
      expect(match).toBeDefined();
      expect(match!.refCodePaths).toEqual(['src/services/AuthService.ts', 'src/middleware/jwt.ts']);
    });

    it('should have undefined refCodePaths when document has no ref_code_paths', async () => {
      const response = await searchUseCase.search({
        query: 'authentication',
        topK: 10,
        mode: 'bm25_only',
      });

      expect(response.results.length).toBeGreaterThan(0);
      for (const r of response.results) {
        expect(r.refCodePaths).toBeUndefined();
      }
    });
  });
});
