export interface SearchResult {
  chunkId: number;
  docPath: string;
  title: string;
  headingPath: string;
  startLine: number;
  endLine: number;
  namespaceName: string;
  finalScore: number;
  lexNorm: number;
  vecNorm: number;
  snippet?: string;
  text?: string;
}
