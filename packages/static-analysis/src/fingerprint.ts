import { createHash } from 'node:crypto';

/** SHA-256 of `filePath:lineStart:message`, hex, truncated to 16 chars (D-020). */
export function computeFingerprint(filePath: string, lineStart: number, message: string): string {
  return createHash('sha256')
    .update(`${filePath}:${lineStart}:${message}`)
    .digest('hex')
    .slice(0, 16);
}
