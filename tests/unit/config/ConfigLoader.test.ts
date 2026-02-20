import { describe, it, expect } from 'vitest';
import { loadConfig, type ProjMemConfig } from '../../../src/config/ConfigLoader.js';

describe('ConfigLoader', () => {
  it('should return default config when no file exists', () => {
    const config = loadConfig('/nonexistent/path');
    expect(config.embedding.provider).toBe('openai');
    expect(config.embedding.dimension).toBe(1536);
    expect(config.search.weights.lexical).toBe(0.7);
    expect(config.search.weights.vector).toBe(0.3);
  });

  it('should merge partial config over defaults', () => {
    const config = loadConfig('/nonexistent/path', {
      embedding: { provider: 'local', dimension: 384 },
    });
    expect(config.embedding.provider).toBe('local');
    expect(config.embedding.dimension).toBe(384);
    // 其他欄位仍用 defaults
    expect(config.search.weights.lexical).toBe(0.7);
  });

  it('should validate dimension is positive integer', () => {
    expect(() =>
      loadConfig('/nonexistent', { embedding: { dimension: -1 } })
    ).toThrow('dimension must be a positive integer');
  });

  it('should validate weights sum to 1.0', () => {
    expect(() =>
      loadConfig('/nonexistent', { search: { weights: { lexical: 0.5, vector: 0.3 } } })
    ).toThrow('weights must sum to 1.0');
  });
});
