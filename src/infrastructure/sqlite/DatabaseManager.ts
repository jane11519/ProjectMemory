import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { PRAGMA_SQL, SCHEMA_SQL, vecTableSQL } from './schema.js';
import { Logger } from '../../shared/Logger.js';

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

    this.logger.info('Database initialized', { dbPath, embeddingDimension });
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
