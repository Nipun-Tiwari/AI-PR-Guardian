import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FindingV1 } from '@prguardian/shared';
import type { ReviewJobRow } from '../src/lib/jobQueue.js';
import type { WorkerConfig } from '../src/config.js';

const reviewCreate = vi.fn();
const reviewUpdate = vi.fn();
const findingCreateMany = vi.fn();
const reviewJobUpdate = vi.fn();
const reviewUsageCreate = vi.fn();
const repositoryFindFirst = vi.fn();

vi.mock('@prguardian/database', () => ({
  getClient: () => ({
    repository: { findFirst: repositoryFindFirst },
    review: { create: reviewCreate, update: reviewUpdate },
    finding: { createMany: findingCreateMany },
    reviewJob: { update: reviewJobUpdate },
    reviewUsage: { create: reviewUsageCreate },
  }),
}));

const getPullRequest = vi.fn();
const listPullRequestFiles = vi.fn();
const getFileContent = vi.fn();
const getRepository = vi.fn();

vi.mock('@prguardian/github-client', () => ({
  GitHubAppClient: class {
    getRepository = getRepository;
    getPullRequest = getPullRequest;
    listPullRequestFiles = listPullRequestFiles;
    getFileContent = getFileContent;
  },
}));

const runStaticAnalysis = vi.fn();
vi.mock('@prguardian/static-analysis', () => ({
  runStaticAnalysis: (...args: unknown[]) => runStaticAnalysis(...args),
}));

const runAiReview = vi.fn();
vi.mock('@prguardian/ai-review', () => ({
  runAiReview: (...args: unknown[]) => runAiReview(...args),
}));

vi.mock('@prguardian/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processReviewJob } from '../src/lib/pipeline.js';

const baseConfig: WorkerConfig = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://example',
  LOG_LEVEL: 'error',
  WORKER_POLL_INTERVAL_MS: 100,
  WORKER_CONCURRENCY: 1,
  WORKER_MAX_ATTEMPTS: 3,
  WORKER_LEASE_SECONDS: 10,
  WORKER_JOB_TIMEOUT_SECONDS: 30,
  GITHUB_APP_ID: 1,
  GITHUB_APP_PRIVATE_KEY: 'unused-because-client-is-mocked',
  GITHUB_API_VERSION: '2022-11-28',
  STATIC_ANALYSIS_ENABLED: true,
  AI_REVIEW_ENABLED: false,
  COST_LIMIT_ENFORCED: true,
  AI_PROVIDER: 'anthropic',
  AI_MODEL_ID: 'claude-sonnet-4-6',
  AI_API_KEY: 'test-key',
  AI_MAX_INPUT_TOKENS: 50_000,
  AI_MAX_OUTPUT_TOKENS: 1024,
  AI_MAX_COST_USD_PER_REVIEW: 0.05,
};

function jobRow(): ReviewJobRow {
  return {
    id: 'job-1',
    status: 'running',
    installation_id: BigInt(10),
    repository_id: BigInt(20),
    pr_number: 7,
    head_sha: 'abc1234',
    attempts: 1,
    max_attempts: 3,
    lease_expires_at: null,
    created_at: new Date(),
  };
}

describe('processReviewJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryFindFirst.mockResolvedValue({
      id: 'repo-uuid',
      owner: 'acme',
      name: 'api',
    });
    getPullRequest.mockResolvedValue({
      number: 7,
      title: 'Add rate limit',
      url: 'https://github.com/acme/api/pull/7',
      headSha: 'abc1234',
      baseSha: 'def5678',
      owner: 'acme',
      repo: 'api',
    });
    listPullRequestFiles.mockResolvedValue([
      {
        filename: 'src/unsafe.js',
        status: 'modified',
        patch: ['@@ -1,1 +1,2 @@', ' const x = 1;', '+eval(code);'].join('\n'),
        additions: 1,
        deletions: 0,
      },
    ]);
    getFileContent.mockResolvedValue({
      path: 'src/unsafe.js',
      content: 'const x = 1;\neval(code);\n',
      sha: 'blob',
    });
  });

  it('persists deterministic static-analysis findings when AI is off', async () => {
    const finding: FindingV1 = {
      schemaVersion: 1,
      id: 'f1111111-1111-4111-8111-111111111111',
      reviewId: 'placeholder',
      source: 'static_rule',
      category: 'security',
      severity: 'high',
      confidence: 'high',
      filePath: 'src/unsafe.js',
      lineStart: 2,
      message: '[eslint:no-eval] eval is evil',
      validationStatus: 'valid',
      fingerprint: 'abcd1234abcd1234',
    };

    runStaticAnalysis.mockImplementation(async (_files, opts: { reviewId: string }) => ({
      findings: [{ ...finding, reviewId: opts.reviewId }],
      errors: [],
    }));

    await processReviewJob(jobRow(), baseConfig);

    expect(runAiReview).not.toHaveBeenCalled();
    expect(reviewUsageCreate).not.toHaveBeenCalled();
    expect(findingCreateMany).toHaveBeenCalledOnce();
    const createdFindings = findingCreateMany.mock.calls[0]![0].data as Array<{
      source: string;
    }>;
    expect(createdFindings[0]?.source).toBe('static_rule');
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'succeeded', findingsTotal: 1 }),
      }),
    );
  });

  it('persists llm findings and usage when AI is enabled', async () => {
    runStaticAnalysis.mockResolvedValue({ findings: [], errors: [] });
    runAiReview.mockImplementation(async (input: { reviewId: string }) => ({
      candidates: [],
      findings: [
        {
          schemaVersion: 1,
          id: 'f2222222-2222-4222-8222-222222222222',
          reviewId: input.reviewId,
          source: 'llm',
          category: 'security',
          severity: 'high',
          confidence: 'medium',
          filePath: 'src/unsafe.js',
          lineStart: 2,
          message: 'Avoid eval in request handlers',
          validationStatus: 'valid',
          fingerprint: 'llmfingerprint001',
        } satisfies FindingV1,
      ],
      usage: { inputTokens: 1000, outputTokens: 200 },
      rawRejected: false,
    }));

    await processReviewJob(jobRow(), { ...baseConfig, AI_REVIEW_ENABLED: true });

    expect(runAiReview).toHaveBeenCalledOnce();
    expect(reviewUsageCreate).toHaveBeenCalledOnce();
    const usage = reviewUsageCreate.mock.calls[0]![0].data as {
      provider: string;
      modelId: string;
      inputTokens: number;
      skippedReason: string | null;
    };
    expect(usage.provider).toBe('anthropic');
    expect(usage.modelId).toBe('claude-sonnet-4-6');
    expect(usage.inputTokens).toBe(1000);
    expect(usage.skippedReason).toBeNull();

    expect(findingCreateMany).toHaveBeenCalledOnce();
    const createdFindings = findingCreateMany.mock.calls[0]![0].data as Array<{ source: string }>;
    expect(createdFindings.some((f) => f.source === 'llm')).toBe(true);
  });

  it('discards AI findings when cost limit is exceeded but keeps static findings', async () => {
    runStaticAnalysis.mockImplementation(async (_files, opts: { reviewId: string }) => ({
      findings: [
        {
          schemaVersion: 1,
          id: 'f1111111-1111-4111-8111-111111111111',
          reviewId: opts.reviewId,
          source: 'static_rule',
          category: 'security',
          severity: 'high',
          confidence: 'high',
          filePath: 'src/unsafe.js',
          lineStart: 2,
          message: 'static',
          validationStatus: 'valid',
          fingerprint: 'staticfingerprint1',
        } satisfies FindingV1,
      ],
      errors: [],
    }));
    runAiReview.mockImplementation(async (input: { reviewId: string }) => ({
      candidates: [],
      findings: [
        {
          schemaVersion: 1,
          id: 'f3333333-3333-4333-8333-333333333333',
          reviewId: input.reviewId,
          source: 'llm',
          category: 'security',
          severity: 'high',
          confidence: 'high',
          filePath: 'src/unsafe.js',
          lineStart: 2,
          message: 'expensive llm finding',
          validationStatus: 'valid',
          fingerprint: 'llmfingerprint002',
        } satisfies FindingV1,
      ],
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      rawRejected: false,
    }));

    await processReviewJob(jobRow(), {
      ...baseConfig,
      AI_REVIEW_ENABLED: true,
      AI_MAX_COST_USD_PER_REVIEW: 0.01,
    });

    const usage = reviewUsageCreate.mock.calls[0]![0].data as { skippedReason: string | null };
    expect(usage.skippedReason).toMatch(/cost_limit_exceeded/);
    expect(findingCreateMany).toHaveBeenCalledOnce();
    const createdFindings = findingCreateMany.mock.calls[0]![0].data as Array<{ source: string }>;
    expect(createdFindings).toHaveLength(1);
    expect(createdFindings[0]?.source).toBe('static_rule');
  });

  it('skips scanners when STATIC_ANALYSIS_ENABLED is false', async () => {
    await processReviewJob(jobRow(), { ...baseConfig, STATIC_ANALYSIS_ENABLED: false });
    expect(runStaticAnalysis).not.toHaveBeenCalled();
    expect(findingCreateMany).not.toHaveBeenCalled();
  });
});
