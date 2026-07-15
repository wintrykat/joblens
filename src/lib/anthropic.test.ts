import { afterEach, describe, expect, it, vi } from 'vitest';
import { callClaude, extractJsonObjectText, parseJsonResponse } from './anthropic';

describe('anthropic parse helpers', () => {
  it('strips fences and extracts outermost object', () => {
    expect(extractJsonObjectText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObjectText('Here you go\n{"a":1}\nok')).toBe('{"a":1}');
  });

  it('parseJsonResponse parses and errors on truncation', () => {
    expect(parseJsonResponse('{"ok":true}')).toEqual({ ok: true });
    expect(() => parseJsonResponse('{"ok":true')).toThrow(/truncated|parse/i);
  });
});

describe('callClaude offline fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects missing API key without fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      callClaude({
        apiKey: '',
        model: 'claude-sonnet-5',
        system: 's',
        user: 'u',
      })
    ).rejects.toThrow(/No API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs messages API and returns text blocks', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: '{"skills":[]}' }],
            stop_reason: 'end_turn',
          }),
        }) as Response
    );
    vi.stubGlobal('fetch', fetchMock);

    const text = await callClaude({
      apiKey: 'sk-test',
      model: 'claude-sonnet-5',
      system: 'sys',
      user: 'usr',
      thinking: 'disabled',
      maxTokens: 128,
    });
    expect(text).toBe('{"skills":[]}');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('sends adaptive thinking with effort', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: '{}' }],
            stop_reason: 'end_turn',
          }),
        }) as Response
    );
    vi.stubGlobal('fetch', fetchMock);
    await callClaude({
      apiKey: 'sk',
      model: 'claude-sonnet-5',
      system: 's',
      user: 'u',
      thinking: 'adaptive',
      effort: 'medium',
    });
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'medium' });
  });

  it('throws on API error and max_tokens stop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'nope' }),
        text: async () => 'nope',
      }))
    );
    await expect(
      callClaude({ apiKey: 'sk', model: 'm', system: 's', user: 'u', thinking: 'disabled' })
    ).rejects.toThrow(/401/);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: '{' }],
          stop_reason: 'max_tokens',
        }),
      }))
    );
    await expect(
      callClaude({ apiKey: 'sk', model: 'm', system: 's', user: 'u', thinking: 'disabled' })
    ).rejects.toThrow(/truncated|max_tokens/i);
  });
});
