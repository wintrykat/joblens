import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  assessProfileCompleteness,
  effectiveSkipTriggers,
  getConfig,
  hasGeoIntent,
  hasHeldSkills,
  setConfig,
} from './storage';
import { DEFAULT_PREFERENCES, DEFAULT_ROLE_SKIP_CATEGORIES } from '../types/domain';
import { makeConfig } from '../../tests/helpers/config';
import { installChromeMock } from '../../tests/helpers/chromeMock';

describe('storage pure helpers', () => {
  it('injects perm/shell/category skip triggers', () => {
    const triggers = effectiveSkipTriggers(
      makeConfig({
        preferences: {
          ...DEFAULT_PREFERENCES,
          flagPermNotices: true,
          flagShellEmployers: true,
          roleSkipCategories: {
            ...DEFAULT_ROLE_SKIP_CATEGORIES,
            ml_training: true,
          },
        },
      })
    );
    expect(triggers.some((t) => /PERM/i.test(t))).toBe(true);
    expect(triggers.some((t) => /shell|unverifiable/i.test(t))).toBe(true);
    expect(triggers.some((t) => /training ML|LLM models/i.test(t))).toBe(true);
    expect(
      effectiveSkipTriggers(DEFAULT_CONFIG).some((t) => /training ML|LLM models/i.test(t))
    ).toBe(false);
  });

  it('hasGeoIntent and profile completeness', () => {
    expect(hasGeoIntent(DEFAULT_CONFIG)).toBe(false);
    const blank = assessProfileCompleteness(DEFAULT_CONFIG);
    expect(blank.incomplete).toBe(true);
    expect(blank.message).toMatch(/Geography required/i);
    expect(blank.geoRequiredMessage).not.toMatch(/skills/i);

    expect(
      hasGeoIntent(makeConfig({ preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true } }))
    ).toBe(true);
    expect(hasGeoIntent(makeConfig({ locations: [{ zip: '78758', radiusMiles: 25 }] }))).toBe(
      true
    );
    expect(hasGeoIntent(makeConfig({ workEligibleRegions: ['TX'] }))).toBe(true);

    const withGeoNoSkills = assessProfileCompleteness(
      makeConfig({ preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true } })
    );
    expect(withGeoNoSkills.incomplete).toBe(false);
    expect(withGeoNoSkills.skillsWarning).toMatch(/held skills/i);

    expect(hasHeldSkills(DEFAULT_CONFIG)).toBe(false);
    expect(
      hasHeldSkills(
        makeConfig({ skillClaims: [{ skill: 'TS', standing: 'held', years: 1 }] })
      )
    ).toBe(true);
  });
});

describe('storage chrome CRUD', () => {
  beforeEach(() => {
    installChromeMock();
  });

  it('getConfig returns defaults then setConfig round-trips', async () => {
    const first = await getConfig();
    expect(first.model).toBe(DEFAULT_CONFIG.model);
    expect(first.apiKey).toBe('');

    await setConfig(
      makeConfig({
        apiKey: 'sk-test',
        locations: [{ zip: '78758', radiusMiles: 25 }],
      })
    );
    const second = await getConfig();
    expect(second.apiKey).toBe('sk-test');
    expect(second.locations[0]?.zip).toBe('78758');
  });
});
