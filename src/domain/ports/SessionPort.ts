import type { Session, SessionStatus } from '../entities/Session.js';

/** listSessions 的過濾條件 */
export interface SessionListFilter {
  status?: SessionStatus;
  /** true = 有 summary, false = 無 summary */
  hasSummary?: boolean;
  limit?: number;
}

export interface SessionPort {
  saveSession(session: Session): void;
  getSession(sessionId: string): Session | undefined;
  listActiveSessions(): Session[];
  /** 帶過濾條件的 session 查詢 */
  listSessions(filter?: SessionListFilter): Session[];
  updateSession(sessionId: string, updates: Partial<Session>): void;

  /** 寫出 session 的 Markdown 摘要到 vault */
  writeSessionMarkdown(session: Session, vaultSessionsDir: string): Promise<void>;
}
