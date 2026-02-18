import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../src/shared/RetryPolicy.js';

describe('RetryPolicy', () => {
  it('should succeed on first try', async () => {
    const fn = vi.fn().mockReturnValue('ok');
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      isRetryable: () => true,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockReturnValue('ok');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1, // 測試用最小延遲
      isRetryable: (err) => (err as Error).message === 'busy',
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('busy'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        isRetryable: () => true,
      })
    ).rejects.toThrow('busy');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        isRetryable: (err) => (err as Error).message === 'busy',
      })
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockReturnValue('ok');

    await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      isRetryable: () => true,
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});
