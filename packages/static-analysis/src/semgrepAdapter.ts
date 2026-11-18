import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { FindingV1 } from '@prguardian/shared';
import { computeFingerprint } from './fingerprint.js';
import type { AnalyzableFile } from './types.js';

export const SEMGREP_PINNED_VERSION = '1.97.0';

interface SemgrepResultJson {
  results?: Array<{
    check_id: string;
    path: string;
    start: { line: number };
    end?: { line: number };
    extra?: {
      message?: string;
      severity?: string;
      lines?: string;
    };
  }>;
  errors?: Array<{ message?: string }>;
}

function defaultRulesDir(): string {
  // Compiled to CJS under dist/; rules live at package root.
  return path.join(__dirname, '..', 'rules');
}

function mapSemgrepSeverity(raw: string | undefined): FindingV1['severity'] {
  switch ((raw ?? '').toUpperCase()) {
    case 'ERROR':
      return 'high';
    case 'WARNING':
      return 'medium';
    case 'INFO':
      return 'low';
    default:
      return 'medium';
  }
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Semgrep timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export async function runSemgrep(
  files: AnalyzableFile[],
  reviewId: string,
  options: {
    semgrepBin?: string;
    semgrepRulesDir?: string;
    timeoutMs?: number;
    maxTotalBytes?: number;
  } = {},
): Promise<{ findings: FindingV1[]; error?: string }> {
  if (files.length === 0) {
    return { findings: [] };
  }

  const maxTotalBytes = options.maxTotalBytes ?? 2_000_000;
  let total = 0;
  const bounded: AnalyzableFile[] = [];
  for (const file of files) {
    const size = Buffer.byteLength(file.content, 'utf8');
    if (total + size > maxTotalBytes) break;
    total += size;
    bounded.push(file);
  }

  const root = await mkdtemp(path.join(tmpdir(), 'prg-semgrep-'));
  try {
    for (const file of bounded) {
      const abs = path.join(root, file.path);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, file.content, 'utf8');
    }

    const bin = options.semgrepBin ?? 'semgrep';
    const rulesDir = options.semgrepRulesDir ?? defaultRulesDir();
    const timeoutMs = options.timeoutMs ?? 60_000;

    const { stdout, stderr, code } = await runProcess(
      bin,
      [
        'scan',
        '--config',
        rulesDir,
        '--json',
        '--quiet',
        '--disable-version-check',
        '--metrics',
        'off',
        root,
      ],
      timeoutMs,
    );

    // Semgrep exits 0 (no findings) or 1 (findings). Other codes are failures.
    if (code !== 0 && code !== 1) {
      return {
        findings: [],
        error: stderr.trim() || `Semgrep exited with code ${code}`,
      };
    }

    let parsed: SemgrepResultJson;
    try {
      parsed = JSON.parse(stdout) as SemgrepResultJson;
    } catch {
      return { findings: [], error: 'Failed to parse Semgrep JSON output' };
    }

    const findings: FindingV1[] = [];
    for (const result of parsed.results ?? []) {
      const relativePath = path.relative(root, result.path).replace(/\\/g, '/');
      const message = result.extra?.message ?? `Semgrep rule ${result.check_id} matched`;
      const lineStart = result.start.line;
      const formatted = `[semgrep:${result.check_id}] ${message}`;
      const finding: FindingV1 = {
        schemaVersion: 1,
        id: randomUUID(),
        reviewId,
        source: 'static_rule',
        category: 'security',
        severity: mapSemgrepSeverity(result.extra?.severity),
        confidence: 'high',
        filePath: relativePath,
        lineStart,
        message: formatted,
        validationStatus: 'valid',
        fingerprint: computeFingerprint(relativePath, lineStart, formatted),
      };
      if (result.end?.line !== undefined) {
        finding.lineEnd = result.end.line;
      }
      if (result.extra?.lines !== undefined) {
        finding.evidence = result.extra.lines;
      }
      finding.recommendation = `Review and remediate according to Semgrep rule ${result.check_id}.`;
      findings.push(finding);
    }

    return { findings };
  } catch (error) {
    return {
      findings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
