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
  /** RRF 融合分數（rrf 融合模式下） */
  rrfScore?: number;
  /** LLM Re-ranker 相關性分數（deep 模式下） */
  rerankerScore?: number;
  /** 適用的 context metadata（階層繼承） */
  contexts?: string[];
  /** 關聯的原始碼檔案路徑（從 frontmatter ref_code_paths 讀取） */
  refCodePaths?: string[];
}
