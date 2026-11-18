import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { computeFingerprint } from '../src/fingerprint.js';

describe('computeFingerprint', () => {
  it('matches D-020 SHA-256 truncation', () => {
    const filePath = 'src/a.ts';
    const lineStart = 10;
    const message = 'bad';
    const expected = createHash('sha256')
      .update(`${filePath}:${lineStart}:${message}`)
      .digest('hex')
      .slice(0, 16);
    expect(computeFingerprint(filePath, lineStart, message)).toBe(expected);
  });
});
