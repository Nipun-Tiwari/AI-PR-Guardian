import type { FindingV1, ReviewSummaryV1 } from '@prguardian/shared';

export interface ReviewRow {
  id: string;
  mode: 'demo' | 'live';
  status: ReviewSummaryV1['status'];
  owner: string;
  name: string;
  repositoryId: string | null;
  prNumber: number;
  prTitle: string;
  prUrl: string | null;
  headSha: string;
  findingsTotal: number;
  findingsCritical: number;
  findingsHigh: number;
  findingsMedium: number;
  findingsLow: number;
  findingsInfo: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface FindingRow {
  id: string;
  reviewId: string;
  source: FindingV1['source'];
  category: FindingV1['category'];
  severity: FindingV1['severity'];
  confidence: FindingV1['confidence'];
  filePath: string;
  lineStart: number;
  lineEnd: number | null;
  message: string;
  evidence: string | null;
  recommendation: string | null;
  validationStatus: FindingV1['validationStatus'];
  fingerprint: string;
}

export function toReviewSummary(row: ReviewRow): ReviewSummaryV1 {
  const summary: ReviewSummaryV1 = {
    schemaVersion: 1,
    id: row.id,
    mode: row.mode,
    repository: {
      id: row.repositoryId ?? row.id,
      owner: row.owner,
      name: row.name,
    },
    pullRequest: {
      number: row.prNumber,
      title: row.prTitle,
    },
    headSha: row.headSha,
    status: row.status,
    findingsSummary: {
      total: row.findingsTotal,
      critical: row.findingsCritical,
      high: row.findingsHigh,
      medium: row.findingsMedium,
      low: row.findingsLow,
      info: row.findingsInfo,
    },
  };

  if (row.prUrl) {
    summary.pullRequest.url = row.prUrl;
  }
  if (row.startedAt) {
    summary.startedAt = row.startedAt.toISOString();
  }
  if (row.completedAt) {
    summary.completedAt = row.completedAt.toISOString();
  }

  return summary;
}

export function toFindingV1(row: FindingRow): FindingV1 {
  const finding: FindingV1 = {
    schemaVersion: 1,
    id: row.id,
    reviewId: row.reviewId,
    source: row.source,
    category: row.category,
    severity: row.severity,
    confidence: row.confidence,
    filePath: row.filePath,
    lineStart: row.lineStart,
    message: row.message,
    validationStatus: row.validationStatus,
    fingerprint: row.fingerprint,
  };

  if (row.lineEnd !== null) {
    finding.lineEnd = row.lineEnd;
  }
  if (row.evidence !== null) {
    finding.evidence = row.evidence;
  }
  if (row.recommendation !== null) {
    finding.recommendation = row.recommendation;
  }

  return finding;
}
