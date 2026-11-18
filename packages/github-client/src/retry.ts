const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  if (!('status' in error)) return null;
  const status = (error as { status: unknown }).status;
  return typeof status === 'number' ? status : null;
}

export function isRetryableError(error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status === null) return false;
  if (status === 401 || status === 403) return false;
  return RETRYABLE_STATUS.has(status);
}

export function isHardAuthError(error: unknown): boolean {
  const status = getHttpStatus(error);
  return status === 401 || status === 403;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isHardAuthError(error) || !isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
