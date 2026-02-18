import type { Session } from '../domain/entities/Session.js';
import type { SessionPort } from '../domain/ports/SessionPort.js';
import type { SessionSnapshot } from './dto/SessionSnapshot.js';

/**
 * Session 用例：管理 session 生命週期（save → compact → close）
 *
 * - save：將 snapshot 轉換為 Session entity，存入 SQLite + 寫出 vault Markdown
 * - compact：壓縮 rolling summary，減少 token 數，保留關鍵決策與搜尋足跡
 * - listActive：列出所有 active sessions
 */
export class SessionUseCase {
  /** 簡易 token 估算比例（1 token ≈ 4 字元） */
  private static readonly CHARS_PER_TOKEN = 4;
  /** compact 後的目標 summary 最大字元數 */
  private static readonly COMPACT_MAX_CHARS = 500;

  constructor(
    private readonly sessionPort: SessionPort,
    private readonly vaultSessionsDir: string,
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

    // 若已存在，保留 startedAt
    const existing = this.sessionPort.getSession(snapshot.sessionId);
    if (existing) {
      session.startedAt = existing.startedAt;
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

  /**
   * 壓縮 summary：若超過上限，截取到最近的句號邊界
   * 確保壓縮後長度 < 原始長度（當原始超過上限時）
   */
  private compactSummary(summary: string): string {
    if (summary.length <= SessionUseCase.COMPACT_MAX_CHARS) {
      return summary;
    }

    // 在上限範圍內找最後一個句號
    const truncated = summary.slice(0, SessionUseCase.COMPACT_MAX_CHARS);
    const lastPeriod = truncated.lastIndexOf('.');

    if (lastPeriod > 0) {
      return truncated.slice(0, lastPeriod + 1);
    }

    // 找不到句號，直接截斷並加省略號
    return truncated.trimEnd() + '...';
  }
}
