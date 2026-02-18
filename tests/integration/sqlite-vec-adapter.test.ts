import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { SqliteVecAdapter } from '../../src/infrastructure/sqlite/SqliteVecAdapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SqliteVecAdapter', () => {
  let mgr: DatabaseManager;
  let adapter: SqliteVecAdapter;
  const dim = 4; // 測試用小維度
  const tmpDir = path.join(os.tmpdir(), 'projecthub-vec-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    mgr = new DatabaseManager(path.join(tmpDir, 'test.db'), dim);
    adapter = new SqliteVecAdapter(mgr.getDb());
  });

  afterEach(() => {
    mgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should insert and query vectors via KNN', () => {
    const v1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    const v2 = new Float32Array([0.0, 1.0, 0.0, 0.0]);
    const v3 = new Float32Array([0.9, 0.1, 0.0, 0.0]); // 最接近 v1

    adapter.insertRows([
      { chunkId: 1, embedding: v1 },
      { chunkId: 2, embedding: v2 },
      { chunkId: 3, embedding: v3 },
    ]);

    const queryVec = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    const results = adapter.searchKNN(queryVec, 3);

    expect(results.size).toBe(3);
    // chunk 1 完全匹配 → 相似度最高（距離最小）
    const sim1 = results.get(1)!;
    const sim2 = results.get(2)!;
    expect(sim1).toBeGreaterThan(sim2);
  });

  it('should delete vector rows', () => {
    const v1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    adapter.insertRows([{ chunkId: 100, embedding: v1 }]);

    const before = adapter.searchKNN(v1, 10);
    expect(before.has(100)).toBe(true);

    adapter.deleteRows([100]);
    const after = adapter.searchKNN(v1, 10);
    expect(after.has(100)).toBe(false);
  });
});
