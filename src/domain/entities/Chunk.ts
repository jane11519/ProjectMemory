export interface Chunk {
  chunkId?: number;
  docId: number;
  chunkIndex: number;
  headingPath: string;
  startLine: number;
  endLine: number;
  text: string;
  textHash: string;
  tokenEstimate?: number;
}
