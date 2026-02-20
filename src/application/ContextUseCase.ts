import type Database from 'better-sqlite3';
import type { PathContext } from '../domain/entities/PathContext.js';

/**
 * Context Use Case
 *
 * 設計意圖：管理階層式 context metadata。
 * CRUD 操作：addContext、listContexts、checkContext、removeContext。
 * 階層繼承：查詢特定路徑時，同時回傳所有祖先路徑的 context。
 */
export class ContextUseCase {
  constructor(private readonly db: Database.Database) {
    this.ensureTable();
  }

  /** 新增 context */
  addContext(virtualPath: string, description: string): PathContext {
    const now = Date.now();
    const normalized = this.normalizePath(virtualPath);

    const existing = this.db.prepare(
      'SELECT context_id FROM path_contexts WHERE virtual_path = ?',
    ).get(normalized) as { context_id: number } | undefined;

    if (existing) {
      // 更新既有 context
      this.db.prepare(
        'UPDATE path_contexts SET description = ?, updated_at = ? WHERE context_id = ?',
      ).run(description, now, existing.context_id);

      return {
        contextId: existing.context_id,
        virtualPath: normalized,
        description,
        createdAt: now,
        updatedAt: now,
      };
    }

    const result = this.db.prepare(
      'INSERT INTO path_contexts (virtual_path, description, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(normalized, description, now, now);

    return {
      contextId: Number(result.lastInsertRowid),
      virtualPath: normalized,
      description,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 列出所有 contexts */
  listContexts(): PathContext[] {
    const rows = this.db.prepare(
      'SELECT context_id, virtual_path, description, created_at, updated_at FROM path_contexts ORDER BY virtual_path',
    ).all() as Array<{
      context_id: number;
      virtual_path: string;
      description: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((r) => ({
      contextId: r.context_id,
      virtualPath: r.virtual_path,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * 檢查路徑的 applicable contexts（含階層繼承）
   *
   * 例如路徑 "code-notes/services/auth" 會回傳：
   * - "code-notes/services/auth" 的 context（若存在）
   * - "code-notes/services" 的 context（若存在）
   * - "code-notes" 的 context（若存在）
   */
  checkContext(virtualPath: string): PathContext[] {
    const normalized = this.normalizePath(virtualPath);
    const ancestors = this.getAncestorPaths(normalized);

    if (ancestors.length === 0) return [];

    const placeholders = ancestors.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT context_id, virtual_path, description, created_at, updated_at
       FROM path_contexts
       WHERE virtual_path IN (${placeholders})
       ORDER BY length(virtual_path) DESC`,
    ).all(...ancestors) as Array<{
      context_id: number;
      virtual_path: string;
      description: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((r) => ({
      contextId: r.context_id,
      virtualPath: r.virtual_path,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** 移除 context */
  removeContext(virtualPath: string): boolean {
    const normalized = this.normalizePath(virtualPath);
    const result = this.db.prepare(
      'DELETE FROM path_contexts WHERE virtual_path = ?',
    ).run(normalized);

    return result.changes > 0;
  }

  /**
   * 根據 docPath 找到所有 applicable contexts
   * 用於搜尋結果豐富化
   */
  getContextsForDocPath(docPath: string): string[] {
    const contexts = this.checkContext(docPath);
    return contexts.map((c) => `${c.virtualPath}: ${c.description}`);
  }

  // ── 私有方法 ──

  /** 正規化路徑：移除 protocol prefix 和尾端斜線 */
  private normalizePath(path: string): string {
    return path
      .replace(/^projmem:\/\//, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  /** 取得路徑及其所有祖先路徑 */
  private getAncestorPaths(normalizedPath: string): string[] {
    const parts = normalizedPath.split('/');
    const paths: string[] = [];

    for (let i = parts.length; i > 0; i--) {
      paths.push(parts.slice(0, i).join('/'));
    }

    return paths;
  }

  /** 確保 path_contexts 表存在 */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS path_contexts (
        context_id INTEGER PRIMARY KEY,
        virtual_path TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }
}
