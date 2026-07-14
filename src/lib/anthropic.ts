import { z } from 'zod';

const API_URL = 'https://api.anthropic.com/v1/messages';

const AnthropicTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const AnthropicResponseSchema = z.object({
  content: z.array(
    z.union([
      AnthropicTextBlockSchema,
      z.object({ type: z.string() }).passthrough(),
    ])
  ),
  stop_reason: z.string().nullable().optional(),
});

export type ThinkingMode = 'disabled' | 'adaptive';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type CallClaudeArgs = {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /**
   * Sonnet 5+ defaults to adaptive thinking at high effort; thinking tokens
   * count against max_tokens. Extraction should disable thinking; analysis
   * can keep adaptive at a lower effort.
   */
  thinking?: ThinkingMode;
  effort?: EffortLevel;
};

/** Models that reject thinking: { type: "disabled" }. */
function modelRequiresAdaptiveThinking(model: string): boolean {
  return /fable|mythos/i.test(model);
}

export async function callClaude({
  apiKey,
  model,
  system,
  user,
  maxTokens = 4096,
  thinking = 'adaptive',
  effort,
}: CallClaudeArgs): Promise<string> {
  if (!apiKey) {
    throw new Error('No API key set. Open JobLens options and add one.');
  }

  const thinkingType: ThinkingMode =
    thinking === 'disabled' && modelRequiresAdaptiveThinking(model)
      ? 'adaptive'
      : thinking;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    thinking: { type: thinkingType },
  };

  // effort only applies with adaptive thinking
  if (thinkingType === 'adaptive' && effort) {
    body.output_config = { effort };
  } else if (thinkingType === 'adaptive' && thinking === 'disabled') {
    // Fable/Mythos fallback: keep adaptive but minimize thinking spend
    body.output_config = { effort: 'low' };
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text();
    }
    throw new Error(`Anthropic API ${res.status}: ${detail}`);
  }

  const json: unknown = await res.json();
  const data = AnthropicResponseSchema.parse(json);
  const text = data.content
    .filter((b): b is z.infer<typeof AnthropicTextBlockSchema> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  if (data.stop_reason === 'max_tokens') {
    throw new Error(
      'Model response was truncated (hit max_tokens, often because thinking used most of the budget). Try again; if it persists, pick a lighter model or shorten work history.'
    );
  }

  return text;
}

/**
 * Models are prompted to return a bare JSON object. Strip fences defensively and
 * grab the outermost {...} in case a stray sentence sneaks in.
 */
export function extractJsonObjectText(text: string): string {
  let t = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/u, '')
    .trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

export function parseJsonResponse(text: string): unknown {
  const t = extractJsonObjectText(text);
  try {
    return JSON.parse(t) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const looksTruncated = !t.trimEnd().endsWith('}') || /,\s*$/.test(t.trimEnd());
    if (looksTruncated) {
      throw new Error(
        `Failed to parse model JSON (response looks truncated): ${msg}`
      );
    }
    throw new Error(`Failed to parse model JSON: ${msg}`);
  }
}
