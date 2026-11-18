import { describe, it, expect } from 'vitest';
import { runEslint } from '../src/eslintAdapter.js';

describe('runEslint', () => {
  it('produces a finding for eval()', async () => {
    const reviewId = '11111111-1111-4111-8111-111111111111';
    const { findings, error } = await runEslint(
      [
        {
          path: 'src/unsafe.js',
          content: 'export function run(code) {\n  return eval(code);\n}\n',
        },
      ],
      reviewId,
    );

    expect(error).toBeUndefined();
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.source).toBe('static_rule');
    expect(findings[0]?.reviewId).toBe(reviewId);
    expect(findings[0]?.filePath).toBe('src/unsafe.js');
    expect(findings[0]?.message).toMatch(/eslint/);
    expect(findings[0]?.fingerprint).toHaveLength(16);
  });

  it('returns empty findings for non-JS files', async () => {
    const { findings } = await runEslint(
      [{ path: 'README.md', content: '# hi' }],
      '11111111-1111-4111-8111-111111111111',
    );
    expect(findings).toEqual([]);
  });
});
