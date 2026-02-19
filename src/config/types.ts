/** Embedding 提供者設定 */
export interface EmbeddingConfig {
  provider: 'openai' | 'local';
  model: string;
  dimension: number;
  maxBatchSize: number;
  apiKey?: string;
  baseUrl?: string;
}

/** 搜尋權重設定 */
export interface SearchWeights {
  lexical: number;
  vector: number;
}

/** FTS5 欄位權重 */
export interface FTS5FieldWeights {
  title: number;
  headingPath: number;
  body: number;
  tags: number;
  properties: number;
}

/** 搜尋設定 */
export interface SearchConfig {
  defaultTopK: number;
  candidateMultiplier: number;
  weights: SearchWeights;
  fts5FieldWeights: FTS5FieldWeights;
  /** 融合方法：linear（原始線性加權）或 rrf（Reciprocal Rank Fusion） */
  fusionMethod: 'linear' | 'rrf';
  /** RRF 平滑常數 k（預設 60） */
  rrfK: number;
  /** 強訊號偵測：最低正規化 BM25 分數閾值 */
  strongSignalMinScore: number;
  /** 強訊號偵測：最低分數差距閾值 */
  strongSignalMinGap: number;
  /** Re-ranking 候選數量上限 */
  rerankCandidateLimit: number;
  /** Re-ranking blending 權重（RRF 與 reranker 的混合比例） */
  rerankBlending: {
    /** ranks 1-3 的 RRF 權重 */
    topRrfWeight: number;
    /** ranks 4-10 的 RRF 權重 */
    midRrfWeight: number;
    /** ranks 11+ 的 RRF 權重 */
    tailRrfWeight: number;
  };
}

/** LLM 設定 */
export interface LLMConfig {
  /** LLM 提供者：'openai-compatible' 或 'none'（停用） */
  provider: 'openai-compatible' | 'none';
  /** API base URL（OpenAI-compatible endpoint） */
  baseUrl: string;
  /** API key（可選，某些本地服務不需要） */
  apiKey?: string;
  /** Query Expansion / general 用途的模型 */
  model: string;
  /** Re-ranking 用途的模型（可選，預設使用 model） */
  rerankerModel?: string;
  /** Reranker 策略：'chat' 用 chat completions 請模型評分，'endpoint' 用 /v1/rerank API */
  rerankerStrategy?: 'chat' | 'endpoint';
  /** 快取 TTL（毫秒，預設 1 小時） */
  cacheTTLMs: number;
}

/** Chunk 切分設定 */
export interface ChunkingConfig {
  maxTokensPerChunk: number;
  overlapLines: number;
}

/** Vault 設定 */
export interface VaultConfig {
  root: string;
  folders: string[];
}

/** 索引路徑設定 */
export interface IndexPathConfig {
  dbPath: string;
  dirtyFilePath: string;
  auditLogPath: string;
}

/** Session 設定 */
export interface SessionConfig {
  autoSaveAfterTurns: number;
  compactTokenThreshold: number;
}

/** 完整設定 */
export interface ProjectHubConfig {
  version: number;
  vault: VaultConfig;
  index: IndexPathConfig;
  embedding: EmbeddingConfig;
  search: SearchConfig;
  llm: LLMConfig;
  chunking: ChunkingConfig;
  session: SessionConfig;
  namespacePatterns: string[];
}

/** 部分設定（用於 merge） */
export type PartialConfig = {
  [K in keyof ProjectHubConfig]?: Partial<ProjectHubConfig[K]>;
};
