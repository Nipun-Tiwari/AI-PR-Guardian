import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/semgrepAdapter.js', () => ({
  runSemgrep: vi.fn(async () => ({
    findings: [],
    error: 'semgrep binary missing',
  })),
  SEMGREP_PINNED_VERSION: '1.97.0',
}));

import { runStaticAnalysis } from '../src/run.js';

describe('runStaticAnalysis', () => {
  it('keeps ESLint findings when Semgrep fails', async () => {
    const reviewId = '11111111-1111-4111-8111-111111111111';
    const result = await runStaticAnalysis(
      [
        {
          path: 'src/unsafe.js',
          content: 'export function run(code) {\n  return eval(code);\n}\n',
        },
      ],
      { reviewId },
    );

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('semgrep'))).toBe(true);
  });
});
