import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../src/infrastructure/sqlite/FTS5Adapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FTS5Adapter', () => {
  let mgr: DatabaseManager;
  let adapter: FTS5Adapter;
  const tmpDir = path.join(os.tmpdir(), 'projmem-fts5-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    mgr = new DatabaseManager(path.join(tmpDir, 'test.db'));
    adapter = new FTS5Adapter(mgr.getDb());
  });

  afterEach(() => {
    mgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should insert and search FTS5 rows with BM25', () => {
    adapter.insertRows([
      { chunkId: 1, title: 'Authentication Service', headingPath: 'Auth / Login', body: 'Handles JWT token generation and validation', tags: 'auth,jwt', properties: 'status:active' },
      { chunkId: 2, title: 'User Profile', headingPath: 'User / Profile', body: 'User profile management and avatar upload', tags: 'user,profile', properties: 'status:active' },
      { chunkId: 3, title: 'Gateway Router', headingPath: 'Gateway', body: 'API gateway routing and rate limiting', tags: 'gateway,api', properties: 'status:draft' },
    ]);

    const results = adapter.searchBM25('JWT authentication', 10);
    expect(results.size).toBeGreaterThan(0);
    // chunk 1 提到 JWT 和 auth → 應出現在結果中
    expect(results.has(1)).toBe(true);
    // 結果值應是正數（翻轉後的 BM25）
    const score = results.get(1)!;
    expect(score).toBeGreaterThan(0);
  });

  it('should respect field weights (title > body)', () => {
    adapter.insertRows([
      { chunkId: 10, title: 'gateway', headingPath: '', body: 'unrelated text', tags: '', properties: '' },
      { chunkId: 11, title: 'unrelated', headingPath: '', body: 'gateway routing logic', tags: '', properties: '' },
    ]);

    const results = adapter.searchBM25('gateway', 10);
    // title 有更高權重 → chunk 10 分數應高於 chunk 11
    const score10 = results.get(10) ?? 0;
    const score11 = results.get(11) ?? 0;
    expect(score10).toBeGreaterThan(score11);
  });

  it('should delete FTS5 rows', () => {
    adapter.insertRows([
      { chunkId: 20, title: 'test', headingPath: '', body: 'deleteme content', tags: '', properties: '' },
    ]);
    expect(adapter.searchBM25('deleteme', 10).has(20)).toBe(true);

    adapter.deleteRows([20]);
    expect(adapter.searchBM25('deleteme', 10).has(20)).toBe(false);
  });
});
