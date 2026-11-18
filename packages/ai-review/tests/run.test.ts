import { describe, it, expect, vi } from 'vitest';
import { runAiReview } from '../src/run.js';
import type { AiReviewInput } from '../src/types.js';

const input: AiReviewInput = {
  reviewId: '11111111-1111-4111-8111-111111111111',
  repository: { owner: 'acme', name: 'api' },
  pullRequest: { number: 7, title: 'Fix eval', headSha: 'deadbeef' },
  files: [{ path: 'src/unsafe.js', content: 'eval(code);\n' }],
  staticFindings: [],
};

describe('runAiReview', () => {
  it('maps valid Anthropic JSON to llm findings', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  findings: [
                    {
                      category: 'security',
                      severity: 'high',
                      confidence: 'high',
                      filePath: 'src/unsafe.js',
                      lineStart: 1,
                      message: 'Avoid eval',
                    },
                  ],
                }),
              },
            ],
            usage: { input_tokens: 100, output_tokens: 40 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await runAiReview(input, {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      apiKey: 'test-key',
      maxInputTokens: 50_000,
      maxOutputTokens: 1024,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.rawRejected).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.source).toBe('llm');
    expect(result.findings[0]?.fingerprint).toHaveLength(16);
    expect(result.usage.inputTokens).toBe(100);
    // Ensure API key is not echoed in error/result
    expect(JSON.stringify(result)).not.toContain('test-key');
  });

  it('rejects invalid model JSON without producing findings', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'not json at all' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
    );

    const result = await runAiReview(input, {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      apiKey: 'test-key',
      maxInputTokens: 50_000,
      maxOutputTokens: 1024,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.rawRejected).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.error).toMatch(/not valid JSON/i);
  });

  it('rejects schema-invalid payloads', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  findings: [
                    {
                      category: 'nope',
                      severity: 'high',
                      filePath: 'a.js',
                      lineStart: 1,
                      message: 'x',
                    },
                  ],
                }),
              },
            ],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
    );

    const result = await runAiReview(input, {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      apiKey: 'test-key',
      maxInputTokens: 50_000,
      maxOutputTokens: 1024,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.rawRejected).toBe(true);
    expect(result.findings).toEqual([]);
  });
});
