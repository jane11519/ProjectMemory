import OpenAI from 'openai';
import type { EmbeddingPort, EmbeddingResult } from '../../domain/ports/EmbeddingPort.js';
import { EmbeddingUnavailableError, EmbeddingRateLimitError } from '../../domain/errors/DomainErrors.js';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimension?: number;
  baseUrl?: string;
  maxRetries?: number;
}

export class OpenAIEmbeddingAdapter implements EmbeddingPort {
  readonly providerId = 'openai';
  readonly dimension: number;
  readonly modelId: string;
  private client: OpenAI;

  constructor(config: OpenAIEmbeddingConfig) {
    this.dimension = config.dimension ?? 1536;
    this.modelId = config.model ?? 'text-embedding-3-small';
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: config.maxRetries ?? 2,
    });
  }

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    try {
      const response = await this.client.embeddings.create({
        model: this.modelId,
        input: texts,
        encoding_format: 'float',
      });

      return response.data.map((item) => ({
        vector: new Float32Array(item.embedding),
        tokensUsed: response.usage?.total_tokens ?? 0,
      }));
    } catch (err: any) {
      if (err?.status === 429) {
        throw new EmbeddingRateLimitError(`Rate limited by OpenAI`, { cause: err });
      }
      throw new EmbeddingUnavailableError(
        `OpenAI embedding failed: ${err?.message ?? 'unknown error'}`,
        { cause: err },
      );
    }
  }

  async embedOne(text: string): Promise<EmbeddingResult> {
    const [result] = await this.embed([text]);
    return result;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.embed(['health check']);
      return true;
    } catch {
      return false;
    }
  }
}
