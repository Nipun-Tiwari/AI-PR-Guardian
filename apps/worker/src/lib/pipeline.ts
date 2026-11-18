import { randomUUID } from 'node:crypto';
import { getClient } from '@prguardian/database';
import { GitHubAppClient } from '@prguardian/github-client';
import { isAddedLine, parseFilePatch, type ParsedFileDiff } from '@prguardian/diff-engine';
import { runStaticAnalysis, type AnalyzableFile } from '@prguardian/static-analysis';
import type { FindingV1 } from '@prguardian/shared';
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

function filterToAddedLines(findings: FindingV1[], diffs: ParsedFileDiff[]): FindingV1[] {
  return findings
    .map((finding) => {
      const file = diffs.find(
        (d) => d.newPath === finding.filePath || d.oldPath === finding.filePath,
      );
      if (!file) {
        return { ...finding, validationStatus: 'invalid_location' as const };
      }
      if (!isAddedLine(file, finding.lineStart)) {
        return { ...finding, validationStatus: 'invalid_location' as const };
      }
      return finding;
    })
    .filter((f) => f.validationStatus === 'valid');
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

  // Prefer owner/name from DB; fall back to GitHub repository lookup.
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

    let findings: FindingV1[] = [];
    const scannerErrors: string[] = [];

    if (config.STATIC_ANALYSIS_ENABLED) {
      const result = await runStaticAnalysis(analyzable, { reviewId });
      findings = filterToAddedLines(result.findings, diffs);
      scannerErrors.push(...result.errors);
    } else {
      logger.info({ jobId: job.id }, 'STATIC_ANALYSIS_ENABLED=false; skipping scanners');
    }

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

    const status = scannerErrors.length > 0 && findings.length === 0 ? 'partial' : 'succeeded';
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
        errorMessage: scannerErrors.length > 0 ? scannerErrors.join('; ') : null,
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
        scannerErrors: scannerErrors.length,
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
