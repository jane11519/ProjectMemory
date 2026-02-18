import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HealthCheckUseCase } from '../../../src/application/HealthCheckUseCase.js';
import { DatabaseManager } from '../../../src/infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../../src/infrastructure/sqlite/FTS5Adapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('HealthCheckUseCase', () => {
  const dim = 4;
  const tmpDir = path.join(os.tmpdir(), 'projecthub-health-' + Date.now());
  let dbMgr: DatabaseManager;
  let fts5: FTS5Adapter;
  let useCase: HealthCheckUseCase;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    dbMgr = new DatabaseManager(path.join(tmpDir, 'test.db'), dim);
    fts5 = new FTS5Adapter(dbMgr.getDb());
    useCase = new HealthCheckUseCase(dbMgr.getDb(), fts5);

    // 插入 namespace + doc + chunks 供測試
    const db = dbMgr.getDb();
    db.prepare(
      "INSERT INTO namespaces(name, kind, discovered_at) VALUES('root', 'root', ?)"
    ).run(Date.now());

    db.prepare(`
      INSERT INTO docs(namespace_id, doc_path, title, content_hash, file_size, mtime_ms, indexed_at)
      VALUES(1, 'test.md', 'Test Doc', 'abc123', 100, ?, ?)
    `).run(Date.now(), Date.now());

    // 插入 2 個 chunks
    db.prepare(`
      INSERT INTO chunks(doc_id, chunk_index, heading_path, start_line, end_line, text, text_hash)
      VALUES(1, 0, 'Test Doc', 1, 5, 'Hello world test content', 'hash1')
    `).run();
    db.prepare(`
      INSERT INTO chunks(doc_id, chunk_index, heading_path, start_line, end_line, text, text_hash)
      VALUES(1, 1, 'Test Doc > Section', 6, 10, 'More test content here', 'hash2')
    `).run();

    // 同步插入 FTS5 rows
    fts5.insertRows([
      { chunkId: 1, title: 'Test Doc', headingPath: 'Test Doc', body: 'Hello world test content', tags: '', properties: '' },
      { chunkId: 2, title: 'Test Doc', headingPath: 'Test Doc > Section', body: 'More test content here', tags: '', properties: '' },
    ]);
  });

  afterEach(() => {
    dbMgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should report healthy when FTS5 and chunks are consistent', () => {
    const report = useCase.check();

    expect(report.healthy).toBe(true);
    expect(report.totalChunks).toBe(2);
    expect(report.totalDocs).toBe(1);
    expect(report.orphanedChunkIds).toHaveLength(0);
    expect(report.ftsConsistent).toBe(true);
  });

  it('should detect orphaned chunks (chunks without matching doc)', () => {
    // 插入一個 orphan chunk（doc_id 不存在的情況用直接插入繞過 FK）
    const db = dbMgr.getDb();
    // 先暫時停用 FK 來插入 orphan
    db.pragma('foreign_keys = OFF');
    db.prepare(`
      INSERT INTO chunks(chunk_id, doc_id, chunk_index, heading_path, start_line, end_line, text, text_hash)
      VALUES(99, 999, 0, 'Orphan', 1, 2, 'orphan text', 'orphan_hash')
    `).run();
    db.pragma('foreign_keys = ON');

    const report = useCase.check();

    expect(report.healthy).toBe(false);
    expect(report.orphanedChunkIds).toContain(99);
  });

  it('should fix orphaned chunks when fix mode is enabled', () => {
    const db = dbMgr.getDb();
    db.pragma('foreign_keys = OFF');
    db.prepare(`
      INSERT INTO chunks(chunk_id, doc_id, chunk_index, heading_path, start_line, end_line, text, text_hash)
      VALUES(99, 999, 0, 'Orphan', 1, 2, 'orphan text', 'orphan_hash')
    `).run();
    db.pragma('foreign_keys = ON');

    const report = useCase.check({ fix: true });

    expect(report.orphanedChunkIds).toContain(99);
    expect(report.fixActions).toContain('Deleted 1 orphaned chunks');

    // 驗證 orphan 已被清除
    const remaining = db.prepare('SELECT chunk_id FROM chunks WHERE chunk_id = 99').get();
    expect(remaining).toBeUndefined();
  });

  it('should detect FTS5 inconsistency (missing FTS rows)', () => {
    // 刪除 FTS5 中的一行，但保留 chunks 表中的對應 row
    fts5.deleteRows([2]);

    const report = useCase.check();

    expect(report.ftsConsistent).toBe(false);
    expect(report.ftsIssues.length).toBeGreaterThan(0);
  });

  it('should rebuild FTS5 when fix mode is enabled and FTS is inconsistent', () => {
    // 刪除 FTS5 中所有行
    fts5.deleteRows([1, 2]);

    const report = useCase.check({ fix: true });

    expect(report.fixActions).toContain('Rebuilt FTS5 index');

    // 驗證 FTS5 已修復：搜尋應能找到結果
    const results = fts5.searchBM25('test', 10);
    expect(results.size).toBeGreaterThan(0);
  });
});
