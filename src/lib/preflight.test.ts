import { describe, expect, it } from 'vitest';
import {
  allowsOccasionalTravelOutsideRadius,
  candidateClaimsUsCitizenship,
  detectClearanceLanguage,
  detectOnsiteTravelCadence,
  enforceClearancePolicy,
  evaluateRemoteResidency,
  findCountryAllowClause,
  humanizePreflightReason,
  inferWorkModelHint,
  listingIdentityFingerprint,
  listingKeyFromHref,
  looksUnrestrictedRemoteResidency,
  looksUsBasedWorkerRequirement,
  looksUsCountryRemoteScope,
  mergePreflightResults,
  postingRequiresUsCitizenship,
  preflightCacheKey,
  runLocalPreflight,
  sanitizeHaikuCitizenshipSkip,
  sanitizeHaikuResidencySkip,
  shouldSkipHaiku,
} from './preflight';
import { DEFAULT_CONFIG } from './storage';
import { DEFAULT_PREFERENCES } from '../types/domain';
import { makeConfig } from '../../tests/helpers/config';
import { parsePreflightPayload } from '../types/messages';
import { resolvePostingLocation } from './geo';
import {
  BOISE_REMOTE_EXCLUDE,
  BOSTON_CHICAGO_QUARTERLY,
  CLEARANCE_REQUIRED_JD,
  CLEARANCE_UI_NOISE_JD,
  CORMAC_US_CITIZEN,
  CUTSFORTH_REMOTE_EXCLUDE,
  DENVER_NATIONWIDE,
  DFW_QUARTERLY_REMOTE,
  ITBSTAR_US_BASED_DEV,
  MADISON_NATIONWIDE,
  TURING_US_CANADA_WEU,
  UST_REMOTE_US,
} from '../../tests/fixtures/postings';

describe('preflight', () => {
  it('defaults and parsePreflightPayload', () => {
    expect(DEFAULT_CONFIG.preflightMode).toBe('auto');
    const haikuSoft = parsePreflightPayload({
      verdict: 'soft',
      reasons: ['clearance language'],
      workModel: 'hybrid',
      organization: 'Acme',
      flags: ['clearance'],
    });
    expect(haikuSoft.verdict).toBe('soft');
    expect(haikuSoft.workModelHint).toBe('hybrid');
  });

  it('local geo onsite excluded → hard_skip', () => {
    const geoOnsite = runLocalPreflight({
      cfg: makeConfig({ locations: [{ zip: '78758', radiusMiles: 25 }] }),
      pageText:
        'Acme Corp — Software Engineer\nLocation: New York, NY 10001\nWork model: On-site in office daily.\nJob description: '.padEnd(
          500,
          'x'
        ),
      pageTitle: 'Software Engineer - Acme',
    });
    expect(geoOnsite.verdict).toBe('hard_skip');
    expect(geoOnsite.sources).toContain('local');
  });

  it('blocked employer → hard_skip', () => {
    const blocked = runLocalPreflight({
      cfg: makeConfig({
        preferences: { ...DEFAULT_PREFERENCES, blockedEmployers: ['EvilCorp'] },
        locations: [{ zip: '78758', radiusMiles: 25 }],
      }),
      pageText: 'EvilCorp hiring Full Stack Lead\nFully remote\nJob description: build APIs '.padEnd(
        500,
        'y'
      ),
      pageTitle: 'Full Stack - EvilCorp',
    });
    expect(blocked.verdict).toBe('hard_skip');
  });

  it('remote JD + far ZIP is not hard_skip from geo alone', () => {
    const remoteFar = runLocalPreflight({
      cfg: makeConfig({ locations: [{ zip: '78758', radiusMiles: 25 }] }),
      pageText:
        'Acme — Engineer\nLocation: New York, NY 10001\nFully remote / work from home\nJob description: '.padEnd(
          500,
          'z'
        ),
    });
    expect(remoteFar.verdict).not.toBe('hard_skip');
  });

  it('merge keeps local hard_skip over haiku clear', () => {
    const merged = mergePreflightResults(
      {
        verdict: 'hard_skip',
        reasons: ['local geo'],
        sources: ['local'],
        flags: ['geo_excluded'],
      },
      {
        verdict: 'clear',
        reasons: ['haiku clear'],
        sources: ['haiku'],
        flags: [],
      }
    );
    expect(merged.verdict).toBe('hard_skip');
  });

  it('nationwide remote residency heuristics and humanize', () => {
    expect(looksUnrestrictedRemoteResidency(MADISON_NATIONWIDE)).toBe(true);
    expect(looksUnrestrictedRemoteResidency(DENVER_NATIONWIDE)).toBe(true);

    const badResidencySkip = sanitizeHaikuResidencySkip(
      {
        verdict: 'hard_skip',
        reasons: [
          'Position located in Madison, WI; workEligibleRegions limited to TX and PA only',
        ],
        sources: ['haiku'],
        flags: ['residency_excluded'],
        workModelHint: 'remote',
      },
      MADISON_NATIONWIDE
    );
    expect(badResidencySkip.verdict).toBe('clear');
    expect(
      /your remote residency regions/.test(
        humanizePreflightReason(
          'Position located in Madison, WI; workEligibleRegions limited to TX and PA only'
        )
      )
    ).toBe(true);
  });

  it('Remote-US country scope includes TX/PA (UST-shape)', () => {
    expect(looksUsCountryRemoteScope(UST_REMOTE_US)).toBe(true);
    expect(looksUnrestrictedRemoteResidency(UST_REMOTE_US)).toBe(true);
    expect(evaluateRemoteResidency(UST_REMOTE_US, ['TX', 'PA']).verdict).toBe('clear');
    expect(evaluateRemoteResidency(UST_REMOTE_US, ['TX', 'PA']).reason).toMatch(/US/i);

    const local = runLocalPreflight({
      cfg: makeConfig({
        workEligibleRegions: ['TX', 'PA'],
        preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
      }),
      pageText: UST_REMOTE_US,
    });
    expect(local.verdict).not.toBe('hard_skip');
    expect(local.flags).toContain('residency_ok');

    const haikuFalseSkip = sanitizeHaikuResidencySkip(
      {
        verdict: 'hard_skip',
        reasons: [
          'Remote role explicitly restricted to US; candidate residency limited to TX, PA with no intersection',
          "Role location states 'Remote-US' without explicit permission for all US states",
        ],
        sources: ['haiku'],
        flags: ['residency_excluded'],
        workModelHint: 'remote',
      },
      UST_REMOTE_US,
      { workEligibleRegions: ['TX', 'PA'], local }
    );
    expect(haikuFalseSkip.verdict).toBe('clear');
    expect(haikuFalseSkip.flags).toContain('residency_ok');
  });

  it('US/Canada/WEU OR-list clears TX/PA (Turing-shape)', () => {
    const allow = findCountryAllowClause(TURING_US_CANADA_WEU);
    expect(allow?.countries).toEqual(expect.arrayContaining(['US', 'CA', 'WEU']));
    expect(looksUsCountryRemoteScope(TURING_US_CANADA_WEU)).toBe(true);
    expect(evaluateRemoteResidency(TURING_US_CANADA_WEU, ['TX', 'PA']).verdict).toBe('clear');

    const local = runLocalPreflight({
      cfg: makeConfig({
        workEligibleRegions: ['TX', 'PA'],
        preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
      }),
      pageText: TURING_US_CANADA_WEU,
    });
    expect(local.verdict).not.toBe('hard_skip');
    expect(local.flags).toContain('residency_ok');

    const contradicted = sanitizeHaikuResidencySkip(
      {
        verdict: 'hard_skip',
        reasons: [
          'Residency restricted to US, Canada, or WEU countries; candidate regions limited to TX, PA (both US states, which are allowed under US scope)',
        ],
        sources: ['haiku'],
        flags: ['residency_excluded'],
        workModelHint: 'remote',
      },
      TURING_US_CANADA_WEU,
      { workEligibleRegions: ['TX', 'PA'], local }
    );
    expect(contradicted.verdict).toBe('clear');
  });

  it('listing identity ignores page-text growth (scroll-stable)', () => {
    const base = {
      href: 'https://www.indeed.com/jobs?q=x&vjk=abc',
      canonicalUrl: 'https://www.indeed.com/viewjob?jk=abc',
      paneTitle: 'Software Engineer - Turing',
    };
    const a = listingIdentityFingerprint(base);
    const b = listingIdentityFingerprint(base);
    expect(a).toBe(b);
    expect(a.startsWith('lk:abc|')).toBe(true);
    expect(
      listingIdentityFingerprint({ ...base, paneTitle: 'Other Role - Acme' })
    ).not.toBe(a);
  });

  it('clearance skip policy stays hard_skip (not soft)', () => {
    const local = runLocalPreflight({
      cfg: makeConfig({
        preferences: { ...DEFAULT_PREFERENCES, clearancePolicy: 'skip' },
      }),
      pageText: CLEARANCE_REQUIRED_JD,
    });
    expect(local.verdict).toBe('hard_skip');
    expect(local.flags).toContain('clearance');

    const promoted = enforceClearancePolicy(
      {
        verdict: 'soft',
        reasons: ['Clearance language noted'],
        sources: ['haiku'],
        flags: ['clearance'],
      },
      makeConfig({
        preferences: { ...DEFAULT_PREFERENCES, clearancePolicy: 'skip' },
      }),
      CLEARANCE_REQUIRED_JD
    );
    expect(promoted.verdict).toBe('hard_skip');
  });

  it('U.S.-based developer is worker residency; no phantom clearance (IT-BSTAR)', () => {
    expect(looksUsBasedWorkerRequirement(ITBSTAR_US_BASED_DEV)).toBe(true);
    expect(looksUsCountryRemoteScope(ITBSTAR_US_BASED_DEV)).toBe(true);
    expect(detectClearanceLanguage(ITBSTAR_US_BASED_DEV).hit).toBe(false);
    expect(detectClearanceLanguage(CLEARANCE_UI_NOISE_JD).hit).toBe(false);

    const local = runLocalPreflight({
      cfg: makeConfig({
        workEligibleRegions: ['TX', 'PA'],
        preferences: {
          ...DEFAULT_PREFERENCES,
          remoteOnly: true,
          clearancePolicy: 'skip',
        },
      }),
      pageText: ITBSTAR_US_BASED_DEV,
    });
    expect(local.verdict).not.toBe('hard_skip');
    expect(local.flags).toContain('residency_ok');
    expect(local.flags).not.toContain('clearance');

    const haikuPhantom = enforceClearancePolicy(
      {
        verdict: 'hard_skip',
        reasons: [
          'Clearance required (clearance) — skip policy',
          "Remote role with no explicit residency restrictions; 'U.S.-based' refers to client base, not worker location limit",
        ],
        sources: ['haiku'],
        flags: ['clearance'],
        workModelHint: 'remote',
      },
      makeConfig({
        preferences: { ...DEFAULT_PREFERENCES, clearancePolicy: 'skip' },
      }),
      ITBSTAR_US_BASED_DEV
    );
    expect(haikuPhantom.verdict).not.toBe('hard_skip');
    expect(haikuPhantom.flags).not.toContain('clearance');

    const residency = evaluateRemoteResidency(ITBSTAR_US_BASED_DEV, ['TX', 'PA']);
    expect(residency.verdict).toBe('clear');
  });

  it('U.S. citizen requirement clears when work-auth note says US citizen', () => {
    expect(postingRequiresUsCitizenship(CORMAC_US_CITIZEN)).toBe(true);
    expect(candidateClaimsUsCitizenship('US citizen, no sponsorship needed')).toBe(true);
    expect(candidateClaimsUsCitizenship('')).toBe(false);

    const cleared = sanitizeHaikuCitizenshipSkip(
      {
        verdict: 'hard_skip',
        reasons: [
          'U.S. Citizen requirement is a residency/eligibility gate that may exclude candidate',
        ],
        sources: ['haiku'],
        flags: [],
      },
      CORMAC_US_CITIZEN,
      'US citizen, no sponsorship needed'
    );
    expect(cleared.verdict).toBe('clear');
    expect(cleared.flags).toContain('citizenship_ok');

    const hedged = sanitizeHaikuCitizenshipSkip(
      {
        verdict: 'hard_skip',
        reasons: [
          'U.S. Citizen requirement is a residency/eligibility gate that may exclude candidate',
        ],
        sources: ['haiku'],
        flags: [],
      },
      CORMAC_US_CITIZEN,
      ''
    );
    expect(hedged.verdict).toBe('soft');

    expect(
      humanizePreflightReason(
        'U.S. Citizen requirement is a residency/eligibility gate that may exclude candidate'
      )
    ).not.toMatch(/eligibility gate/i);
  });

  it('humanize strips field and flag names from reasons', () => {
    expect(humanizePreflightReason('workEligibleRegions limited to TX')).toMatch(
      /your remote residency regions/i
    );
    expect(humanizePreflightReason('remoteOnly: posting looks onsite')).toMatch(
      /remote-only preference/i
    );
    expect(humanizePreflightReason('flag: residency_excluded')).not.toMatch(/residency_excluded/);
    expect(humanizePreflightReason('clearancePolicy skip hit')).toMatch(/clearance policy/i);
  });

  it('listing keys and cache prefer lk/jk/vjk over sticky canonical', () => {
    expect(
      listingKeyFromHref('https://www.ziprecruiter.com/jobs-search?search=x&lk=abc123')
    ).toBe('abc123');
    expect(
      listingKeyFromHref(
        'https://www.indeed.com/jobs?q=engineer&vjk=d75084593b7d8230'
      )
    ).toBe('d75084593b7d8230');
    expect(
      listingKeyFromHref('https://www.indeed.com/viewjob?jk=feedkey99')
    ).toBe('feedkey99');
    expect(
      preflightCacheKey({
        href: 'https://www.ziprecruiter.com/jobs-search?lk=abc123',
        canonicalUrl: 'https://www.ziprecruiter.com/c/Acme/Job/Old',
      })
    ).toBe('lk:abc123');
    expect(
      preflightCacheKey({
        href: 'https://www.indeed.com/jobs?q=x&vjk=vjkAAA',
        canonicalUrl: 'https://www.indeed.com/viewjob?jk=other',
      })
    ).toBe('lk:vjkAAA');
    expect(
      preflightCacheKey({
        href: 'https://www.ziprecruiter.com/jobs-search?lk=abc123',
        canonicalUrl: 'https://www.ziprecruiter.com/c/Acme/Job/A',
      })
    ).not.toBe(
      preflightCacheKey({
        href: 'https://www.ziprecruiter.com/jobs-search?lk=xyz999',
        canonicalUrl: 'https://www.ziprecruiter.com/c/Acme/Job/A',
      })
    );
  });

  it('occasional travel allowance softens quarterly remote outside radius', () => {
    expect(DEFAULT_PREFERENCES.occasionalTravelAllowance).toBe('none');
    expect(detectOnsiteTravelCadence(DFW_QUARTERLY_REMOTE)).toBe('quarterly');
    expect(detectOnsiteTravelCadence(BOSTON_CHICAGO_QUARTERLY)).toBe('quarterly');
    expect(allowsOccasionalTravelOutsideRadius('quarterly', 'quarterly')).toBe(true);
    expect(allowsOccasionalTravelOutsideRadius('quarterly', 'weekly')).toBe(false);
    expect(allowsOccasionalTravelOutsideRadius('none', 'quarterly')).toBe(false);

    for (const pageText of [DFW_QUARTERLY_REMOTE, BOSTON_CHICAGO_QUARTERLY]) {
      const travelSoft = runLocalPreflight({
        cfg: makeConfig({
          locations: [{ zip: '78758', radiusMiles: 25 }],
          preferences: {
            ...DEFAULT_PREFERENCES,
            occasionalTravelAllowance: 'quarterly',
          },
        }),
        pageText,
      });
      expect(travelSoft.verdict).toBe('soft');

      const travelHard = runLocalPreflight({
        cfg: makeConfig({
          locations: [{ zip: '78758', radiusMiles: 25 }],
          preferences: {
            ...DEFAULT_PREFERENCES,
            occasionalTravelAllowance: 'none',
          },
        }),
        pageText,
      });
      expect(travelHard.verdict).toBe('hard_skip');
    }
  });

  it('Cutsforth + Boise twin: residency + short training travel path', () => {
    for (const [pageText, okRegions, badRegions, notSite] of [
      [CUTSFORTH_REMOTE_EXCLUDE, ['TX', 'PA'], ['NY', 'CA'], /new york/i],
      [BOISE_REMOTE_EXCLUDE, ['CO', 'WA'], ['AZ', 'NV'], /arizona|nevada|utah/i],
    ] as const) {
      const loc = resolvePostingLocation({ pageText });
      expect(loc?.kind).toBe('city');
      expect(loc?.label || '').not.toMatch(notSite);
      expect(inferWorkModelHint(pageText)).toBe('remote');
      expect(detectOnsiteTravelCadence(pageText)).toBe('yearly');

      expect(evaluateRemoteResidency(pageText, okRegions).verdict).toBe('clear');
      expect(evaluateRemoteResidency(pageText, badRegions).verdict).toBe('hard_skip');

      const local = runLocalPreflight({
        cfg: makeConfig({
          locations: [{ zip: '78758', radiusMiles: 25 }],
          workEligibleRegions: [...okRegions],
          preferences: {
            ...DEFAULT_PREFERENCES,
            occasionalTravelAllowance: 'quarterly',
          },
        }),
        pageText,
      });
      expect(local.verdict).not.toBe('hard_skip');
      expect(local.flags).toContain('residency_ok');

      const mergedHaikuBad = mergePreflightResults(local, {
        verdict: 'hard_skip',
        reasons: ['Haiku invents residency exclusion against permitted regions'],
        sources: ['haiku'],
        flags: ['residency_excluded'],
        workModelHint: 'remote',
      });
      const sanitized = sanitizeHaikuResidencySkip(mergedHaikuBad, pageText, {
        local,
        workEligibleRegions: [...okRegions],
      });
      expect(sanitized.verdict).not.toBe('hard_skip');
    }
  });

  it('shouldSkipHaiku respects hard_skip and semantic prefs', () => {
    const clear = {
      verdict: 'clear' as const,
      reasons: [],
      sources: ['local' as const],
      flags: [],
    };
    const hard = { ...clear, verdict: 'hard_skip' as const };
    expect(shouldSkipHaiku(hard, makeConfig())).toBe(true);
    // Defaults enable shell/PERM flags → semantic preflight still needed for clear.
    expect(
      shouldSkipHaiku(
        clear,
        makeConfig({
          preferences: {
            ...DEFAULT_PREFERENCES,
            flagPermNotices: false,
            flagShellEmployers: false,
          },
          flagPermNotices: false,
        })
      )
    ).toBe(true);
    expect(shouldSkipHaiku(clear, makeConfig())).toBe(false);
  });
});
