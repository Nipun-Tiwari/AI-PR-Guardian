import { FindingV1Schema, type FindingV1 } from '@prguardian/shared';
import { findFileDiff, isAddedLine, type ParsedFileDiff } from '@prguardian/diff-engine';

export interface NormalizeOptions {
  /** When true (default), drop findings that are not on added lines. */
  requireAddedLine?: boolean;
}

export interface NormalizeResult {
  findings: FindingV1[];
  rejected: Array<{ reason: string; fingerprint?: string }>;
}

/**
 * Validate, location-check, and fingerprint-dedupe findings from all sources.
 */
export function normalizeFindings(
  candidates: FindingV1[],
  diffs: ParsedFileDiff[],
  options: NormalizeOptions = {},
): NormalizeResult {
  const requireAddedLine = options.requireAddedLine ?? true;
  const rejected: NormalizeResult['rejected'] = [];
  const validated: FindingV1[] = [];

  for (const candidate of candidates) {
    const parsed = FindingV1Schema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({ reason: `schema: ${parsed.error.message}` });
      continue;
    }

    let finding = parsed.data;
    const file = findFileDiff(diffs, finding.filePath);

    if (requireAddedLine) {
      if (!file || !isAddedLine(file, finding.lineStart)) {
        finding = { ...finding, validationStatus: 'invalid_location' };
        rejected.push({
          reason: 'invalid_location',
          fingerprint: finding.fingerprint,
        });
        continue;
      }
    }

    if (finding.validationStatus !== 'valid') {
      rejected.push({
        reason: finding.validationStatus,
        fingerprint: finding.fingerprint,
      });
      continue;
    }

    validated.push(finding);
  }

  // Prefer static_rule over llm when fingerprints collide; keep first otherwise.
  const byFingerprint = new Map<string, FindingV1>();
  for (const finding of validated) {
    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing) {
      byFingerprint.set(finding.fingerprint, finding);
      continue;
    }
    if (existing.source === 'llm' && finding.source === 'static_rule') {
      byFingerprint.set(finding.fingerprint, finding);
    }
  }

  return {
    findings: [...byFingerprint.values()],
    rejected,
  };
}
