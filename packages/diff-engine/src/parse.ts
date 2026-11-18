import type { DiffHunk, DiffLine, ParsedFileDiff } from './types.js';

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function emptyFile(oldPath: string, newPath: string): ParsedFileDiff {
  return {
    oldPath,
    newPath,
    isNew: oldPath === '/dev/null',
    isDeleted: newPath === '/dev/null',
    isRenamed: oldPath !== '/dev/null' && newPath !== '/dev/null' && oldPath !== newPath,
    hunks: [],
  };
}

/**
 * Parse a single-file unified patch (as returned by GitHub's pull request files API).
 * The GitHub `patch` field omits `diff --git` / `---` / `+++` headers, so `filename`
 * and optional `previousFilename` are required for path metadata.
 */
export function parseFilePatch(
  filename: string,
  patch: string | undefined,
  previousFilename?: string,
): ParsedFileDiff {
  const oldPath = previousFilename ?? filename;
  const parsed = emptyFile(oldPath, filename);

  if (!patch || patch.trim().length === 0) {
    return parsed;
  }

  const lines = patch.split(/\r?\n/);
  let current: DiffHunk | null = null;

  for (const line of lines) {
    const hunkMatch = HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      current = {
        oldStart: Number(hunkMatch[1]),
        oldLines: Number(hunkMatch[2] ?? '1'),
        newStart: Number(hunkMatch[3]),
        newLines: Number(hunkMatch[4] ?? '1'),
        header: line,
        lines: [],
      };
      parsed.hunks.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('\\')) {
      // "\ No newline at end of file"
      continue;
    }

    const prefix = line[0];
    const content = line.slice(1);
    let type: DiffLine['type'];
    if (prefix === '+') {
      type = 'add';
    } else if (prefix === '-') {
      type = 'del';
    } else {
      type = 'context';
    }

    current.lines.push({
      type,
      content,
      oldLineNumber: null,
      newLineNumber: null,
    });
  }

  for (const hunk of parsed.hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const diffLine of hunk.lines) {
      if (diffLine.type === 'add') {
        diffLine.newLineNumber = newLine;
        newLine += 1;
      } else if (diffLine.type === 'del') {
        diffLine.oldLineNumber = oldLine;
        oldLine += 1;
      } else {
        diffLine.oldLineNumber = oldLine;
        diffLine.newLineNumber = newLine;
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return parsed;
}

/**
 * Parse a multi-file unified diff (git-style with `diff --git` headers).
 */
export function parseUnifiedDiff(diffText: string): ParsedFileDiff[] {
  const files: ParsedFileDiff[] = [];
  const chunks = diffText.split(/^diff --git /m).filter((c) => c.trim().length > 0);

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const first = lines[0] ?? '';
    const pathMatch = /^a\/(.+?) b\/(.+)$/.exec(first.trim());
    let oldPath = pathMatch?.[1] ?? 'unknown';
    let newPath = pathMatch?.[2] ?? 'unknown';

    for (const line of lines) {
      if (line.startsWith('--- ')) {
        const raw = line.slice(4).trim();
        oldPath = raw === '/dev/null' ? '/dev/null' : raw.replace(/^a\//, '');
      } else if (line.startsWith('+++ ')) {
        const raw = line.slice(4).trim();
        newPath = raw === '/dev/null' ? '/dev/null' : raw.replace(/^b\//, '');
      }
    }

    const hunkStart = lines.findIndex((l) => l.startsWith('@@ '));
    const patchBody = hunkStart >= 0 ? lines.slice(hunkStart).join('\n') : '';
    const previousFilename = oldPath !== '/dev/null' && oldPath !== newPath ? oldPath : undefined;
    files.push(
      parseFilePatch(newPath === '/dev/null' ? oldPath : newPath, patchBody, previousFilename),
    );
  }

  return files;
}

/** Return the set of new-file line numbers that were added in the diff. */
export function getAddedLineNumbers(file: ParsedFileDiff): Set<number> {
  const added = new Set<number>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add' && line.newLineNumber !== null) {
        added.add(line.newLineNumber);
      }
    }
  }
  return added;
}

/**
 * Returns true when `lineStart` falls on an added line in the new file path.
 * Used to drop findings that reference unchanged context lines.
 */
export function isAddedLine(file: ParsedFileDiff, lineStart: number): boolean {
  return getAddedLineNumbers(file).has(lineStart);
}

export function findFileDiff(
  files: ParsedFileDiff[],
  filePath: string,
): ParsedFileDiff | undefined {
  return files.find((f) => f.newPath === filePath || f.oldPath === filePath);
}
