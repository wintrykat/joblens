import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../src/types/domain';
import { makeConfig } from '../helpers/config';

const callClaude = vi.hoisted(() => vi.fn());
const getConfig = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/anthropic')>();
  return {
    ...actual,
    callClaude,
  };
});

vi.mock('../../src/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/storage')>();
  return {
    ...actual,
    getConfig,
  };
});

import { handleBackgroundRequest } from '../../src/lib/backgroundHandle';
import { PREFLIGHT_CLAUDE_MODEL } from '../../src/lib/settingsOptions';

function fixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, `../fixtures/claude/${name}`), 'utf8');
}

describe('handleBackgroundRequest offline', () => {
  beforeEach(() => {
    callClaude.mockReset();
    getConfig.mockReset();
  });

  it('rejects invalid messages', async () => {
    getConfig.mockResolvedValue(makeConfig({ apiKey: 'sk' }));
    await expect(handleBackgroundRequest({ type: 'NOPE' })).rejects.toThrow(/invalid/i);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it('EXTRACT_SKILLS parses offline Claude fixture', async () => {
    getConfig.mockResolvedValue(makeConfig({ apiKey: 'sk-test' }));
    callClaude.mockResolvedValue(fixture('extract-skills.json'));

    const out = await handleBackgroundRequest({ type: 'EXTRACT_SKILLS' });
    expect(out).toMatchObject({
      skills: expect.arrayContaining([
        expect.objectContaining({ skill: 'TypeScript' }),
      ]),
    });
    expect(callClaude).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: 'disabled', maxTokens: 8192 })
    );
  });

  it('ANALYZE_JD reconciles Matrix Poor to Good via floors', async () => {
    getConfig.mockResolvedValue(
      makeConfig({
        apiKey: 'sk-test',
        locations: [{ zip: '78758', radiusMiles: 25 }],
        preferences: { ...makeConfig().preferences, remoteOnly: true },
      })
    );
    callClaude.mockResolvedValue(fixture('analyze-matrix-poor.json'));

    const out = await handleBackgroundRequest({
      type: 'ANALYZE_JD',
      url: 'https://www.ziprecruiter.com/jobs/matrix',
      pageText: 'Matrix Retail Full Stack Developer Remote Javascript React Python',
    });
    expect('analysis' in out).toBe(true);
    if (!('analysis' in out)) return;
    expect(out.analysis.fit.score).toBeGreaterThanOrEqual(85);
    expect(out.analysis.apply.verdict).toBe('yes');
    expect(callClaude).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: 'adaptive', effort: 'medium' })
    );
  });

  it('PREFLIGHT_JD requires API key and geo intent', async () => {
    getConfig.mockResolvedValue(makeConfig({ apiKey: '' }));
    await expect(
      handleBackgroundRequest({
        type: 'PREFLIGHT_JD',
        url: 'https://example.com',
        pageText: 'remote',
      })
    ).rejects.toThrow(/API key/i);

    getConfig.mockResolvedValue(makeConfig({ apiKey: 'sk' }));
    await expect(
      handleBackgroundRequest({
        type: 'PREFLIGHT_JD',
        url: 'https://example.com',
        pageText: 'remote',
      })
    ).rejects.toThrow(/geography/i);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it('PREFLIGHT_JD local hard_skip skips Claude', async () => {
    getConfig.mockResolvedValue(
      makeConfig({
        apiKey: 'sk',
        locations: [{ zip: '78758', radiusMiles: 25 }],
      })
    );

    const out = await handleBackgroundRequest({
      type: 'PREFLIGHT_JD',
      url: 'https://example.com/job',
      pageText:
        'Acme Corp — Software Engineer\nLocation: New York, NY 10001\nWork model: On-site in office daily.\nJob description: '.padEnd(
          500,
          'x'
        ),
      pageTitle: 'Software Engineer - Acme',
    });
    expect('preflight' in out).toBe(true);
    if (!('preflight' in out)) return;
    expect(out.preflight.verdict).toBe('hard_skip');
    expect(callClaude).not.toHaveBeenCalled();
  });

  it('PREFLIGHT_JD hybrid mode skips Haiku unless forceHaiku', async () => {
    const cfg: Config = makeConfig({
      apiKey: 'sk',
      preflightMode: 'hybrid',
      locations: [{ zip: '78758', radiusMiles: 25 }],
      preferences: { ...makeConfig().preferences, remoteOnly: true },
    });
    getConfig.mockResolvedValue(cfg);

    const localOnly = await handleBackgroundRequest({
      type: 'PREFLIGHT_JD',
      url: 'https://example.com/job',
      pageText: 'Fully remote software role. Build APIs. '.padEnd(500, 'r'),
    });
    expect('preflight' in localOnly).toBe(true);
    expect(callClaude).not.toHaveBeenCalled();

    callClaude.mockResolvedValue(fixture('preflight-haiku-clear.json'));
    const forced = await handleBackgroundRequest({
      type: 'PREFLIGHT_JD',
      url: 'https://example.com/job',
      pageText: 'Fully remote software role. Build APIs. '.padEnd(500, 'r'),
      forceHaiku: true,
    });
    expect('preflight' in forced).toBe(true);
    if (!('preflight' in forced)) return;
    expect(callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        model: PREFLIGHT_CLAUDE_MODEL,
        thinking: 'disabled',
      })
    );
    expect(forced.preflight.sources).toEqual(expect.arrayContaining(['haiku']));
  });

  it('PROPOSE_CONFIG_FROM_DOCS returns allowlisted changes', async () => {
    getConfig.mockResolvedValue(makeConfig({ apiKey: 'sk' }));
    callClaude.mockResolvedValue(fixture('propose-config.json'));

    const out = await handleBackgroundRequest({
      type: 'PROPOSE_CONFIG_FROM_DOCS',
      documentText: 'Resume text with TypeScript',
    });
    expect(out).toMatchObject({
      summary: 'From resume',
      changes: expect.arrayContaining([
        expect.objectContaining({ path: 'skillClaims' }),
        expect.objectContaining({ path: 'preferences.remoteOnly' }),
      ]),
    });
  });
});
