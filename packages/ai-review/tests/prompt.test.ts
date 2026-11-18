import { describe, it, expect } from 'vitest';
import { buildUserPrompt, estimateTokens } from '../src/prompt.js';
import type { AiReviewInput } from '../src/types.js';

const baseInput: AiReviewInput = {
  reviewId: '11111111-1111-4111-8111-111111111111',
  repository: { owner: 'acme', name: 'api' },
  pullRequest: { number: 1, title: 'Add auth', headSha: 'abc1234' },
  files: [{ path: 'src/a.js', content: 'const x = 1;\n'.repeat(5000) }],
  staticFindings: [],
};

describe('prompt builder', () => {
  it('estimates tokens from character length', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(8))).toBe(2);
  });

  it('truncates file content to respect max input tokens', () => {
    const prompt = buildUserPrompt(baseInput, 2_000);
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(2_500);
    expect(prompt).toContain('src/a.js');
  });
});
