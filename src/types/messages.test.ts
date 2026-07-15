import { describe, expect, it } from 'vitest';
import {
  isExtensionFailure,
  isExtensionSuccess,
  isOkResponse,
  parseAnalysisPayload,
  parseExtractedSkills,
  parsePreflightPayload,
} from './messages';
import { EMPTY_ANALYSIS } from './domain';

describe('messages parsers', () => {
  it('parseExtractedSkills accepts array or wrapped object', () => {
    expect(
      parseExtractedSkills({
        skills: [{ skill: 'TS', years: 2, confidence: 'high', source: 'x' }],
      })
    ).toHaveLength(1);
    expect(parseExtractedSkills([{ skill: 'Go', confidence: 'medium' }])).toHaveLength(1);
  });

  it('parseAnalysisPayload fills defaults', () => {
    const a = parseAnalysisPayload({
      masthead: { title: 'Eng', organization: 'Acme' },
      fit: { label: 'Good fit', score: 85, rationale: 'ok' },
      apply: { verdict: 'yes', rationale: 'go' },
    });
    expect(a.masthead.title).toBe('Eng');
    expect(a.skillMatches).toEqual([]);
    expect(a.dealbreakers).toEqual([]);
  });

  it('parseAnalysisPayload rejects empty', () => {
    expect(() => parseAnalysisPayload(null)).toThrow();
  });

  it('parsePreflightPayload maps workModel hint', () => {
    const p = parsePreflightPayload({
      verdict: 'soft',
      reasons: ['x'],
      workModel: 'hybrid',
      flags: [],
    });
    expect(p.workModelHint).toBe('hybrid');
  });

  it('success/failure guards', () => {
    expect(isExtensionSuccess({ ok: true, data: { analysis: EMPTY_ANALYSIS } })).toBe(true);
    expect(isExtensionFailure({ ok: false, error: 'nope' })).toBe(true);
    expect(isExtensionSuccess({ ok: false, error: 'x' })).toBe(false);
  });

  it('isOkResponse accepts bare { ok: true } without data (RUN_SCAN)', () => {
    expect(isOkResponse({ ok: true })).toBe(true);
    expect(isExtensionSuccess({ ok: true })).toBe(false);
    expect(isOkResponse({ ok: false, error: 'x' })).toBe(false);
  });
});
