export interface AnalyzableFile {
  path: string;
  content: string;
}

export interface StaticAnalysisOptions {
  reviewId: string;
  /** Absolute path to Semgrep binary. Defaults to `semgrep` on PATH. */
  semgrepBin?: string;
  /** Directory containing local Semgrep rules. */
  semgrepRulesDir?: string;
  /** Subprocess timeout in milliseconds. */
  timeoutMs?: number;
  /** Max aggregate file bytes written to the temp workspace. */
  maxTotalBytes?: number;
}

export interface StaticAnalysisResult {
  findings: import('@prguardian/shared').FindingV1[];
  errors: string[];
}
