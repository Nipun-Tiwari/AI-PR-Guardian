/**
 * Decode a GitHub App private key from either raw PEM or base64-encoded PEM.
 */
export function decodePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('BEGIN') && trimmed.includes('PRIVATE KEY')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (decoded.includes('BEGIN') && decoded.includes('PRIVATE KEY')) {
      return decoded.replace(/\\n/g, '\n');
    }
  } catch {
    // fall through
  }

  throw new Error(
    'GITHUB_APP_PRIVATE_KEY must be a PEM private key or a base64-encoded PEM private key',
  );
}
