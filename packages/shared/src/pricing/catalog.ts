import catalogJson from './pricing-catalog.json';
import type { CostEstimate, PricingCatalog, PricingModel, TokenUsage } from './types.js';

export const pricingCatalog = catalogJson as PricingCatalog;

export function getPricingCatalog(): PricingCatalog {
  return pricingCatalog;
}

export function findModelRate(provider: string, modelId: string): PricingModel | undefined {
  return pricingCatalog.models.find((m) => m.provider === provider && m.modelId === modelId);
}

/**
 * Estimate USD cost from token usage using the frozen catalog version at call time (D-013).
 * Historical estimates must not be recomputed when catalog prices change.
 */
export function estimateCostUsd(
  provider: string,
  modelId: string,
  usage: TokenUsage,
): CostEstimate {
  const model = findModelRate(provider, modelId);
  if (!model) {
    throw new Error(`No pricing entry for provider=${provider} modelId=${modelId}`);
  }

  const estimatedCostUsd =
    (usage.inputTokens / 1_000_000) * model.inputUsdPerMillion +
    (usage.outputTokens / 1_000_000) * model.outputUsdPerMillion;

  return {
    catalogVersion: pricingCatalog.catalogVersion,
    currency: pricingCatalog.currency,
    provider,
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(8)),
  };
}
