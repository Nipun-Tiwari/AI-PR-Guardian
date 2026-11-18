import { describe, it, expect } from 'vitest';
import { estimateCostUsd, findModelRate, getPricingCatalog } from '../src/pricing/index.js';

describe('pricing catalog', () => {
  it('loads catalog version 1 with anthropic model', () => {
    const catalog = getPricingCatalog();
    expect(catalog.catalogVersion).toBe(1);
    expect(catalog.currency).toBe('USD');
    expect(findModelRate('anthropic', 'claude-sonnet-4-6')).toBeDefined();
  });

  it('estimates cost from known token counts', () => {
    // 1M input @ $3 + 1M output @ $15 = $18
    const estimate = estimateCostUsd('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimate.catalogVersion).toBe(1);
    expect(estimate.estimatedCostUsd).toBe(18);
  });

  it('estimates fractional costs for small reviews', () => {
    // 1000 input @ $3/M = 0.003; 500 output @ $15/M = 0.0075; total 0.0105
    const estimate = estimateCostUsd('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(estimate.estimatedCostUsd).toBe(0.0105);
  });

  it('throws for unknown models', () => {
    expect(() =>
      estimateCostUsd('anthropic', 'unknown-model', { inputTokens: 1, outputTokens: 1 }),
    ).toThrow(/No pricing entry/);
  });
});
