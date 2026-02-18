/** Session 快照（用於 save/compact/diff） */
export interface SessionSnapshot {
  sessionId: string;
  projectDir: string;
  turnCount: number;
  rollingSummary: string;
  decisions: string[];
  searchFootprint: string[];
  status: 'active' | 'compacted' | 'closed';
}
