import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import type { FindingV1 } from '@prguardian/shared';
import { computeFingerprint } from './fingerprint.js';
import type { AnalyzableFile } from './types.js';

/** ESLint runs without typescript-eslint; Semgrep covers .ts/.tsx. */
const ESLINT_EXT = /\.(?:[cm]?js|jsx)$/i;

function mapSeverity(eslintSeverity: number): FindingV1['severity'] {
  return eslintSeverity >= 2 ? 'medium' : 'low';
}

function mapCategory(ruleId: string | null): FindingV1['category'] {
  const id = ruleId ?? '';
  if (id.includes('security') || id.includes('no-eval') || id.includes('no-new-func')) {
    return 'security';
  }
  if (id.includes('unused') || id.includes('undef')) {
    return 'bug';
  }
  return 'style';
}

export async function runEslint(
  files: AnalyzableFile[],
  reviewId: string,
): Promise<{ findings: FindingV1[]; error?: string }> {
  const targets = files.filter((f) => ESLINT_EXT.test(f.path));
  if (targets.length === 0) {
    return { findings: [] };
  }

  const root = await mkdtemp(path.join(tmpdir(), 'prg-eslint-'));
  try {
    const absPaths: string[] = [];
    for (const file of targets) {
      const abs = path.join(root, file.path);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, file.content, 'utf8');
      absPaths.push(abs);
    }

    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{js,cjs,mjs,jsx}'],
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
          },
          rules: {
            'no-eval': 'error',
            'no-new-func': 'error',
            'no-implied-eval': 'error',
            'no-debugger': 'warn',
            'no-empty': 'warn',
            'no-unused-vars': 'warn',
          },
        },
      ],
    });

    const results = await eslint.lintFiles(absPaths);
    const findings: FindingV1[] = [];

    for (const result of results) {
      const relativePath = path.relative(root, result.filePath).replace(/\\/g, '/');
      for (const msg of result.messages) {
        if (msg.line === undefined) continue;
        const message = msg.message;
        const lineStart = msg.line;
        const finding: FindingV1 = {
          schemaVersion: 1,
          id: randomUUID(),
          reviewId,
          source: 'static_rule',
          category: mapCategory(msg.ruleId),
          severity: mapSeverity(msg.severity),
          confidence: 'high',
          filePath: relativePath,
          lineStart,
          message: msg.ruleId ? `[eslint:${msg.ruleId}] ${message}` : `[eslint] ${message}`,
          validationStatus: 'valid',
          fingerprint: computeFingerprint(
            relativePath,
            lineStart,
            msg.ruleId ? `[eslint:${msg.ruleId}] ${message}` : `[eslint] ${message}`,
          ),
        };
        if (msg.endLine !== undefined) {
          finding.lineEnd = msg.endLine;
        }
        findings.push(finding);
      }
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
