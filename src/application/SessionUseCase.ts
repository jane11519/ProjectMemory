import fs from 'node:fs';
import path from 'node:path';
import type { Session } from '../domain/entities/Session.js';
import type { SessionPort, SessionListFilter } from '../domain/ports/SessionPort.js';
import type { SessionSummary } from '../domain/value-objects/SessionSummary.js';
import type { SessionSnapshot } from './dto/SessionSnapshot.js';
import { parseTranscript, type TranscriptSummary } from '../infrastructure/session/TranscriptParser.js';

/**
 * Session 用例：管理 session 生命週期（save → compact → close）
 *
 * - save：將 snapshot 轉換為 Session entity，存入 SQLite + 寫出 vault Markdown
 * - compact：壓縮 rolling summary，減少 token 數，保留關鍵決策與搜尋足跡
 * - listActive：列出所有 active sessions
 * - listSessions：帶過濾條件的 session 查詢
 * - updateSummary：儲存 Claude 生成的結構化摘要
 * - getTranscript：從 vault 讀取完整 transcript
 */
export class SessionUseCase {
  /** 簡易 token 估算比例（1 token ≈ 4 字元） */
  private static readonly CHARS_PER_TOKEN = 4;

  constructor(
    private readonly sessionPort: SessionPort,
    private readonly vaultSessionsDir: string,
    /** vault 根目錄，用於讀取 transcript 備份 */
    private readonly vaultRoot?: string,
  ) {}

  /**
   * 保存 session snapshot 到 SQLite + vault Markdown
   * 若 session 已存在則更新
   */
  async save(snapshot: SessionSnapshot): Promise<Session> {
    const now = Date.now();

    const session: Session = {
      sessionId: snapshot.sessionId,
      projectDir: snapshot.projectDir,
      startedAt: now,
      lastSavedAt: now,
      turnCount: snapshot.turnCount,
      rollingSummary: snapshot.rollingSummary || undefined,
      decisionsJson: JSON.stringify(snapshot.decisions),
      searchFootprintJson: JSON.stringify(snapshot.searchFootprint),
      status: snapshot.status,
    };

    // 若已存在，保留 startedAt 和 summaryJson
    const existing = this.sessionPort.getSession(snapshot.sessionId);
    if (existing) {
      session.startedAt = existing.startedAt;
      session.summaryJson = existing.summaryJson;
    }

    this.sessionPort.saveSession(session);
    await this.sessionPort.writeSessionMarkdown(session, this.vaultSessionsDir);

    return session;
  }

  /**
   * 壓縮 session：縮短 rolling summary，更新 status 為 compacted
   * 保留 decisions 和 search footprint 不變
   *
   * 壓縮策略：截取前 COMPACT_MAX_CHARS 字元，以句號斷句
   */
  async compact(sessionId: string): Promise<Session | undefined> {
    const session = this.sessionPort.getSession(sessionId);
    if (!session) return undefined;

    const summary = session.rollingSummary ?? '';
    const compacted = this.compactSummary(summary);

    const updated: Session = {
      ...session,
      rollingSummary: compacted,
      lastSavedAt: Date.now(),
      status: 'compacted',
    };

    this.sessionPort.saveSession(updated);
    await this.sessionPort.writeSessionMarkdown(updated, this.vaultSessionsDir);

    return updated;
  }

  /** 列出所有 active sessions */
  listActive(): Session[] {
    return this.sessionPort.listActiveSessions();
  }

  /** 帶過濾條件的 session 查詢 */
  listSessions(filter?: SessionListFilter): Session[] {
    return this.sessionPort.listSessions(filter);
  }

  /**
   * 儲存 Claude 生成的結構化摘要
   * 更新 DB 中的 summaryJson 欄位，並重新寫出 vault Markdown
   */
  async updateSummary(sessionId: string, summary: SessionSummary): Promise<Session | undefined> {
    const session = this.sessionPort.getSession(sessionId);
    if (!session) return undefined;

    const merged = this.mergeSummary(session.summaryJson, summary);

    const updated: Session = {
      ...session,
      summaryJson: JSON.stringify(merged),
      lastSavedAt: Date.now(),
    };

    this.sessionPort.saveSession(updated);
    await this.sessionPort.writeSessionMarkdown(updated, this.vaultSessionsDir);
    return updated;
  }

  /**
   * 合併既有摘要與新摘要：overview 以新值覆寫，陣列欄位去重合併
   * 若既有 JSON 不存在或無法解析，直接採用新摘要
   */
  private mergeSummary(existingJson: string | undefined, incoming: SessionSummary): SessionSummary {
    if (!existingJson) return incoming;

    let existing: SessionSummary;
    try {
      existing = JSON.parse(existingJson);
    } catch {
      return incoming;
    }

    return {
      overview: incoming.overview,
      decisions: [...new Set([...(existing.decisions ?? []), ...incoming.decisions])],
      outcomes: [...new Set([...(existing.outcomes ?? []), ...incoming.outcomes])],
      openItems: [...new Set([...(existing.openItems ?? []), ...incoming.openItems])],
      tags: [...new Set([...(existing.tags ?? []), ...incoming.tags])],
    };
  }

  /**
   * 從 vault 讀取完整 transcript
   * transcript 備份位於 {vaultRoot}/.projmem/transcripts/{sessionId}.jsonl
   */
  getTranscript(sessionId: string): TranscriptSummary | undefined {
    if (!this.vaultRoot) return undefined;

    const backupPath = path.join(this.vaultRoot, '.projmem', 'transcripts', `${sessionId}.jsonl`);
    if (!fs.existsSync(backupPath)) return undefined;

    const jsonlContent = fs.readFileSync(backupPath, 'utf-8');
    return parseTranscript(jsonlContent);
  }

  /**
   * 壓縮 summary：保留完整內容，不截斷
   */
  private compactSummary(summary: string): string {
    return summary;
  }
}
