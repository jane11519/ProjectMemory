import type Database from 'better-sqlite3';

export interface FTSRow {
  chunkId: number;
  title: string;
  headingPath: string;
  body: string;
  tags: string;
  properties: string;
}

/**
 * FTS5 adapter：管理 contentless FTS5 表的 CRUD 與 BM25 查詢
 * field weights: title=8, heading_path=4, body=1, tags=2, properties=3
 */
export class FTS5Adapter {
  constructor(private readonly db: Database.Database) {}

  insertRows(rows: FTSRow[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO chunks_fts(rowid, title, heading_path, body, tags, properties) VALUES(?, ?, ?, ?, ?, ?)'
    );
    for (const row of rows) {
      stmt.run(row.chunkId, row.title, row.headingPath, row.body, row.tags, row.properties);
    }
  }

  deleteRows(chunkIds: number[]): void {
    const stmt = this.db.prepare(
      'DELETE FROM chunks_fts WHERE rowid = ?'
    );
    for (const id of chunkIds) {
      stmt.run(id);
    }
  }

  /**
   * BM25 搜尋，回傳 Map<chunkId, score>
   * score 已翻轉為「越大越好」（原始 bm25() 越小越好，這裡取負值）
   */
  searchBM25(query: string, topK: number, namespaceId?: number): Map<number, number> {
    const sanitized = this.sanitizeQuery(query);
    if (!sanitized) return new Map();

    const rows = this.db.prepare(`
      SELECT rowid AS chunk_id, bm25(chunks_fts, 8.0, 4.0, 1.0, 2.0, 3.0) AS bm25_score
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY bm25_score
      LIMIT ?
    `).all(sanitized, topK) as Array<{ chunk_id: number; bm25_score: number }>;

    const result = new Map<number, number>();
    for (const row of rows) {
      result.set(row.chunk_id, -row.bm25_score); // 翻轉：越大越好
    }
    return result;
  }

  /**
   * 消毒 FTS5 查詢：將每個 token 用雙引號包裹，
   * 避免 FTS5 特殊字元（如 - 被視為 NOT）造成語法錯誤
   */
  private sanitizeQuery(query: string): string {
    // 以空白分 token，每個 token 用雙引號包裹（內部雙引號轉義）
    return query
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token.replace(/"/g, '""')}"`)
      .join(' ');
  }
}
