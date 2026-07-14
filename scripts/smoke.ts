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
import { computeDeterministicGeo } from '../src/lib/geo';
import { applyRatingFloors, ONSITE_COMMUTE_DEALBREAKER } from '../src/lib/ratings';
import { EMPTY_ANALYSIS } from '../src/types/domain';

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
assert(manifest.version === '1.0.1', 'manifest version');
assert(manifest.side_panel?.default_path === 'sidepanel.html', 'side_panel path');
assert(manifest.permissions?.includes('sidePanel'), 'sidePanel permission');
assert(!manifest.action?.default_popup, 'no default_popup');

const cases: Array<[string, string, boolean]> = [
  ['builtin', 'https://www.builtin.com/job/foo/123', true],
  ['builtin', 'https://www.builtin.com/jobs', false],
  ['ziprecruiter', 'https://www.ziprecruiter.com/jobs/acme-clerk-abc', true],
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

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
