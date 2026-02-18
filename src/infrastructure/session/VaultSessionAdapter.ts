import type Database from 'better-sqlite3';
import type { Session } from '../../domain/entities/Session.js';
import type { SessionPort } from '../../domain/ports/SessionPort.js';
import type { VaultPort } from '../../domain/ports/VaultPort.js';

/**
 * Session adapter：SQLite 持久化 + vault Markdown 摘要寫出
 */
export class VaultSessionAdapter implements SessionPort {
  constructor(
    private readonly db: Database.Database,
    private readonly vault: VaultPort,
  ) {}

  saveSession(session: Session): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions(
        session_id, project_dir, started_at, last_saved_at,
        turn_count, rolling_summary, decisions_json,
        search_footprint_json, status
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.sessionId, session.projectDir,
      session.startedAt, session.lastSavedAt,
      session.turnCount, session.rollingSummary ?? '',
      session.decisionsJson ?? '[]',
      session.searchFootprintJson ?? '[]',
      session.status,
    );
  }

  getSession(sessionId: string): Session | undefined {
    const row = this.db.prepare(
      'SELECT * FROM sessions WHERE session_id = ?'
    ).get(sessionId) as any;
    if (!row) return undefined;
    return this.rowToSession(row);
  }

  listActiveSessions(): Session[] {
    const rows = this.db.prepare(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY last_saved_at DESC"
    ).all() as any[];
    return rows.map((r) => this.rowToSession(r));
  }

  updateSession(sessionId: string, updates: Partial<Session>): void {
    const existing = this.getSession(sessionId);
    if (!existing) return;

    const merged: Session = { ...existing, ...updates };
    this.saveSession(merged);
  }

  /** 寫出 session 的 Markdown 摘要到 vault */
  async writeSessionMarkdown(session: Session, vaultSessionsDir: string): Promise<void> {
    await this.vault.ensureDirectory(vaultSessionsDir);

    const date = new Date(session.lastSavedAt).toISOString().slice(0, 10);
    const fileName = `${date}_${session.sessionId}.md`;
    const filePath = `${vaultSessionsDir}/${fileName}`;

    const decisions = this.safeJsonParse(session.decisionsJson, []);
    const footprint = this.safeJsonParse(session.searchFootprintJson, []);

    const content = `---
session_id: "${session.sessionId}"
project_dir: "${session.projectDir}"
started_at: ${session.startedAt}
last_saved_at: ${session.lastSavedAt}
turn_count: ${session.turnCount}
status: ${session.status}
---

# Session: ${session.sessionId}

## Rolling Summary

${session.rollingSummary || '_No summary yet._'}

## Decisions

${decisions.length > 0 ? decisions.map((d: string) => `- ${d}`).join('\n') : '_No decisions recorded._'}

## Search Footprint

${footprint.length > 0 ? footprint.map((q: string) => `- \`${q}\``).join('\n') : '_No searches performed._'}
`;

    await this.vault.writeFile(filePath, content);
  }

  private rowToSession(row: any): Session {
    return {
      sessionId: row.session_id,
      projectDir: row.project_dir,
      startedAt: row.started_at,
      lastSavedAt: row.last_saved_at,
      turnCount: row.turn_count,
      rollingSummary: row.rolling_summary || undefined,
      decisionsJson: row.decisions_json || undefined,
      searchFootprintJson: row.search_footprint_json || undefined,
      status: row.status,
    };
  }

  private safeJsonParse(json: string | undefined, fallback: any): any {
    if (!json) return fallback;
    try { return JSON.parse(json); } catch { return fallback; }
  }
}
