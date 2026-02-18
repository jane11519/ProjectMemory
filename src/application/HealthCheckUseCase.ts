import type Database from 'better-sqlite3';
import type { FTS5Adapter } from '../infrastructure/sqlite/FTS5Adapter.js';

export interface HealthCheckOptions {
  fix?: boolean;
}

export interface HealthReport {
  healthy: boolean;
  totalDocs: number;
  totalChunks: number;
  orphanedChunkIds: number[];
  ftsConsistent: boolean;
  ftsIssues: string[];
  fixActions: string[];
}

/**
 * 健康檢查用例：驗證索引一致性，可選修復模式
 *
 * 檢查項目：
 * 1. orphaned chunks — chunks 表中 doc_id 不存在於 docs 表
 * 2. FTS5 一致性 — 每個 chunk 都應有對應的 FTS5 row
 *
 * 修復項目（fix=true）：
 * 1. 刪除 orphaned chunks
 * 2. 重建 FTS5 索引
 */
export class HealthCheckUseCase {
  constructor(
    private readonly db: Database.Database,
    private readonly fts5: FTS5Adapter,
  ) {}

  check(options: HealthCheckOptions = {}): HealthReport {
    const fixActions: string[] = [];

    const totalDocs = (this.db.prepare('SELECT COUNT(*) AS cnt FROM docs').get() as any).cnt;
    const totalChunks = (this.db.prepare('SELECT COUNT(*) AS cnt FROM chunks').get() as any).cnt;

    // 1. 檢測 orphaned chunks（doc_id 不在 docs 表中）
    const orphanedChunkIds = this.findOrphanedChunks();

    // 2. 檢測 FTS5 一致性
    const { consistent: ftsConsistent, issues: ftsIssues } = this.checkFTS5Consistency();

    // 修復模式
    if (options.fix) {
      if (orphanedChunkIds.length > 0) {
        this.deleteOrphanedChunks(orphanedChunkIds);
        fixActions.push(`Deleted ${orphanedChunkIds.length} orphaned chunks`);
      }

      if (!ftsConsistent) {
        this.rebuildFTS5();
        fixActions.push('Rebuilt FTS5 index');
      }
    }

    const healthy = orphanedChunkIds.length === 0 && ftsConsistent;

    return {
      healthy,
      totalDocs,
      totalChunks,
      orphanedChunkIds,
      ftsConsistent,
      ftsIssues,
      fixActions,
    };
  }

  /** 找出 doc_id 不存在於 docs 表的 chunks */
  private findOrphanedChunks(): number[] {
    const rows = this.db.prepare(`
      SELECT c.chunk_id
      FROM chunks c
      LEFT JOIN docs d ON c.doc_id = d.doc_id
      WHERE d.doc_id IS NULL
    `).all() as Array<{ chunk_id: number }>;

    return rows.map((r) => r.chunk_id);
  }

  /**
   * 檢查 FTS5 一致性：每個 chunk 都應有對應的 FTS5 row
   * 用 chunks_fts 的 rowid 去比對 chunks 表的 chunk_id
   */
  private checkFTS5Consistency(): { consistent: boolean; issues: string[] } {
    const issues: string[] = [];

    // 取所有 chunk_id
    const chunkIds = this.db.prepare('SELECT chunk_id FROM chunks').all() as Array<{ chunk_id: number }>;

    // 檢查每個 chunk 是否在 FTS5 中有對應 row
    // 用一個測試查詢 — 如果 FTS5 rowid 存在，SELECT 會回傳結果
    for (const { chunk_id } of chunkIds) {
      const ftsRow = this.db.prepare(
        'SELECT rowid FROM chunks_fts WHERE rowid = ?'
      ).get(chunk_id);
      if (!ftsRow) {
        issues.push(`Chunk ${chunk_id} missing from FTS5 index`);
      }
    }

    return { consistent: issues.length === 0, issues };
  }

  /** 刪除 orphaned chunks 及其 FTS5 rows */
  private deleteOrphanedChunks(chunkIds: number[]): void {
    this.fts5.deleteRows(chunkIds);
    const stmt = this.db.prepare('DELETE FROM chunks WHERE chunk_id = ?');
    for (const id of chunkIds) {
      stmt.run(id);
    }
  }

  /** 重建 FTS5 索引：刪除所有 FTS5 rows，重新插入 */
  private rebuildFTS5(): void {
    // 取出所有有效 chunks 的資訊
    const chunks = this.db.prepare(`
      SELECT c.chunk_id, d.title, c.heading_path, c.text
      FROM chunks c
      JOIN docs d ON c.doc_id = d.doc_id
    `).all() as Array<{
      chunk_id: number;
      title: string;
      heading_path: string;
      text: string;
    }>;

    // 先刪除所有現有 FTS5 rows
    const existingIds = chunks.map((c) => c.chunk_id);
    if (existingIds.length > 0) {
      // 嘗試刪除已有的（忽略不存在的）
      try {
        this.fts5.deleteRows(existingIds);
      } catch {
        // contentless FTS5 可能已經是空的，忽略錯誤
      }
    }

    // 重新插入
    this.fts5.insertRows(
      chunks.map((c) => ({
        chunkId: c.chunk_id,
        title: c.title ?? '',
        headingPath: c.heading_path ?? '',
        body: c.text,
        tags: '',
        properties: '',
      })),
    );
  }
}
