import type { AiReviewConfig, AiReviewInput, AiReviewResult } from './types.js';
import { AiReviewResponseSchema } from './schema.js';
import { buildSystemPrompt, buildUserPrompt, estimateTokens } from './prompt.js';

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function runAnthropicReview(
  input: AiReviewInput,
  config: AiReviewConfig,
): Promise<AiReviewResult> {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(input, config.maxInputTokens);
  const approxInput = estimateTokens(system) + estimateTokens(user);

  if (approxInput > config.maxInputTokens) {
    return {
      candidates: [],
      usage: { inputTokens: approxInput, outputTokens: 0 },
      rawRejected: true,
      error: `Prompt exceeds AI_MAX_INPUT_TOKENS (${approxInput} > ${config.maxInputTokens})`,
    };
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const apiBaseUrl = config.apiBaseUrl ?? 'https://api.anthropic.com';
  const timeoutMs = config.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${apiBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: config.maxOutputTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });

    const body = (await response.json()) as AnthropicMessageResponse;
    const inputTokens = body.usage?.input_tokens ?? approxInput;
    const outputTokens = body.usage?.output_tokens ?? 0;

    if (!response.ok) {
      return {
        candidates: [],
        usage: { inputTokens, outputTokens },
        rawRejected: true,
        error: body.error?.message ?? `Anthropic API HTTP ${response.status}`,
      };
    }

    const text = (body.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text!)
      .join('\n');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonText(text));
    } catch {
      return {
        candidates: [],
        usage: { inputTokens, outputTokens },
        rawRejected: true,
        error: 'Model response was not valid JSON',
      };
    }

    const validated = AiReviewResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return {
        candidates: [],
        usage: { inputTokens, outputTokens },
        rawRejected: true,
        error: `Model JSON failed schema validation: ${validated.error.message}`,
      };
    }

    const candidates = validated.data.findings.map((f) => {
      const candidate: import('./types.js').AiCandidateFinding = {
        category: f.category,
        severity: f.severity,
        confidence: f.confidence,
        filePath: f.filePath,
        lineStart: f.lineStart,
        message: f.message,
      };
      if (f.lineEnd !== undefined) candidate.lineEnd = f.lineEnd;
      if (f.evidence !== undefined) candidate.evidence = f.evidence;
      if (f.recommendation !== undefined) candidate.recommendation = f.recommendation;
      return candidate;
    });

    return {
      candidates,
      usage: { inputTokens, outputTokens },
      rawRejected: false,
    };
  } catch (error) {
    return {
      candidates: [],
      usage: { inputTokens: approxInput, outputTokens: 0 },
      rawRejected: true,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
