import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('DatabaseManager', () => {
  const tmpDir = path.join(os.tmpdir(), 'projmem-test-' + Date.now());
  const dbPath = path.join(tmpDir, 'test.db');

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create database with WAL mode and all tables', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const mgr = new DatabaseManager(dbPath);
    const db = mgr.getDb();

    // 確認 WAL 模式
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    // 確認所有表存在
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);

    expect(tables).toContain('namespaces');
    expect(tables).toContain('docs');
    expect(tables).toContain('chunks');
    expect(tables).toContain('audit_log');
    expect(tables).toContain('sessions');
    expect(tables).toContain('schema_meta');

    // 確認 FTS5 虛擬表
    const vtables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%'"
    ).all().map((r: any) => r.name);
    expect(vtables).toContain('chunks_fts');

    // 確認 sqlite-vec 虛擬表
    const vecTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%vec0%'"
    ).all().map((r: any) => r.name);
    expect(vecTables).toContain('chunks_vec');

    mgr.close();
  });

  it('should set busy_timeout', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const mgr = new DatabaseManager(dbPath);
    const db = mgr.getDb();

    const timeout = db.pragma('busy_timeout', { simple: true });
    expect(Number(timeout)).toBeGreaterThanOrEqual(5000);

    mgr.close();
  });
});
