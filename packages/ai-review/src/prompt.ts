import type { AiReviewInput } from './types.js';

/** Rough token estimate: ~4 characters per token for English/code. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated]`;
}

export function buildSystemPrompt(): string {
  return [
    'You are PR Guardian, a code review assistant.',
    'Analyze the pull request changes and return ONLY valid JSON matching:',
    '{"findings":[{"category":"security|bug|error_handling|performance|test_coverage|style","severity":"critical|high|medium|low|info","confidence":"high|medium|low","filePath":"...","lineStart":1,"lineEnd":1,"message":"...","evidence":"...","recommendation":"..."}]}',
    'Focus on real defects and security issues. Prefer findings on changed lines.',
    'Do not invent file paths. Do not include markdown or prose outside JSON.',
  ].join(' ');
}

export function buildUserPrompt(input: AiReviewInput, maxInputTokens: number): string {
  const header = [
    `Repository: ${input.repository.owner}/${input.repository.name}`,
    `PR #${input.pullRequest.number}: ${input.pullRequest.title}`,
    `Head SHA: ${input.pullRequest.headSha}`,
    '',
    'Existing static-analysis findings:',
    input.staticFindings.length === 0
      ? '(none)'
      : input.staticFindings
          .map(
            (f) =>
              `- [${f.severity}] ${f.filePath}:${f.lineStart} ${f.message} (fingerprint=${f.fingerprint})`,
          )
          .join('\n'),
    '',
    'Changed files:',
  ].join('\n');

  const reserved = estimateTokens(header) + estimateTokens(buildSystemPrompt()) + 512;
  let remaining = Math.max(1_000, maxInputTokens - reserved);

  const fileBlocks: string[] = [];
  for (const file of input.files) {
    const blockHeader = `\n--- ${file.path} ---\n`;
    const headerTokens = estimateTokens(blockHeader);
    if (remaining <= headerTokens + 50) break;
    const body = truncateToTokens(file.content, remaining - headerTokens);
    const block = `${blockHeader}${body}`;
    remaining -= estimateTokens(block);
    fileBlocks.push(block);
  }

  return `${header}${fileBlocks.join('')}\n\nRespond with JSON only.`;
}
