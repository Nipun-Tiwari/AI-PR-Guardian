import { describe, it, expect } from 'vitest';
import {
  getAddedLineNumbers,
  isAddedLine,
  parseFilePatch,
  parseUnifiedDiff,
} from '../src/parse.js';

describe('parseFilePatch', () => {
  it('maps added lines for a normal single-hunk patch', () => {
    const patch = ['@@ -1,3 +1,4 @@', ' line1', '-old', '+new', ' line3', '+added'].join('\n');

    const parsed = parseFilePatch('src/a.ts', patch);
    expect(parsed.newPath).toBe('src/a.ts');
    expect(parsed.isRenamed).toBe(false);
    expect([...getAddedLineNumbers(parsed)].sort((a, b) => a - b)).toEqual([2, 4]);
    expect(isAddedLine(parsed, 2)).toBe(true);
    expect(isAddedLine(parsed, 1)).toBe(false);
  });

  it('handles renamed files via previousFilename', () => {
    const patch = ['@@ -1,1 +1,1 @@', '-old', '+new'].join('\n');
    const parsed = parseFilePatch('src/new.ts', patch, 'src/old.ts');
    expect(parsed.isRenamed).toBe(true);
    expect(parsed.oldPath).toBe('src/old.ts');
    expect(parsed.newPath).toBe('src/new.ts');
    expect(isAddedLine(parsed, 1)).toBe(true);
  });

  it('handles multi-hunk diffs', () => {
    const patch = ['@@ -1,2 +1,3 @@', ' a', '+b', ' c', '@@ -10,2 +11,3 @@', ' x', '+y', ' z'].join(
      '\n',
    );

    const parsed = parseFilePatch('multi.ts', patch);
    expect(parsed.hunks).toHaveLength(2);
    expect([...getAddedLineNumbers(parsed)].sort((a, b) => a - b)).toEqual([2, 12]);
  });
});

describe('parseUnifiedDiff', () => {
  it('parses multi-file git diffs including renames', () => {
    const diff = [
      'diff --git a/old.ts b/new.ts',
      'rename from old.ts',
      'rename to new.ts',
      '--- a/old.ts',
      '+++ b/new.ts',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      'diff --git a/keep.ts b/keep.ts',
      '--- a/keep.ts',
      '+++ b/keep.ts',
      '@@ -2,1 +2,2 @@',
      ' c',
      '+d',
    ].join('\n');

    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0]?.isRenamed).toBe(true);
    expect(files[0]?.newPath).toBe('new.ts');
    expect(isAddedLine(files[1]!, 3)).toBe(true);
  });
});
