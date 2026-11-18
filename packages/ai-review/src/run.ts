import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { FindingV1 } from '@prguardian/shared';
import { runAnthropicReview } from './anthropic.js';
import type { AiReviewConfig, AiReviewInput, AiReviewResult } from './types.js';

function fingerprint(filePath: string, lineStart: number, message: string): string {
  return createHash('sha256')
    .update(`${filePath}:${lineStart}:${message}`)
    .digest('hex')
    .slice(0, 16);
}

export function candidatesToFindings(reviewId: string, result: AiReviewResult): FindingV1[] {
  return result.candidates.map((c) => {
    const finding: FindingV1 = {
      schemaVersion: 1,
      id: randomUUID(),
      reviewId,
      source: 'llm',
      category: c.category,
      severity: c.severity,
      confidence: c.confidence,
      filePath: c.filePath,
      lineStart: c.lineStart,
      message: c.message,
      validationStatus: 'valid',
      fingerprint: fingerprint(c.filePath, c.lineStart, c.message),
    };
    if (c.lineEnd !== undefined) finding.lineEnd = c.lineEnd;
    if (c.evidence !== undefined) finding.evidence = c.evidence;
    if (c.recommendation !== undefined) finding.recommendation = c.recommendation;
    return finding;
  });
}

export async function runAiReview(
  input: AiReviewInput,
  config: AiReviewConfig,
): Promise<AiReviewResult & { findings: FindingV1[] }> {
  if (config.provider !== 'anthropic') {
    return {
      candidates: [],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      rawRejected: true,
      error: `Unsupported AI_PROVIDER: ${config.provider}`,
    };
  }

  const result = await runAnthropicReview(input, config);
  return {
    ...result,
    findings: candidatesToFindings(input.reviewId, result),
  };
}
