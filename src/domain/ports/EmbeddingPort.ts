export interface EmbeddingResult {
  vector: Float32Array;
  tokensUsed: number;
}

export interface EmbeddingPort {
  readonly providerId: string;
  readonly dimension: number;
  readonly modelId: string;
  embed(texts: string[]): Promise<EmbeddingResult[]>;
  embedOne(text: string): Promise<EmbeddingResult>;
  isHealthy(): Promise<boolean>;
}
