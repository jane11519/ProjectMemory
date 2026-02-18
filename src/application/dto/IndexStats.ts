/** 索引操作統計 */
export interface IndexStats {
  docsProcessed: number;
  chunksCreated: number;
  ftsRowsInserted: number;
  vecRowsInserted: number;
  docsSkipped: number;
  docsDeleted: number;
  embeddingFailed: boolean;
  warnings: string[];
  durationMs: number;
}
