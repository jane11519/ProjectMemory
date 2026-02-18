import type Database from 'better-sqlite3';

export interface VecRow {
  chunkId: number;
  embedding: Float32Array;
}

/**
 * sqlite-vec adapter：管理 vec0 虛擬表的插入、刪除與 KNN 查詢
 * 回傳相似度（1 / (1 + distance)），越大越好
 *
 * 注意：sqlite-vec v0.1.x 的 PK 型別檢查要求 SQLite INTEGER，
 * better-sqlite3 的 JS number 會被綁為 REAL，需用 BigInt 才會綁為 INTEGER。
 */
export class SqliteVecAdapter {
  constructor(private readonly db: Database.Database) {}

  insertRows(rows: VecRow[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO chunks_vec(rowid, embedding) VALUES(?, ?)'
    );
    for (const row of rows) {
      // BigInt 確保 better-sqlite3 綁定為 SQLite INTEGER
      stmt.run(BigInt(row.chunkId), Buffer.from(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength));
    }
  }

  deleteRows(chunkIds: number[]): void {
    const stmt = this.db.prepare('DELETE FROM chunks_vec WHERE rowid = ?');
    for (const id of chunkIds) {
      stmt.run(BigInt(id));
    }
  }

  /**
   * KNN 查詢，回傳 Map<chunkId, similarity>
   * similarity = 1 / (1 + distance)，越大越好
   */
  searchKNN(queryVec: Float32Array, topK: number): Map<number, number> {
    const rows = this.db.prepare(`
      SELECT rowid AS chunk_id, distance
      FROM chunks_vec
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `).all(Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength), topK) as Array<{ chunk_id: number; distance: number }>;

    const result = new Map<number, number>();
    for (const row of rows) {
      result.set(Number(row.chunk_id), 1.0 / (1.0 + row.distance));
    }
    return result;
  }
}
