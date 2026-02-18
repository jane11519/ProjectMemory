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
  chunking: ChunkingConfig;
  session: SessionConfig;
  namespacePatterns: string[];
}

/** 部分設定（用於 merge） */
export type PartialConfig = {
  [K in keyof ProjectHubConfig]?: Partial<ProjectHubConfig[K]>;
};
