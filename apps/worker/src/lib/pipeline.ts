import { randomUUID } from 'node:crypto';
import { getClient } from '@prguardian/database';
import { GitHubAppClient } from '@prguardian/github-client';
import { parseFilePatch, type ParsedFileDiff } from '@prguardian/diff-engine';
import { runStaticAnalysis, type AnalyzableFile } from '@prguardian/static-analysis';
import { runAiReview } from '@prguardian/ai-review';
import { normalizeFindings } from '@prguardian/finding-engine';
import { estimateCostUsd, type FindingV1 } from '@prguardian/shared';
import { logger } from '@prguardian/observability';
import type { WorkerConfig } from '../config.js';
import type { ReviewJobRow } from './jobQueue.js';

function summarizeFindings(findings: FindingV1[]) {
  const summary = {
    total: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of findings) {
    summary[finding.severity] += 1;
  }
  return summary;
}

export async function processReviewJob(job: ReviewJobRow, config: WorkerConfig): Promise<void> {
  const db = getClient();
  const startedAt = new Date();

  const repository = await db.repository.findFirst({
    where: { githubRepositoryId: job.repository_id },
  });

  const github = new GitHubAppClient({
    appId: config.GITHUB_APP_ID,
    privateKey: config.GITHUB_APP_PRIVATE_KEY,
    apiVersion: config.GITHUB_API_VERSION,
  });

  let owner = repository?.owner;
  let name = repository?.name;
  if (!owner || !name) {
    const repoInfo = await github.getRepository(job.installation_id, job.repository_id);
    owner = repoInfo.owner;
    name = repoInfo.name;
  }

  const pr = await github.getPullRequest(job.installation_id, owner, name, job.pr_number);
  if (pr.headSha !== job.head_sha) {
    logger.warn(
      {
        jobId: job.id,
        jobHeadSha: job.head_sha,
        prHeadSha: pr.headSha,
      },
      'PR head SHA differs from job head SHA; continuing with job SHA for file fetch',
    );
  }

  const reviewId = randomUUID();
  await db.review.create({
    data: {
      id: reviewId,
      mode: 'live',
      status: 'running',
      repositoryId: repository?.id ?? null,
      githubRepositoryId: job.repository_id,
      owner,
      name,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.url,
      headSha: job.head_sha,
      jobId: job.id,
      startedAt,
    },
  });

  try {
    const files = await github.listPullRequestFiles(
      job.installation_id,
      owner,
      name,
      job.pr_number,
    );

    const analyzable: AnalyzableFile[] = [];
    const diffs: ParsedFileDiff[] = [];

    for (const file of files) {
      if (file.status === 'removed') continue;

      const parsed = parseFilePatch(file.filename, file.patch, file.previousFilename);
      diffs.push(parsed);

      const content = await github.getFileContent(
        job.installation_id,
        owner,
        name,
        file.filename,
        job.head_sha,
      );
      if (content) {
        analyzable.push({ path: file.filename, content: content.content });
      }
    }

    const candidateFindings: FindingV1[] = [];
    const pipelineErrors: string[] = [];
    let estimatedCostUsd: number | null = null;

    if (config.STATIC_ANALYSIS_ENABLED) {
      const result = await runStaticAnalysis(analyzable, { reviewId });
      candidateFindings.push(...result.findings);
      pipelineErrors.push(...result.errors.map((e) => `static: ${e}`));
    } else {
      logger.info({ jobId: job.id }, 'STATIC_ANALYSIS_ENABLED=false; skipping scanners');
    }

    if (config.AI_REVIEW_ENABLED) {
      const aiResult = await runAiReview(
        {
          reviewId,
          repository: { owner, name },
          pullRequest: {
            number: pr.number,
            title: pr.title,
            headSha: job.head_sha,
          },
          files: analyzable,
          staticFindings: candidateFindings.filter((f) => f.source === 'static_rule'),
        },
        {
          provider: config.AI_PROVIDER,
          modelId: config.AI_MODEL_ID,
          apiKey: config.AI_API_KEY ?? '',
          maxInputTokens: config.AI_MAX_INPUT_TOKENS,
          maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS,
        },
      );

      const cost = estimateCostUsd(config.AI_PROVIDER, config.AI_MODEL_ID, aiResult.usage);
      estimatedCostUsd = cost.estimatedCostUsd;

      let skippedReason: string | null = null;
      if (config.COST_LIMIT_ENFORCED && cost.estimatedCostUsd > config.AI_MAX_COST_USD_PER_REVIEW) {
        skippedReason = `cost_limit_exceeded:${cost.estimatedCostUsd}>${config.AI_MAX_COST_USD_PER_REVIEW}`;
        pipelineErrors.push(`ai: ${skippedReason}`);
        logger.warn(
          { jobId: job.id, estimatedCostUsd: cost.estimatedCostUsd },
          'AI findings discarded due to cost limit',
        );
      } else if (aiResult.rawRejected) {
        skippedReason = aiResult.error ?? 'ai_response_rejected';
        pipelineErrors.push(`ai: ${skippedReason}`);
      } else {
        candidateFindings.push(...aiResult.findings);
      }

      await db.reviewUsage.create({
        data: {
          reviewId,
          provider: cost.provider,
          modelId: cost.modelId,
          catalogVersion: cost.catalogVersion,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          estimatedCostUsd: cost.estimatedCostUsd,
          currency: cost.currency,
          skippedReason,
        },
      });
    }

    const normalized = normalizeFindings(candidateFindings, diffs);
    for (const rejection of normalized.rejected) {
      if (rejection.reason.startsWith('schema')) {
        pipelineErrors.push(`finding-engine: ${rejection.reason}`);
      }
    }

    const findings = normalized.findings;
    const summary = summarizeFindings(findings);

    if (findings.length > 0) {
      await db.finding.createMany({
        data: findings.map((f) => ({
          id: f.id,
          reviewId: f.reviewId,
          source: f.source,
          category: f.category,
          severity: f.severity,
          confidence: f.confidence,
          filePath: f.filePath,
          lineStart: f.lineStart,
          lineEnd: f.lineEnd ?? null,
          message: f.message,
          evidence: f.evidence ?? null,
          recommendation: f.recommendation ?? null,
          validationStatus: f.validationStatus,
          fingerprint: f.fingerprint,
        })),
      });
    }

    const status =
      pipelineErrors.length > 0 && findings.length === 0
        ? 'partial'
        : pipelineErrors.some((e) => e.startsWith('ai:')) && findings.length > 0
          ? 'partial'
          : 'succeeded';
    const completedAt = new Date();

    await db.review.update({
      where: { id: reviewId },
      data: {
        status,
        findingsTotal: summary.total,
        findingsCritical: summary.critical,
        findingsHigh: summary.high,
        findingsMedium: summary.medium,
        findingsLow: summary.low,
        findingsInfo: summary.info,
        completedAt,
        estimatedCostUsd,
        errorMessage: pipelineErrors.length > 0 ? pipelineErrors.join('; ') : null,
      },
    });

    await db.reviewJob.update({
      where: { id: job.id },
      data: { status: 'succeeded', completedAt },
    });

    logger.info(
      {
        jobId: job.id,
        reviewId,
        findings: summary.total,
        pipelineErrors: pipelineErrors.length,
        estimatedCostUsd,
      },
      'Review job completed',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.review.update({
      where: { id: reviewId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message,
      },
    });
    throw error;
  }
}
