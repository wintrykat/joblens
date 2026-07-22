import { describe, expect, it } from 'vitest';
import {
  BOARDS,
  MATCH_PATTERNS,
  boardDisplayNames,
  getBoardById,
  resolveBoard,
  shouldShowLauncher,
} from './boards';

const postingCases: Array<[string, string, boolean]> = [
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
  [
    'indeed',
    'https://www.indeed.com/jobs?q=engineer&l=Austin%2C+TX&vjk=d75084593b7d8230',
    true,
  ],
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
    'remoteok',
    'https://remoteok.com/remote-jobs/remote-senior-full-stack-engineer-aguru-uk-1104983',
    true,
  ],
  ['remoteok', 'https://remoteok.com/remote-jobs', false],
  [
    'weworkremotely',
    'https://weworkremotely.com/remote-jobs/acme-senior-engineer',
    true,
  ],
  [
    'weworkremotely',
    'https://weworkremotely.com/remote-programming-jobs/acme/senior-engineer',
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

describe('boards', () => {
  it('registers 25 boards and unique ids', () => {
    expect(BOARDS).toHaveLength(25);
    const ids = BOARDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes match patterns for every board', () => {
    expect(MATCH_PATTERNS.length).toBeGreaterThan(0);
    for (const b of BOARDS) {
      for (const p of b.matchPatterns) {
        expect(MATCH_PATTERNS).toContain(p);
      }
    }
  });

  it.each(postingCases)('%s launcher for %s → %s', (id, url, expectPosting) => {
    const b = BOARDS.find((x) => x.id === id);
    expect(b).toBeDefined();
    expect(shouldShowLauncher(b, url)).toBe(expectPosting);
  });

  it('resolveBoard finds indeed/workday/google/remoteok', () => {
    expect(resolveBoard('https://www.indeed.com/viewjob?jk=x', 'www.indeed.com')?.id).toBe(
      'indeed'
    );
    expect(
      resolveBoard(
        'https://www.indeed.com/jobs?q=x&vjk=abc123',
        'www.indeed.com'
      )?.id
    ).toBe('indeed');
    expect(
      resolveBoard(
        'https://acme.wd5.myworkdayjobs.com/en-US/External/job/x',
        'acme.wd5.myworkdayjobs.com'
      )?.id
    ).toBe('workday');
    expect(
      resolveBoard(
        'https://www.google.com/about/careers/applications/jobs/results/1',
        'www.google.com'
      )?.id
    ).toBe('google');
    expect(
      resolveBoard(
        'https://remoteok.com/remote-jobs/remote-python-engineer-acme-1131500',
        'remoteok.com'
      )?.id
    ).toBe('remoteok');
  });

  it('lists Remote OK among display names', () => {
    expect(boardDisplayNames()).toContain('Remote OK');
    expect(getBoardById('remoteok')?.name).toBe('Remote OK');
  });
});
