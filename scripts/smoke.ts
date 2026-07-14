#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  BOARDS,
  MATCH_PATTERNS,
  resolveBoard,
  shouldShowLauncher,
  boardDisplayNames,
} from '../src/lib/boards';
import { analysisToJson } from '../src/lib/jsonExport';
import { computeDeterministicGeo, applyDeterministicGeo, NO_LOCATIONS_GEO_REASON } from '../src/lib/geo';
import { applyRatingFloors, BLOCKED_EMPLOYER_DEALBREAKER, ONSITE_COMMUTE_DEALBREAKER, REMOTE_ONLY_DEALBREAKER } from '../src/lib/ratings';
import { buildAnalysisUser, ANALYSIS_SYSTEM } from '../src/lib/prompts';
import {
  DEFAULT_CONFIG,
  assessProfileCompleteness,
  effectiveSkipTriggers,
  hasGeoIntent,
} from '../src/lib/storage';
import {
  allowsOccasionalTravelOutsideRadius,
  detectOnsiteTravelCadence,
  humanizePreflightReason,
  listingKeyFromHref,
  looksUnrestrictedRemoteResidency,
  mergePreflightResults,
  preflightCacheKey,
  runLocalPreflight,
  sanitizeHaikuResidencySkip,
} from '../src/lib/preflight';
import { parsePreflightPayload } from '../src/types/messages';
import {
  applyConfigProposalChanges,
  assertImportableFile,
  parseConfigProposal,
  sanitizeConfigForPropose,
  CONFIG_PROPOSAL_PATHS,
} from '../src/lib/docImport';
import {
  ConfigSchema,
  DEFAULT_PREFERENCES,
  DEFAULT_ROLE_SKIP_CATEGORIES,
  EMPTY_ANALYSIS,
} from '../src/types/domain';

const manifest = JSON.parse(
  readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8')
) as {
  version: string;
  content_scripts: Array<{ matches: string[] }>;
  side_panel?: { default_path?: string };
  permissions?: string[];
  action?: { default_popup?: string };
};

let fails = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    fails++;
  } else {
    console.log('ok', msg);
  }
}

assert(BOARDS.length === 24, `boards ${BOARDS.length}`);
const matches = manifest.content_scripts[0]?.matches ?? [];
for (const p of MATCH_PATTERNS) {
  assert(matches.includes(p), `manifest has ${p}`);
}
assert(manifest.version === '1.3.0', 'manifest version');
assert(manifest.side_panel?.default_path === 'sidepanel.html', 'side_panel path');
assert(manifest.permissions?.includes('sidePanel'), 'sidePanel permission');
assert(!manifest.action?.default_popup, 'no default_popup');

const cases: Array<[string, string, boolean]> = [
  ['builtin', 'https://www.builtin.com/job/foo/123', true],
  ['builtin', 'https://www.builtin.com/jobs', false],
  ['ziprecruiter', 'https://www.ziprecruiter.com/jobs/acme-clerk-abc', true],
  [
    'ziprecruiter',
    'https://www.ziprecruiter.com/c/Acme/Job/Full-Stack-Lead/-in-Austin,TX/-j0abc123',
    true,
  ],
  [
    'ziprecruiter',
    'https://www.ziprecruiter.com/jobs-search?search=engineer&location=Austin%2C+TX&lk=abc123',
    true,
  ],
  ['ziprecruiter', 'https://www.ziprecruiter.com/jobs-search?q=x', false],
  ['indeed', 'https://www.indeed.com/viewjob?jk=abc', true],
  ['indeed', 'https://www.indeed.com/jobs?q=engineer', false],
  ['linkedin', 'https://www.linkedin.com/jobs/view/123', true],
  ['linkedin', 'https://www.linkedin.com/feed/', false],
  ['greenhouse', 'https://boards.greenhouse.io/acme/jobs/12345', true],
  ['greenhouse', 'https://boards.greenhouse.io/acme', false],
  ['lever', 'https://jobs.lever.co/acme/abcd-efgh', true],
  ['lever', 'https://jobs.lever.co/acme', false],
  ['ashby', 'https://jobs.ashbyhq.com/acme/role-uuid', true],
  ['ashby', 'https://jobs.ashbyhq.com/acme', false],
  [
    'workday',
    'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Austin/Engineer_JR123',
    true,
  ],
  ['workday', 'https://acme.wd5.myworkdayjobs.com/en-US/External', false],
  ['dice', 'https://www.dice.com/job-detail/0dbac690-adc5-4e5d-bbaa-013ae7bb5899', true],
  ['dice', 'https://www.dice.com/jobs?q=python', false],
  [
    'remotive',
    'https://remotive.com/remote-jobs/software-dev/senior-engineer-123',
    true,
  ],
  ['remotive', 'https://remotive.com/remote-jobs', false],
  [
    'weworkremotely',
    'https://weworkremotely.com/remote-jobs/acme-senior-engineer',
    true,
  ],
  ['weworkremotely', 'https://weworkremotely.com/remote-jobs', false],
  [
    'monster',
    'https://www.monster.com/job-openings/software-engineer-austin-tx--123',
    true,
  ],
  ['monster', 'https://www.monster.com/jobs/search?q=engineer', false],
  ['himalayas', 'https://himalayas.app/companies/acme/jobs/senior-engineer', true],
  ['himalayas', 'https://himalayas.app/jobs', false],
  [
    'workintexas',
    'https://www.workintexas.com/vosnet/jobbanks/jobdetails.aspx?enc=abc',
    true,
  ],
  ['workintexas', 'https://www.workintexas.com/', false],
  ['wellfound', 'https://wellfound.com/jobs/12345-senior-engineer', true],
  ['wellfound', 'https://wellfound.com/jobs', false],
  [
    'capps',
    'https://capps.taleo.net/careersection/ex/jobdetail.ftl?job=12345',
    true,
  ],
  [
    'capps',
    'https://capps.taleo.net/careersection/ex/jobsearch.ftl?lang=en',
    false,
  ],
  [
    'roberthalf',
    'https://www.roberthalf.com/us/en/job/austin/software-engineer/12345',
    true,
  ],
  ['roberthalf', 'https://www.roberthalf.com/us/en/jobs', false],
  [
    'cybercoders',
    'https://www.cybercoders.com/software-engineer-123456/',
    true,
  ],
  ['cybercoders', 'https://www.cybercoders.com/jobs/', false],
  ['usps', 'https://jobs.usps.com/jobs/description?jobId=12345', true],
  ['usps', 'https://jobs.usps.com/', false],
  [
    'apple',
    'https://jobs.apple.com/en-us/details/200671983/software-engineer',
    true,
  ],
  ['apple', 'https://jobs.apple.com/en-us/search?location=united-states-USA', false],
  [
    'google',
    'https://www.google.com/about/careers/applications/jobs/results/123456789012345678',
    true,
  ],
  [
    'google',
    'https://www.google.com/about/careers/applications/jobs/results/',
    false,
  ],
  ['meta', 'https://www.metacareers.com/jobs/123456789012345/', true],
  ['meta', 'https://www.metacareers.com/jobs', false],
  [
    'microsoft',
    'https://jobs.careers.microsoft.com/global/en/job/1789123/software-engineer',
    true,
  ],
  ['microsoft', 'https://careers.microsoft.com/v2/global/en/search', false],
  ['hackernews', 'https://news.ycombinator.com/item?id=12345678', true],
  ['hackernews', 'https://news.ycombinator.com/news', false],
  [
    'hackernews',
    'https://www.ycombinator.com/companies/acme/jobs/senior-engineer',
    true,
  ],
];

for (const [id, url, expect] of cases) {
  const b = BOARDS.find((x) => x.id === id);
  assert(shouldShowLauncher(b, url) === expect, `${id} ${expect ? 'posting' : 'list'}`);
}

assert(
  resolveBoard('https://www.indeed.com/viewjob?jk=x', 'www.indeed.com')?.id === 'indeed',
  'resolve'
);
assert(
  resolveBoard(
    'https://acme.wd5.myworkdayjobs.com/en-US/External/job/x',
    'acme.wd5.myworkdayjobs.com'
  )?.id === 'workday',
  'resolve workday'
);
assert(
  resolveBoard(
    'https://www.google.com/about/careers/applications/jobs/results/1',
    'www.google.com'
  )?.id === 'google',
  'resolve google'
);

const geo = computeDeterministicGeo({
  locations: [{ zip: '78758', radiusMiles: 25 }],
  pageText: 'Austin TX 78701',
});
assert(geo?.verdict === 'eligible' && geo.method === 'zip-haversine', `geo near ${geo?.distanceMiles}`);

const nycGeo = computeDeterministicGeo({
  locations: [
    { zip: '78758', radiusMiles: 25 },
    { zip: '19152', radiusMiles: 30 },
  ],
  pageText: 'LiveFlow\nNew York, NY · On-site\nSome noise ZIP 78758',
  statedLocation: 'Senior Full Stack Engineer — LiveFlow — New York, NY (On-site, Full-time)',
});
assert(
  nycGeo?.verdict === 'excluded' && (nycGeo.distanceMiles ?? 0) > 30,
  `geo nyc excluded ${nycGeo?.distanceMiles}`
);

assert(analysisToJson(EMPTY_ANALYSIS, {}).schema === 'joblens.triage/v1', 'json schema');
assert(boardDisplayNames().includes('Ashby'), 'names');

{
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
  assert(floored.apply.verdict === 'no', 'rating floor apply no');
  assert(floored.fit.score <= 60, `rating floor fit ${floored.fit.score}`);
  assert(
    floored.dealbreakers[0]?.requirement === ONSITE_COMMUTE_DEALBREAKER,
    'dealbreaker title inverted'
  );
  assert(analysisToJson(floored, {}).fit.score <= 60, 'json fit floor');
}

{
  const blocked = applyRatingFloors(
    {
      ...EMPTY_ANALYSIS,
      masthead: { ...EMPTY_ANALYSIS.masthead, organization: 'Acme Staffing LLC' },
      fit: { label: 'Good fit', score: 85, rationale: 'ok' },
      apply: { verdict: 'yes', rationale: 'ok' },
    },
    {
      ...DEFAULT_CONFIG,
      preferences: {
        ...DEFAULT_PREFERENCES,
        blockedEmployers: ['Acme Staffing'],
      },
    }
  );
  assert(blocked.apply.verdict === 'no', 'blocked employer apply no');
  assert(
    blocked.dealbreakers.some((d) => d.requirement === BLOCKED_EMPLOYER_DEALBREAKER),
    'blocked employer dealbreaker'
  );
}

{
  const user = buildAnalysisUser({
    profile: {
      ...DEFAULT_CONFIG,
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
    },
    url: 'https://example.com/job/1',
    pageText: 'Sample posting',
  });
  assert(user.includes('PREFERENCES'), 'analysis user has PREFERENCES');
  assert(user.includes('prefer_remote'), 'analysis user remote pref');
  assert(user.includes('Never-claim skills: Cobol'), 'analysis user never-claim');
  assert(user.includes('"clearancePolicy": "skip"'), 'analysis user clearance');
}

{
  const triggers = effectiveSkipTriggers({
    ...DEFAULT_CONFIG,
    preferences: {
      ...DEFAULT_PREFERENCES,
      flagPermNotices: true,
      flagShellEmployers: true,
      roleSkipCategories: {
        ...DEFAULT_ROLE_SKIP_CATEGORIES,
        ml_training: true,
      },
    },
  });
  assert(triggers.some((t) => /PERM/i.test(t)), 'perm skip injected');
  assert(triggers.some((t) => /shell|unverifiable/i.test(t)), 'shell skip injected');
  assert(triggers.some((t) => /training ML|LLM models/i.test(t)), 'category skip injected');
  assert(
    !effectiveSkipTriggers(DEFAULT_CONFIG).some((t) => /training ML|LLM models/i.test(t)),
    'category skips off by default'
  );
}

{
  assert(!hasGeoIntent(DEFAULT_CONFIG), 'DEFAULT_CONFIG has no geo intent');
  const blank = assessProfileCompleteness(DEFAULT_CONFIG);
  assert(blank.incomplete, 'DEFAULT_CONFIG geo incomplete');
  assert(/Geography required/i.test(blank.message), 'blank message is geo-required');
  assert(!/skills/i.test(blank.geoRequiredMessage), 'geo message does not mix skills');

  assert(
    hasGeoIntent({
      ...DEFAULT_CONFIG,
      preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
    }),
    'remoteOnly alone is geo intent'
  );
  assert(
    hasGeoIntent({
      ...DEFAULT_CONFIG,
      locations: [{ zip: '78758', radiusMiles: 25 }],
    }),
    'ZIP alone is geo intent'
  );
  assert(
    hasGeoIntent({
      ...DEFAULT_CONFIG,
      workEligibleRegions: ['TX'],
    }),
    'regions alone is geo intent'
  );

  const withGeoNoSkills = assessProfileCompleteness({
    ...DEFAULT_CONFIG,
    preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
  });
  assert(!withGeoNoSkills.incomplete, 'remoteOnly unlocks geo');
  assert(/held skills/i.test(withGeoNoSkills.skillsWarning), 'skills soft warning');

  const blankUser = buildAnalysisUser({
    profile: DEFAULT_CONFIG,
    url: 'https://example.com/job/blank',
    pageText: 'Onsite engineer in Austin',
  });
  assert(blankUser.includes('Held skills: (none)'), 'blank user held none');
  assert(blankUser.includes('Onsite/hybrid locations: (none)'), 'blank user locs none');
  assert(blankUser.includes('PROFILE_EMPTY_HINTS'), 'blank user empty hints');
  assert(blankUser.includes('no residency filter'), 'blank regions semantics in user');
  assert(ANALYSIS_SYSTEM.includes('Empty-list semantics'), 'system empty-list semantics');
  assert(ANALYSIS_SYSTEM.includes('NO residency filter'), 'system regions empty semantics');
  assert(ANALYSIS_SYSTEM.includes('remoteOnly'), 'system remoteOnly rule');

  const noLocGeo = applyDeterministicGeo(
    {
      ...EMPTY_ANALYSIS,
      masthead: { ...EMPTY_ANALYSIS.masthead, workModel: 'onsite' },
      geo: { verdict: 'eligible', reason: 'model invented', method: 'model' },
    },
    { locations: [], pageText: 'Austin, TX onsite' }
  );
  assert(noLocGeo.geo?.verdict === 'unclear', 'empty locations onsite → unclear');
  assert(noLocGeo.geo?.reason === NO_LOCATIONS_GEO_REASON, 'empty locations reason');
  assert(
    !noLocGeo.dealbreakers.some((d) => /commute radius/i.test(d.requirement)),
    'empty locations does not add commute dealbreaker'
  );

  const remoteOnlyFloored = applyRatingFloors(
    {
      ...EMPTY_ANALYSIS,
      masthead: { ...EMPTY_ANALYSIS.masthead, workModel: 'onsite' },
      fit: { label: 'Excellent fit', score: 95, rationale: 'skills ok' },
      apply: { verdict: 'yes', rationale: 'ok' },
    },
    {
      ...DEFAULT_CONFIG,
      preferences: { ...DEFAULT_PREFERENCES, remoteOnly: true },
    }
  );
  assert(remoteOnlyFloored.apply.verdict === 'no', 'remoteOnly onsite apply no');
  assert(
    remoteOnlyFloored.dealbreakers.some((d) => d.requirement === REMOTE_ONLY_DEALBREAKER),
    'remoteOnly dealbreaker'
  );
  assert(remoteOnlyFloored.fit.score <= 60, 'remoteOnly fit capped');
}

{
  let docRejected = false;
  try {
    assertImportableFile('resume.doc');
  } catch {
    docRejected = true;
  }
  assert(docRejected, '.doc rejected');
  assert(assertImportableFile('notes.md') === '.md', '.md allowed');
  assert(assertImportableFile('cv.pdf') === '.pdf', '.pdf allowed');

  const sanitized = sanitizeConfigForPropose({
    ...DEFAULT_CONFIG,
    apiKey: 'sk-secret',
  });
  assert(!('apiKey' in sanitized), 'sanitized omits apiKey');

  const proposal = parseConfigProposal({
    summary: 'From resume',
    changes: [
      {
        id: '1',
        path: 'skillClaims',
        label: 'Add TypeScript',
        rationale: 'Listed on resume',
        value: [{ skill: 'TypeScript', standing: 'held', years: 4 }],
      },
      {
        id: '2',
        path: 'apiKey',
        label: 'steal key',
        rationale: 'bad',
        value: 'nope',
      },
      {
        id: '3',
        path: 'preferences.remoteOnly',
        label: 'Remote only',
        rationale: 'Notes say remote only',
        value: true,
      },
    ],
  });
  assert(proposal.changes.length === 2, 'invalid paths filtered');
  assert(
    proposal.changes.every((c) => (CONFIG_PROPOSAL_PATHS as readonly string[]).includes(c.path)),
    'only allowlisted paths'
  );

  const merged = applyConfigProposalChanges(DEFAULT_CONFIG, [
    {
      id: '1',
      path: 'skillClaims',
      label: 'Add TypeScript',
      rationale: '',
      value: [{ skill: 'TypeScript', standing: 'held', years: 4 }],
    },
    {
      id: '3',
      path: 'preferences.remoteOnly',
      label: 'Remote only',
      rationale: '',
      value: true,
    },
    {
      id: '4',
      path: 'locations',
      label: 'ZIP',
      rationale: '',
      value: [{ zip: '78758', radiusMiles: 25 }],
    },
  ]);
  assert(merged.skillClaims.some((c) => c.skill === 'TypeScript'), 'merge skillClaims');
  assert(merged.preferences.remoteOnly === true, 'merge remoteOnly');
  assert(merged.locations.some((l) => l.zip === '78758'), 'merge locations');
  assert(merged.apiKey === '', 'apiKey untouched');
}

{
  assert(DEFAULT_CONFIG.preflightMode === 'auto', 'preflightMode default auto');
  assert(ConfigSchema.parse({ model: 'claude-sonnet-5' }).preflightMode === 'auto', 'schema preflight default');
  assert(
    ConfigSchema.parse({ model: 'claude-sonnet-5', preflightMode: 'hybrid' }).preflightMode ===
      'hybrid',
    'schema preflight hybrid'
  );

  const geoOnsite = runLocalPreflight({
    cfg: {
      ...DEFAULT_CONFIG,
      locations: [{ zip: '78758', radiusMiles: 25 }],
    },
    pageText:
      'Acme Corp — Software Engineer\nLocation: New York, NY 10001\nWork model: On-site in office daily.\nJob description: '.padEnd(
        500,
        'x'
      ),
    pageTitle: 'Software Engineer - Acme',
  });
  assert(geoOnsite.verdict === 'hard_skip', 'local geo onsite excluded → hard_skip');
  assert(geoOnsite.sources.includes('local'), 'local source');

  const blocked = runLocalPreflight({
    cfg: {
      ...DEFAULT_CONFIG,
      preferences: { ...DEFAULT_PREFERENCES, blockedEmployers: ['EvilCorp'] },
      locations: [{ zip: '78758', radiusMiles: 25 }],
    },
    pageText: 'EvilCorp hiring Full Stack Lead\nFully remote\nJob description: build APIs '.padEnd(
      500,
      'y'
    ),
    pageTitle: 'Full Stack - EvilCorp',
  });
  assert(blocked.verdict === 'hard_skip', 'blocked employer → hard_skip');

  const remoteFar = runLocalPreflight({
    cfg: {
      ...DEFAULT_CONFIG,
      locations: [{ zip: '78758', radiusMiles: 25 }],
    },
    pageText:
      'Acme — Engineer\nLocation: New York, NY 10001\nFully remote / work from home\nJob description: '.padEnd(
        500,
        'z'
      ),
  });
  assert(remoteFar.verdict !== 'hard_skip', 'remote JD + far ZIP → not hard_skip from geo alone');

  const mergedPf = mergePreflightResults(
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
  assert(mergedPf.verdict === 'hard_skip', 'merge keeps local hard_skip');

  const haikuSoft = parsePreflightPayload({
    verdict: 'soft',
    reasons: ['clearance language'],
    workModel: 'hybrid',
    organization: 'Acme',
    flags: ['clearance'],
  });
  assert(haikuSoft.verdict === 'soft' && haikuSoft.workModelHint === 'hybrid', 'parse preflight payload');

  const nationwideText =
    'SmartPlace — Full Stack .NET Developer\nMadison, WI · Remote\nNOTE: No WI residency required. Open to nationwide candidates. This position is currently remote.';
  assert(looksUnrestrictedRemoteResidency(nationwideText), 'nationwide remote detected');

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
    nationwideText
  );
  assert(badResidencySkip.verdict === 'clear', 'demote nationwide residency false hard_skip');
  assert(
    !/workEligibleRegions/.test(humanizePreflightReason(badResidencySkip.reasons[1] || '')),
    'humanize drops camelCase field name'
  );
  assert(
    /your remote residency regions/.test(
      humanizePreflightReason(
        'Position located in Madison, WI; workEligibleRegions limited to TX and PA only'
      )
    ),
    'humanize workEligibleRegions'
  );

  assert(
    listingKeyFromHref(
      'https://www.ziprecruiter.com/jobs-search?search=x&lk=abc123'
    ) === 'abc123',
    'listingKey lk'
  );
  assert(
    preflightCacheKey({
      href: 'https://www.ziprecruiter.com/jobs-search?lk=abc123',
      canonicalUrl: 'https://www.ziprecruiter.com/c/Acme/Job/Old',
    }) === 'lk:abc123',
    'cache prefers lk over sticky canonical'
  );
  assert(
    preflightCacheKey({
      href: 'https://www.ziprecruiter.com/jobs-search?lk=abc123',
      canonicalUrl: 'https://www.ziprecruiter.com/c/Acme/Job/A',
    }) !==
      preflightCacheKey({
        href: 'https://www.ziprecruiter.com/jobs-search?lk=xyz999',
        canonicalUrl: 'https://www.ziprecruiter.com/c/Acme/Job/A',
      }),
    'different lk → different cache keys'
  );

  assert(DEFAULT_PREFERENCES.occasionalTravelAllowance === 'none', 'travel allowance default none');

  const quarterlyRemote = `
    Sr. Full Stack Developer — Dallas, TX 75019 · Remote
    This is a direct-hire position working primarily remote, with occasional on-site presence required in Coppell / Dallas, TX.
    Enjoy the flexibility of a remote work model (Texas-based preferred; quarterly on-site meetings in DFW).
    Job description: build APIs and UIs.
  `.padEnd(500, ' ');

  assert(detectOnsiteTravelCadence(quarterlyRemote) === 'quarterly', 'detect quarterly travel');
  assert(
    allowsOccasionalTravelOutsideRadius('quarterly', 'quarterly'),
    'quarterly allowance accepts quarterly'
  );
  assert(
    !allowsOccasionalTravelOutsideRadius('quarterly', 'weekly'),
    'quarterly allowance rejects weekly'
  );
  assert(!allowsOccasionalTravelOutsideRadius('none', 'quarterly'), 'none rejects all travel');

  const travelSoft = runLocalPreflight({
    cfg: {
      ...DEFAULT_CONFIG,
      locations: [{ zip: '78758', radiusMiles: 25 }],
      preferences: {
        ...DEFAULT_PREFERENCES,
        occasionalTravelAllowance: 'quarterly',
      },
    },
    pageText: quarterlyRemote,
  });
  assert(travelSoft.verdict === 'soft', 'quarterly remote outside radius → soft when allowed');

  const travelHard = runLocalPreflight({
    cfg: {
      ...DEFAULT_CONFIG,
      locations: [{ zip: '78758', radiusMiles: 25 }],
      preferences: {
        ...DEFAULT_PREFERENCES,
        occasionalTravelAllowance: 'none',
      },
    },
    pageText: quarterlyRemote,
  });
  assert(travelHard.verdict === 'hard_skip', 'same JD hard_skip when allowance none');
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
