import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { PRAGMA_SQL, SCHEMA_SQL, vecTableSQL } from './schema.js';
import { Logger } from '../../shared/Logger.js';

/**
 * SQLite 資料庫管理器
 *
 * 負責：初始化 DB、載入 sqlite-vec extension、執行 schema、
 * 記錄與驗證 embedding 維度（避免模型切換後維度不符）。
 */
export class DatabaseManager {
  private db: Database.Database;
  private logger: Logger;

  constructor(
    dbPath: string,
    private readonly embeddingDimension: number = 1536,
  ) {
    this.logger = new Logger('DatabaseManager');

    this.db = new Database(dbPath);

    // 載入 sqlite-vec extension
    this.db.loadExtension(sqliteVec.getLoadablePath());

    // 設定 PRAGMA（逐行執行，因為 PRAGMA 不支援批次）
    for (const line of PRAGMA_SQL.trim().split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        this.db.pragma(trimmed.replace('PRAGMA ', '').replace(';', ''));
      }
    }

    // 建立 schema
    this.db.exec(SCHEMA_SQL);
    this.db.exec(vecTableSQL(this.embeddingDimension));

    // 寫入 schema 版本
    this.db.prepare(
      "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', '1')"
    ).run();

    // 驗證 embedding 維度一致性
    this.validateEmbeddingDimension();

    this.logger.info('Database initialized', { dbPath, embeddingDimension });
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  /**
   * 記錄並驗證 embedding 維度
   *
   * 當 embedding model 改變導致維度不同時，拒絕啟動並提示使用者重建索引。
   * 首次使用時記錄維度到 schema_meta。
   */
  private validateEmbeddingDimension(): void {
    const row = this.db.prepare(
      "SELECT value FROM schema_meta WHERE key = 'embedding_dimension'"
    ).get() as { value: string } | undefined;

    if (!row) {
      // 首次記錄
      this.db.prepare(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('embedding_dimension', ?)"
      ).run(String(this.embeddingDimension));
      return;
    }

    const storedDimension = parseInt(row.value, 10);
    if (storedDimension !== this.embeddingDimension) {
      throw new Error(
        `Embedding dimension mismatch: database has ${storedDimension}, config specifies ${this.embeddingDimension}. ` +
        `Run "projecthub reindex --force" to rebuild the vector index with the new dimension.`
      );
    }
  }
}
