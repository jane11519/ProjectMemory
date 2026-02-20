import type Database from 'better-sqlite3';
import type { Session } from '../../domain/entities/Session.js';
import type { SessionPort, SessionListFilter } from '../../domain/ports/SessionPort.js';
import type { SessionSummary } from '../../domain/value-objects/SessionSummary.js';
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
        search_footprint_json, summary_json, status
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.sessionId, session.projectDir,
      session.startedAt, session.lastSavedAt,
      session.turnCount, session.rollingSummary ?? '',
      session.decisionsJson ?? '[]',
      session.searchFootprintJson ?? '[]',
      session.summaryJson ?? null,
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

  listSessions(filter?: SessionListFilter): Session[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.hasSummary === true) {
      conditions.push('summary_json IS NOT NULL');
    } else if (filter?.hasSummary === false) {
      conditions.push('summary_json IS NULL');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ? `LIMIT ?` : '';
    if (filter?.limit) params.push(filter.limit);

    const rows = this.db.prepare(
      `SELECT * FROM sessions ${where} ORDER BY last_saved_at DESC ${limit}`
    ).all(...params) as any[];

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
    const summary: SessionSummary | undefined = session.summaryJson
      ? this.safeJsonParse(session.summaryJson, undefined)
      : undefined;

    let content = `---
session_id: "${session.sessionId}"
project_dir: "${session.projectDir}"
started_at: ${session.startedAt}
last_saved_at: ${session.lastSavedAt}
turn_count: ${session.turnCount}
status: ${session.status}
---

# Session: ${session.sessionId}
`;

    // Summary 區塊（當 summaryJson 存在時優先顯示）
    if (summary) {
      content += `
## Summary

### Overview
${summary.overview}

### Key Decisions
${summary.decisions.length > 0 ? summary.decisions.map((d) => `- ${d}`).join('\n') : '_None._'}

### Outcomes
${summary.outcomes.length > 0 ? summary.outcomes.map((o) => `- ${o}`).join('\n') : '_None._'}

### Open Items
${summary.openItems.length > 0 ? summary.openItems.map((i) => `- [ ] ${i}`).join('\n') : '_None._'}

### Tags
${summary.tags.length > 0 ? summary.tags.map((t) => `\`${t}\``).join(' ') : '_None._'}
`;
    }

    // Rolling Summary / Decisions / Search Footprint（既有區塊）
    content += `
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
      summaryJson: row.summary_json || undefined,
      status: row.status,
    };
  }

  private safeJsonParse(json: string | undefined, fallback: any): any {
    if (!json) return fallback;
    try { return JSON.parse(json); } catch { return fallback; }
  }
}
