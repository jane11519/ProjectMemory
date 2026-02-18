import type { Session } from '../entities/Session.js';

export interface SessionPort {
  saveSession(session: Session): void;
  getSession(sessionId: string): Session | undefined;
  listActiveSessions(): Session[];
  updateSession(sessionId: string, updates: Partial<Session>): void;

  /** 寫出 session 的 Markdown 摘要到 vault */
  writeSessionMarkdown(session: Session, vaultSessionsDir: string): Promise<void>;
}
