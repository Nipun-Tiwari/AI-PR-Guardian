import { runEslint } from './eslintAdapter.js';
import { runSemgrep } from './semgrepAdapter.js';
import type { AnalyzableFile, StaticAnalysisOptions, StaticAnalysisResult } from './types.js';

/**
 * Run ESLint and Semgrep. Scanner failures are captured in `errors` and do not
 * discard findings already collected from other scanners.
 */
export async function runStaticAnalysis(
  files: AnalyzableFile[],
  options: StaticAnalysisOptions,
): Promise<StaticAnalysisResult> {
  const findings = [];
  const errors: string[] = [];

  const eslintResult = await runEslint(files, options.reviewId);
  findings.push(...eslintResult.findings);
  if (eslintResult.error) {
    errors.push(`eslint: ${eslintResult.error}`);
  }

  const semgrepResult = await runSemgrep(files, options.reviewId, {
    ...(options.semgrepBin !== undefined ? { semgrepBin: options.semgrepBin } : {}),
    ...(options.semgrepRulesDir !== undefined ? { semgrepRulesDir: options.semgrepRulesDir } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxTotalBytes !== undefined ? { maxTotalBytes: options.maxTotalBytes } : {}),
  });
  findings.push(...semgrepResult.findings);
  if (semgrepResult.error) {
    errors.push(`semgrep: ${semgrepResult.error}`);
  }

  return { findings, errors };
}
