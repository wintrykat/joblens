/**
 * Offline regressions for historical defect shapes + synthetic twins.
 * Never hits Anthropic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BOISE_REMOTE_EXCLUDE,
  CUTSFORTH_REMOTE_EXCLUDE,
  LIVEFLOW_NYC_ONSITE,
  SEATTLE_ONSITE_NOISE_ZIP,
} from '../fixtures/postings';
import { makeConfig } from '../helpers/config';
import { DEFAULT_PREFERENCES } from '../../src/types/domain';
import { ONSITE_COMMUTE_DEALBREAKER } from '../../src/lib/ratings';

const callClaude = vi.hoisted(() => vi.fn());
const getConfig = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/anthropic')>();
  return { ...actual, callClaude };
});

vi.mock('../../src/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/storage')>();
  return { ...actual, getConfig };
});

import { handleBackgroundRequest } from '../../src/lib/backgroundHandle';

function claudeFixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, `../fixtures/claude/${name}`), 'utf8');
}

function onsitePoorFarAnalysis(org: string, cityLine: string): string {
  return JSON.stringify({
    masthead: {
      organization: org,
      title: 'Engineer',
      workModel: 'onsite',
      travel: 'None',
      employmentTerms: 'Full-time',
      healthInsurance: 'Unknown',
      payRange: 'n/a',
      seniority: 'Mid',
      workAuthorization: 'US',
      location: cityLine,
    },
    geo: { verdict: 'eligible', reason: 'model wrong', method: 'model' },
    skillMatches: [],
    dealbreakers: [],
    skipFlags: [],
    postingSmell: '',
    declutteredJD: `${org}\n${cityLine}\nOn-site role.`,
    fit: { label: 'Good fit', score: 85, rationale: 'skills ok' },
    apply: { verdict: 'yes', rationale: 'ok' },
  });
}

describe('defect regressions (offline)', () => {
  beforeEach(() => {
    callClaude.mockReset();
    getConfig.mockReset();
  });

  it('Matrix-shape ANALYZE: Poor + strong skills → Fit ≥ 85 Apply yes', async () => {
    getConfig.mockResolvedValue(
      makeConfig({
        apiKey: 'sk',
        preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
      })
    );
    callClaude.mockResolvedValue(claudeFixture('analyze-matrix-poor.json'));
    const out = await handleBackgroundRequest({
      type: 'ANALYZE_JD',
      url: 'https://example.com/matrix',
      pageText: 'Remote Full Stack Developer Javascript React Python',
    });
    expect('analysis' in out).toBe(true);
    if (!('analysis' in out)) return;
    expect(out.analysis.fit.score).toBeGreaterThanOrEqual(85);
    expect(out.analysis.apply.verdict).toBe('yes');
  });

  it('Orion twin ANALYZE: same match shape lifts Poor/No', async () => {
    getConfig.mockResolvedValue(makeConfig({ apiKey: 'sk' }));
    callClaude.mockResolvedValue(
      JSON.stringify({
        masthead: {
          organization: 'Orion Systems',
          title: 'Backend Engineer',
          workModel: 'remote',
          travel: 'None',
          employmentTerms: 'Full-time',
          healthInsurance: 'Unknown',
          payRange: 'n/a',
          seniority: 'Mid',
          workAuthorization: 'US',
        },
        geo: { verdict: 'eligible', reason: 'Remote', method: 'model' },
        skillMatches: [
          {
            requirement: 'Strong Go microservices experience',
            evidence: 'Go',
            reason: 'match',
            status: 'match',
            confidence: 'high',
          },
          {
            requirement: 'PostgreSQL and schema design',
            evidence: 'PG',
            reason: 'match',
            status: 'match',
            confidence: 'high',
          },
          {
            requirement: 'gRPC and protobuf',
            evidence: 'gRPC',
            reason: 'match',
            status: 'match',
            confidence: 'high',
          },
          {
            requirement: 'Familiarity with Terraform',
            evidence: 'some',
            reason: 'partial',
            status: 'partial',
            confidence: 'medium',
          },
        ],
        dealbreakers: [],
        skipFlags: [],
        postingSmell: '',
        declutteredJD: 'Remote backend role.',
        fit: { label: 'Poor fit', score: 0, rationale: 'pessimism' },
        apply: { verdict: 'no', rationale: 'refuse' },
      })
    );
    const out = await handleBackgroundRequest({
      type: 'ANALYZE_JD',
      url: 'https://example.com/orion',
      pageText: 'Remote Go PostgreSQL gRPC',
    });
    expect('analysis' in out).toBe(true);
    if (!('analysis' in out)) return;
    expect(out.analysis.fit.score).toBeGreaterThanOrEqual(85);
    expect(out.analysis.apply.verdict).toBe('yes');
  });

  it.each([
    ['LiveFlow NYC', LIVEFLOW_NYC_ONSITE, 'LiveFlow', 'New York, NY'],
    ['Seattle twin', SEATTLE_ONSITE_NOISE_ZIP, 'Northwind Labs', 'Seattle, WA'],
  ])(
    '%s ANALYZE: operator ZIP noise → geo excluded + commute dealbreaker',
    async (_label, pageText, org, city) => {
      getConfig.mockResolvedValue(
        makeConfig({
          apiKey: 'sk',
          locations: [{ zip: '78758', radiusMiles: 25 }],
        })
      );
      callClaude.mockResolvedValue(onsitePoorFarAnalysis(org, city));
      const out = await handleBackgroundRequest({
        type: 'ANALYZE_JD',
        url: 'https://example.com/onsite',
        pageText,
      });
      expect('analysis' in out).toBe(true);
      if (!('analysis' in out)) return;
      expect(out.analysis.geo?.verdict).toBe('excluded');
      expect(out.analysis.apply.verdict).toBe('no');
      expect(
        out.analysis.dealbreakers.some((d) => d.requirement === ONSITE_COMMUTE_DEALBREAKER)
      ).toBe(true);
    }
  );

  it.each([
    ['Cutsforth', CUTSFORTH_REMOTE_EXCLUDE, ['TX', 'PA']],
    ['Boise twin', BOISE_REMOTE_EXCLUDE, ['CO', 'WA']],
  ])(
    '%s PREFLIGHT local: exclude list + short training → not hard_skip',
    async (_label, pageText, regions) => {
      getConfig.mockResolvedValue(
        makeConfig({
          apiKey: 'sk',
          // Hybrid keeps local path without Haiku so we assert residency_ok offline.
          preflightMode: 'hybrid',
          locations: [{ zip: '78758', radiusMiles: 25 }],
          workEligibleRegions: regions,
          preferences: {
            ...DEFAULT_PREFERENCES,
            occasionalTravelAllowance: 'quarterly',
            flagPermNotices: false,
            flagShellEmployers: false,
          },
          flagPermNotices: false,
        })
      );
      const out = await handleBackgroundRequest({
        type: 'PREFLIGHT_JD',
        url: 'https://example.com/remote',
        pageText,
      });
      expect('preflight' in out).toBe(true);
      if (!('preflight' in out)) return;
      expect(out.preflight.verdict).not.toBe('hard_skip');
      expect(out.preflight.flags).toContain('residency_ok');
      expect(callClaude).not.toHaveBeenCalled();
    }
  );
});
