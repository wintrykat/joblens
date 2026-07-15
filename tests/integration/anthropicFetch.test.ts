import { afterEach, describe, expect, it, vi } from 'vitest';
import { callClaude } from '../../src/lib/anthropic';

describe('anthropic fetch integration (offline stub)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never contacts a real host — stubbed fetch only', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('api.anthropic.com');
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: '{"hello":true}' }],
          stop_reason: 'end_turn',
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await callClaude({
      apiKey: 'sk-offline',
      model: 'claude-haiku-4-5',
      system: 'return json',
      user: 'hi',
      thinking: 'disabled',
    });
    expect(JSON.parse(text)).toEqual({ hello: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
