import { describe, expect, it } from 'vitest';
import {
  BLOCKED_EMPLOYER_DEALBREAKER,
  FIT_FLOOR_STRONG,
  ONSITE_COMMUTE_DEALBREAKER,
  REMOTE_ONLY_DEALBREAKER,
  applyRatingFloors,
  findBlockedEmployerHit,
  normalizeDealbreakerTitles,
  skillEvidenceStrength,
} from './ratings';
import { DEFAULT_CONFIG } from './storage';
import { DEFAULT_PREFERENCES, EMPTY_ANALYSIS } from '../types/domain';
import { makeAnalysis } from '../../tests/helpers/analysis';
import { makeConfig } from '../../tests/helpers/config';
import { analysisToJson } from './jsonExport';
import { MATRIX_SKILL_MATCHES, ORION_SKILL_MATCHES } from '../../tests/fixtures/postings';

describe('ratings', () => {
  it('floors excluded commute to Apply no and caps Fit', () => {
    const floored = applyRatingFloors({
      ...EMPTY_ANALYSIS,
      masthead: { ...EMPTY_ANALYSIS.masthead, workModel: 'onsite' },
      geo: { verdict: 'excluded', reason: 'too far', method: 'zip-haversine' },
      dealbreakers: [
        {
          requirement: 'Onsite work location within configured commute radius',
          reason: 'Deterministic far',
          evidence: 'Dallas, TX',
        },
      ],
      fit: { label: 'Excellent fit', score: 95, rationale: 'skills ok' },
      apply: { verdict: 'yes', rationale: 'looks fine' },
    });
    expect(floored.apply.verdict).toBe('no');
    expect(floored.fit.score).toBeLessThanOrEqual(60);
    expect(floored.dealbreakers[0]?.requirement).toBe(ONSITE_COMMUTE_DEALBREAKER);
    expect(analysisToJson(floored, {}).fit.score).toBeLessThanOrEqual(60);
  });

  it('blocks configured employers', () => {
    const blocked = applyRatingFloors(
      makeAnalysis({
        masthead: { ...EMPTY_ANALYSIS.masthead, organization: 'Acme Staffing LLC' },
        fit: { label: 'Good fit', score: 85, rationale: 'ok' },
        apply: { verdict: 'yes', rationale: 'ok' },
      }),
      makeConfig({
        preferences: { ...DEFAULT_PREFERENCES, blockedEmployers: ['Acme Staffing'] },
      })
    );
    expect(blocked.apply.verdict).toBe('no');
    expect(
      blocked.dealbreakers.some((d) => d.requirement === BLOCKED_EMPLOYER_DEALBREAKER)
    ).toBe(true);
  });

  it('remoteOnly rejects onsite', () => {
    const remoteOnlyFloored = applyRatingFloors(
      makeAnalysis({
        masthead: { ...EMPTY_ANALYSIS.masthead, workModel: 'onsite' },
        fit: { label: 'Excellent fit', score: 95, rationale: 'skills ok' },
        apply: { verdict: 'yes', rationale: 'ok' },
      }),
      makeConfig({
        preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
      })
    );
    expect(remoteOnlyFloored.apply.verdict).toBe('no');
    expect(
      remoteOnlyFloored.dealbreakers.some((d) => d.requirement === REMOTE_ONLY_DEALBREAKER)
    ).toBe(true);
    expect(remoteOnlyFloored.fit.score).toBeLessThanOrEqual(60);
  });

  it.each([
    ['Matrix-shape', MATRIX_SKILL_MATCHES],
    ['Orion twin (ratio-aware)', ORION_SKILL_MATCHES],
    [
      'high-ratio 2-of-2',
      [
        {
          requirement: 'Rust',
          evidence: 'y',
          reason: 'r',
          status: 'match' as const,
          confidence: 'high' as const,
        },
        {
          requirement: 'Tokio',
          evidence: 'y',
          reason: 'r',
          status: 'match' as const,
          confidence: 'high' as const,
        },
      ],
    ],
  ])('reconciles Poor/Apply-no with strong skill evidence: %s', (_label, skillMatches) => {
    const reconciled = applyRatingFloors(
      makeAnalysis({
        fit: {
          label: 'Poor fit',
          score: 0,
          rationale: 'Model pessimism despite matches',
        },
        apply: { verdict: 'no', rationale: 'Inconsistent refuse' },
        geo: {
          verdict: 'eligible',
          reason: 'Remote role; no residency restriction.',
          method: 'model',
        },
        skillMatches,
        dealbreakers: [],
        skipFlags: [],
      }),
      DEFAULT_CONFIG
    );
    expect(reconciled.fit.score).toBeGreaterThanOrEqual(FIT_FLOOR_STRONG);
    expect(reconciled.apply.verdict).toBe('yes');
    expect(reconciled.fit.rationale).toMatch(/raised|Reconciled|Floored/i);
  });

  it('skillEvidenceStrength treats mismatches as none', () => {
    expect(
      skillEvidenceStrength(
        makeAnalysis({
          skillMatches: [
            ...MATRIX_SKILL_MATCHES.slice(0, 2),
            {
              requirement: 'Cobol',
              evidence: 'none',
              reason: 'gap',
              status: 'mismatch',
              confidence: 'high',
            },
          ],
        })
      )
    ).toBe('none');
  });

  it('findBlockedEmployerHit and normalizeDealbreakerTitles', () => {
    expect(findBlockedEmployerHit('Acme Staffing LLC', ['Acme Staffing'])).toBe('Acme Staffing');
    expect(findBlockedEmployerHit('Other', ['Acme'])).toBeNull();
    const normalized = normalizeDealbreakerTitles([
      {
        requirement: 'Onsite work location within configured commute radius',
        reason: 'x',
        evidence: 'y',
      },
    ]);
    expect(normalized[0]?.requirement).toBe(ONSITE_COMMUTE_DEALBREAKER);
  });
});
