import { describe, it, expect } from 'vitest';
import {
  SqliteBusyError,
  EmbeddingRateLimitError,
  EmbeddingUnavailableError,
  VectorIndexCorruptError,
  FTSIndexCorruptError,
  ContentHashConflictError,
  SubmoduleNotInitializedError,
} from '../../../src/domain/errors/DomainErrors.js';

describe('DomainErrors', () => {
  it('SqliteBusyError is retryable', () => {
    const err = new SqliteBusyError('busy');
    expect(err.classification).toBe('retryable');
    expect(err.code).toBe('SQLITE_BUSY');
    expect(err.maxRetries).toBe(5);
    expect(err).toBeInstanceOf(Error);
  });

  it('EmbeddingRateLimitError is retryable', () => {
    const err = new EmbeddingRateLimitError('rate limit');
    expect(err.classification).toBe('retryable');
    expect(err.code).toBe('EMBEDDING_RATE_LIMIT');
  });

  it('EmbeddingUnavailableError is degradable', () => {
    const err = new EmbeddingUnavailableError('offline');
    expect(err.classification).toBe('degradable');
    expect(err.code).toBe('EMBEDDING_UNAVAILABLE');
  });

  it('VectorIndexCorruptError is degradable', () => {
    const err = new VectorIndexCorruptError('corrupt');
    expect(err.classification).toBe('degradable');
  });

  it('FTSIndexCorruptError is degradable', () => {
    const err = new FTSIndexCorruptError('corrupt');
    expect(err.classification).toBe('degradable');
  });

  it('ContentHashConflictError is manual', () => {
    const err = new ContentHashConflictError('conflict', 'abc', 'def');
    expect(err.classification).toBe('manual');
    expect(err.expectedHash).toBe('abc');
    expect(err.actualHash).toBe('def');
  });

  it('SubmoduleNotInitializedError is manual', () => {
    const err = new SubmoduleNotInitializedError('libs/shared');
    expect(err.classification).toBe('manual');
    expect(err.submodulePath).toBe('libs/shared');
    expect(err.message).toContain('libs/shared');
  });
});
