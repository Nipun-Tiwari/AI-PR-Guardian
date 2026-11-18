import { describe, it, expect } from 'vitest';
import { toFindingV1, toReviewSummary } from '../src/lib/reviewMappers.js';

describe('reviewMappers', () => {
  it('maps a review row to ReviewSummaryV1', () => {
    const summary = toReviewSummary({
      id: '11111111-1111-4111-8111-111111111111',
      mode: 'live',
      status: 'succeeded',
      owner: 'acme',
      name: 'api',
      repositoryId: '22222222-2222-4222-8222-222222222222',
      prNumber: 3,
      prTitle: 'Hello',
      prUrl: 'https://github.com/acme/api/pull/3',
      headSha: 'abcdef1234567',
      findingsTotal: 2,
      findingsCritical: 0,
      findingsHigh: 1,
      findingsMedium: 1,
      findingsLow: 0,
      findingsInfo: 0,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: new Date('2026-01-01T00:01:00.000Z'),
    });

    expect(summary.schemaVersion).toBe(1);
    expect(summary.mode).toBe('live');
    expect(summary.pullRequest.url).toBe('https://github.com/acme/api/pull/3');
    expect(summary.findingsSummary.total).toBe(2);
  });

  it('maps a finding row to FindingV1', () => {
    const finding = toFindingV1({
      id: '33333333-3333-4333-8333-333333333333',
      reviewId: '11111111-1111-4111-8111-111111111111',
      source: 'static_rule',
      category: 'security',
      severity: 'high',
      confidence: 'high',
      filePath: 'src/a.js',
      lineStart: 4,
      lineEnd: 4,
      message: 'bad',
      evidence: 'eval(x)',
      recommendation: null,
      validationStatus: 'valid',
      fingerprint: '0123456789abcdef',
    });

    expect(finding.source).toBe('static_rule');
    expect(finding.evidence).toBe('eval(x)');
    expect(finding.recommendation).toBeUndefined();
  });
});
