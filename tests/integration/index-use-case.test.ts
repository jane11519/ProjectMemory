import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

/** Mock embedding provider：回傳固定維度向量 */
function createMockEmbedding(dim: number): EmbeddingPort {
  return {
    providerId: 'mock',
    dimension: dim,
    modelId: 'mock-model',
    embed: vi.fn(async (texts: string[]): Promise<EmbeddingResult[]> =>
      texts.map(() => ({
        vector: new Float32Array(dim).fill(0.1),
        tokensUsed: 10,
      })),
    ),
    embedOne: vi.fn(async (): Promise<EmbeddingResult> => ({
      vector: new Float32Array(dim).fill(0.1),
      tokensUsed: 10,
    })),
    isHealthy: vi.fn(async () => true),
  };
}

/** Mock embedding provider：永遠失敗 */
function createFailingEmbedding(): EmbeddingPort {
  return {
    providerId: 'failing',
    dimension: 4,
    modelId: 'fail-model',
    embed: vi.fn(async () => { throw new Error('API unavailable'); }),
    embedOne: vi.fn(async () => { throw new Error('API unavailable'); }),
    isHealthy: vi.fn(async () => false),
  };
}

describe('IndexUseCase', () => {
  const dim = 4;
  const tmpDir = path.join(os.tmpdir(), 'projecthub-index-' + Date.now());
  const vaultDir = path.join(tmpDir, 'vault', 'code-notes');
  let dbMgr: DatabaseManager;
  let fts5: FTS5Adapter;
  let vec: SqliteVecAdapter;
  let useCase: IndexUseCase;

  beforeEach(() => {
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'vault', '.projecthub'), { recursive: true });

    dbMgr = new DatabaseManager(path.join(tmpDir, 'vault', '.projecthub', 'index.db'), dim);
    fts5 = new FTS5Adapter(dbMgr.getDb());
    vec = new SqliteVecAdapter(dbMgr.getDb());

    // 插入 root namespace
    dbMgr.getDb().prepare(
      "INSERT INTO namespaces(name, kind, discovered_at) VALUES('root', 'root', ?)"
    ).run(Date.now());
  });

  afterEach(() => {
    dbMgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should full-build: 2 docs × 2 chunks each → 4 chunks + 4 FTS + 4 vec', async () => {
    fs.writeFileSync(path.join(vaultDir, 'auth.md'), `# Auth Service

Handles authentication.

## JWT Tokens

Token generation and validation.`);

    fs.writeFileSync(path.join(vaultDir, 'user.md'), `# User Service

User management.

## Profile

Avatar upload and settings.`);

    const mockEmbed = createMockEmbedding(dim);
    useCase = new IndexUseCase(
      dbMgr.getDb(), fts5, vec,
      new MarkdownParser(), new ChunkingStrategy(),
      new FileSystemVaultAdapter(), mockEmbed,
    );

    const stats = await useCase.buildFull(tmpDir, 'vault', ['code-notes']);

    expect(stats.docsProcessed).toBe(2);
    expect(stats.chunksCreated).toBe(4); // 2 headings per doc
    expect(stats.ftsRowsInserted).toBe(4);
    expect(stats.vecRowsInserted).toBe(4);
    expect(stats.embeddingFailed).toBe(false);

    // 驗證 DB 中的資料
    const dbChunks = dbMgr.getDb().prepare('SELECT COUNT(*) as cnt FROM chunks').get() as any;
    expect(dbChunks.cnt).toBe(4);
  });

  it('should incremental: modify 1 doc → only its chunks rebuilt', async () => {
    // 先做 full build
    fs.writeFileSync(path.join(vaultDir, 'auth.md'), '# Auth\nOriginal content.');
    fs.writeFileSync(path.join(vaultDir, 'user.md'), '# User\nUser content.');

    const mockEmbed = createMockEmbedding(dim);
    useCase = new IndexUseCase(
      dbMgr.getDb(), fts5, vec,
      new MarkdownParser(), new ChunkingStrategy(),
      new FileSystemVaultAdapter(), mockEmbed,
    );

    await useCase.buildFull(tmpDir, 'vault', ['code-notes']);

    // 修改 auth.md
    fs.writeFileSync(path.join(vaultDir, 'auth.md'), '# Auth\nUpdated content with changes.');

    // 增量索引只處理 dirty files
    const dirtyPath = path.join(tmpDir, 'vault', '.projecthub', 'dirty-files.txt');
    fs.writeFileSync(dirtyPath, path.join(vaultDir, 'auth.md') + '\n');

    const stats = await useCase.buildIncremental(tmpDir, 'vault', dirtyPath);

    expect(stats.docsProcessed).toBe(1); // 只處理修改的那個
    expect(stats.docsSkipped).toBe(0);
  });

  it('should degrade to FTS-only when embedding fails', async () => {
    fs.writeFileSync(path.join(vaultDir, 'test.md'), '# Test\nSome content here.');

    const failingEmbed = createFailingEmbedding();
    useCase = new IndexUseCase(
      dbMgr.getDb(), fts5, vec,
      new MarkdownParser(), new ChunkingStrategy(),
      new FileSystemVaultAdapter(), failingEmbed,
    );

    const stats = await useCase.buildFull(tmpDir, 'vault', ['code-notes']);

    expect(stats.docsProcessed).toBe(1);
    expect(stats.chunksCreated).toBe(1);
    expect(stats.ftsRowsInserted).toBe(1);
    expect(stats.vecRowsInserted).toBe(0); // embedding 失敗 → 沒有 vec rows
    expect(stats.embeddingFailed).toBe(true);
    expect(stats.warnings.length).toBeGreaterThan(0);
  });
});
