export type SessionStatus = 'active' | 'compacted' | 'closed';

export interface Session {
  sessionId: string;
  projectDir: string;
  startedAt: number;
  lastSavedAt: number;
  turnCount: number;
  rollingSummary?: string;
  decisionsJson?: string;
  searchFootprintJson?: string;
  status: SessionStatus;
}
