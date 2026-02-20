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
  /** JSON-stringified SessionSummary，由 Claude 生成的結構化摘要 */
  summaryJson?: string;
  status: SessionStatus;
}
