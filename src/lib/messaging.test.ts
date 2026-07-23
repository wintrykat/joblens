import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeJd, extractSkills, openSidePanel, preflightJd } from './messaging';
import { installChromeMock, type ChromeMock } from '../../tests/helpers/chromeMock';

describe('messaging', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    mock = installChromeMock();
  });

  it('resolves success responses', async () => {
    mock.sendMessageImpl = (_msg, cb) => {
      cb({ ok: true, data: { skills: [] } });
    };
    const res = await extractSkills();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.skills).toEqual([]);
  });

  it('surfaces chrome.runtime.lastError', async () => {
    mock.sendMessageImpl = (_msg, cb) => {
      mock.lastError = { message: 'Extension context invalidated.' };
      cb(undefined);
    };
    const res = await analyzeJd({ url: 'https://x', pageText: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/refresh this page/i);
  });

  it('catches synchronous invalidated-context throws', async () => {
    mock.sendMessageImpl = () => {
      throw new Error('Extension context invalidated.');
    };
    const res = await preflightJd({ url: 'https://x', pageText: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/refresh this page/i);
  });

  it('rejects malformed responses', async () => {
    mock.sendMessageImpl = (_msg, cb) => cb({ weird: true });
    const res = await preflightJd({ url: 'https://x', pageText: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Malformed/i);
  });

  it('openSidePanel forwards startScan', async () => {
    let seen: unknown;
    mock.sendMessageImpl = (msg, cb) => {
      seen = msg;
      cb({ ok: true, data: { opened: true } });
    };
    const res = await openSidePanel({ startScan: false });
    expect(res.ok).toBe(true);
    expect(seen).toMatchObject({ type: 'OPEN_SIDE_PANEL', startScan: false });
  });
});
