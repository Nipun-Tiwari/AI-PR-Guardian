import type { FindingV1, TokenUsage } from '@prguardian/shared';

export interface ReviewFileInput {
  path: string;
  content: string;
}

export interface AiReviewInput {
  reviewId: string;
  repository: { owner: string; name: string };
  pullRequest: { number: number; title: string; headSha: string };
  files: ReviewFileInput[];
  staticFindings: FindingV1[];
}

export interface AiReviewConfig {
  provider: string;
  modelId: string;
  apiKey: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Anthropic Messages API base URL. */
  apiBaseUrl?: string;
  timeoutMs?: number;
}

export interface AiCandidateFinding {
  category: FindingV1['category'];
  severity: FindingV1['severity'];
  confidence: FindingV1['confidence'];
  filePath: string;
  lineStart: number;
  lineEnd?: number;
  message: string;
  evidence?: string;
  recommendation?: string;
}

export interface AiReviewResult {
  candidates: AiCandidateFinding[];
  usage: TokenUsage;
  rawRejected: boolean;
  error?: string;
}
