function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  isRetryable: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

/**
 * 帶指數退避和 jitter 的重試策略
 * 總嘗試次數 = 1（初始） + maxRetries
 */
export async function withRetry<T>(
  operation: () => T | Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxRetries && opts.isRetryable(err)) {
        const delay = opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * opts.baseDelayMs;
        opts.onRetry?.(attempt + 1, err);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}
