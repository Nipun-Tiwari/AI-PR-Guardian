export interface PricingModel {
  provider: string;
  modelId: string;
  displayName: string;
  effectiveFrom: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheWrite5mUsdPerMillion: number | null;
  cacheWrite1hUsdPerMillion: number | null;
  cacheReadUsdPerMillion: number | null;
  notes?: string;
}

export interface PricingCatalog {
  catalogVersion: number;
  currency: string;
  lastUpdated: string;
  models: PricingModel[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEstimate {
  catalogVersion: number;
  currency: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}
