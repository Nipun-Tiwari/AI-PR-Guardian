import { describe, it, expect, vi } from 'vitest';
import { isHardAuthError, isRetryableError, withRetry } from '../src/retry.js';

function httpError(status: number): { status: number; message: string } {
  return { status, message: 'boom' };
}

describe('retry helpers', () => {
  it('treats 401/403 as hard auth failures', () => {
    expect(isHardAuthError(httpError(401))).toBe(true);
    expect(isHardAuthError(httpError(403))).toBe(true);
    expect(isRetryableError(httpError(401))).toBe(false);
  });

  it('retries transient status codes then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValueOnce('ok');

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry hard auth errors', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(403));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 403,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
