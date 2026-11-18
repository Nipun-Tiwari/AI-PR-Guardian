import { describe, it, expect } from 'vitest';
import { parseFilePatch } from '@prguardian/diff-engine';
import type { FindingV1 } from '@prguardian/shared';
import { normalizeFindings } from '../src/normalize.js';

function finding(
  overrides: Partial<FindingV1> & Pick<FindingV1, 'fingerprint' | 'source' | 'lineStart'>,
): FindingV1 {
  return {
    schemaVersion: 1,
    id: '11111111-1111-4111-8111-111111111111',
    reviewId: '22222222-2222-4222-8222-222222222222',
    category: 'security',
    severity: 'high',
    confidence: 'high',
    filePath: 'src/a.js',
    message: 'bad',
    validationStatus: 'valid',
    ...overrides,
  };
}

describe('normalizeFindings', () => {
  const diffs = [
    parseFilePatch('src/a.js', ['@@ -1,1 +1,2 @@', ' const x = 1;', '+eval(code);'].join('\n')),
  ];

  it('keeps findings on added lines and drops context lines', () => {
    const result = normalizeFindings(
      [
        finding({ fingerprint: 'aaaaaaaaaaaaaaaa', source: 'static_rule', lineStart: 2 }),
        finding({
          id: '33333333-3333-4333-8333-333333333333',
          fingerprint: 'bbbbbbbbbbbbbbbb',
          source: 'llm',
          lineStart: 1,
          message: 'on context',
        }),
      ],
      diffs,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.lineStart).toBe(2);
    expect(result.rejected.some((r) => r.reason === 'invalid_location')).toBe(true);
  });

  it('dedupes by fingerprint preferring static_rule over llm', () => {
    const result = normalizeFindings(
      [
        finding({ fingerprint: 'samefingerprint01', source: 'llm', lineStart: 2, message: 'dup' }),
        finding({
          id: '33333333-3333-4333-8333-333333333333',
          fingerprint: 'samefingerprint01',
          source: 'static_rule',
          lineStart: 2,
          message: 'dup',
        }),
      ],
      diffs,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.source).toBe('static_rule');
  });

  it('rejects schema-invalid findings', () => {
    const bad = {
      ...finding({ fingerprint: 'cccccccccccccccc', source: 'llm', lineStart: 2 }),
      severity: 'nope',
    } as unknown as FindingV1;

    const result = normalizeFindings([bad], diffs);
    expect(result.findings).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(/schema/);
  });
});
