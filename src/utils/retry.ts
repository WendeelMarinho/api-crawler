import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier = 2, onRetry } = options;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts) break;

      const wait = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      logger.warn(`Retry ${attempt}/${maxAttempts} after ${wait}ms: ${lastError.message}`);
      onRetry?.(attempt, lastError);
      await sleep(wait);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
