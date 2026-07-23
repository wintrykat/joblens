import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_SYSTEM,
  buildAnalysisUser,
  buildPreflightHardGates,
  buildPreflightUser,
  PREFLIGHT_SYSTEM,
} from './prompts';
import { DEFAULT_CONFIG } from './storage';
import { DEFAULT_PREFERENCES } from '../types/domain';
import { makeConfig } from '../../tests/helpers/config';

describe('prompts', () => {
  it('buildAnalysisUser includes preferences and never-claim', () => {
    const user = buildAnalysisUser({
      profile: makeConfig({
        education: 'Bachelor of Science (BSc / BS)',
        skillClaims: [
          { skill: 'TypeScript', standing: 'held', years: 5 },
          { skill: 'Rust', standing: 'ramp', years: 1 },
          { skill: 'Cobol', standing: 'never_claim' },
        ],
        preferences: {
          ...DEFAULT_PREFERENCES,
          remotePreference: 'prefer_remote',
          clearancePolicy: 'skip',
        },
      }),
      url: 'https://example.com/job/1',
      pageText: 'Sample posting',
    });
    expect(user).toContain('PREFERENCES');
    expect(user).toContain('prefer_remote');
    expect(user).toContain('Never-claim skills: Cobol');
    expect(user).toContain('"clearancePolicy": "skip"');
  });

  it('empty profile hints and system empty-list semantics', () => {
    const blankUser = buildAnalysisUser({
      profile: DEFAULT_CONFIG,
      url: 'https://example.com/job/blank',
      pageText: 'Onsite engineer in Austin',
    });
    expect(blankUser).toContain('Held skills: (none)');
    expect(blankUser).toContain('Onsite/hybrid locations: (none)');
    expect(blankUser).toContain('PROFILE_EMPTY_HINTS');
    expect(blankUser).toContain('no residency filter');
    expect(ANALYSIS_SYSTEM).toContain('Empty-list semantics');
    expect(ANALYSIS_SYSTEM).toContain('NO residency filter');
    expect(ANALYSIS_SYSTEM).toContain('remoteOnly');
  });

  it('ANALYSIS_SYSTEM requires hard evidence for Poor / Apply no', () => {
    expect(ANALYSIS_SYSTEM).toMatch(/Poor|hard/i);
    expect(ANALYSIS_SYSTEM.toLowerCase()).toMatch(/dealbreaker|hard/);
  });

  it('preflight hard gates and user builder', () => {
    const gates = buildPreflightHardGates(
      makeConfig({
        locations: [{ zip: '78758', radiusMiles: 25 }],
        workEligibleRegions: ['CO', 'WA'],
        preferences: { ...DEFAULT_PREFERENCES, blockedEmployers: ['Evil'] },
      })
    );
    const gatesJson = JSON.stringify(gates);
    expect(gatesJson).toMatch(/78758|blocked|Evil/i);
    expect(gatesJson).toContain('CO, WA');
    expect(gatesJson).toMatch(/Your remote residency is limited to CO, WA/);
    const user = buildPreflightUser({
      hardGatesJson: '{}',
      url: 'https://example.com',
      pageText: 'JD text',
      localHintJson: '{"verdict":"clear"}',
    });
    expect(user).toContain('JD text');
    expect(PREFLIGHT_SYSTEM.length).toBeGreaterThan(20);
  });

  it('system prompts avoid personal metro/employer teaching anchors', () => {
    expect(PREFLIGHT_SYSTEM).not.toMatch(/Ferndale|Madison|TX,\s*PA/);
    expect(ANALYSIS_SYSTEM).not.toMatch(/Docker\/K8s/);
    expect(PREFLIGHT_SYSTEM).toMatch(/City, ST · Remote/);
    expect(PREFLIGHT_SYSTEM).toMatch(/STATE_A/);
    expect(PREFLIGHT_SYSTEM).toMatch(/Remote-US/);
    expect(PREFLIGHT_SYSTEM).toMatch(/INCLUDES every US state/);
  });
});
