import type { Board, BoardId } from '../types/domain';

const TEXT_CAP = 24_000;

/** Default: largest of main / article / body, capped. */
export function defaultExtractPageText(doc: Document = document): string {
  const candidates = [
    doc.querySelector('[role="main"]'),
    doc.querySelector('main'),
    doc.querySelector('article'),
    doc.body,
  ].filter((el): el is Element => el != null);

  let best = '';
  for (const el of candidates) {
    const t = ((el as HTMLElement).innerText || '').trim();
    if (t.length > best.length) best = t;
  }
  return best.slice(0, TEXT_CAP);
}

function extractBySelectors(doc: Document, selectors: readonly string[]): string {
  let best = '';
  for (const sel of selectors) {
    for (const el of doc.querySelectorAll(sel)) {
      const t = ((el as HTMLElement).innerText || '').trim();
      if (t.length > best.length) best = t;
    }
  }
  if (best.length < 200) return defaultExtractPageText(doc);
  return best.slice(0, TEXT_CAP);
}

export const BOARDS: readonly Board[] = [
  {
    id: 'builtin',
    name: 'Built In',
    matchPatterns: ['*://*.builtin.com/*'],
    isPostingUrl: (url) => /builtin\.com\/(?:[^/]+\/)?job\//i.test(url),
  },
  {
    id: 'ziprecruiter',
    name: 'ZipRecruiter',
    matchPatterns: ['*://*.ziprecruiter.com/*'],
    isPostingUrl: (url) =>
      /ziprecruiter\.com\/(?:job\/|jobs\/[^/?#]+|c\/job)/i.test(url),
  },
  {
    id: 'indeed',
    name: 'Indeed',
    matchPatterns: ['*://*.indeed.com/*'],
    isPostingUrl: (url) =>
      /indeed\.com\/(?:viewjob|rc\/clk|pagead\/clk)/i.test(url) ||
      /[?&]jk=/i.test(url) ||
      /indeed\.com\/jobs?\/view/i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '#jobDescriptionText',
        '.jobsearch-JobComponent-description',
        '[data-testid="jobsearch-JobComponent-description"]',
        '.jobsearch-jobDescriptionText',
      ]),
    notes: 'SPA; description often in #jobDescriptionText. Login walls may hide JD.',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Jobs',
    matchPatterns: ['*://*.linkedin.com/*'],
    isPostingUrl: (url) => /linkedin\.com\/jobs\/(?:view|collections)\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '.jobs-description',
        '.jobs-description__content',
        '.jobs-box__html-content',
        '#job-details',
        '.job-details-module',
      ]),
    notes: 'Requires being logged in for full JD; collections/view both treated as postings.',
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    matchPatterns: [
      '*://*.greenhouse.io/*',
      '*://boards.greenhouse.io/*',
      '*://job-boards.greenhouse.io/*',
    ],
    isPostingUrl: (url) => /greenhouse\.io\/.+\/jobs\/\d+/i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '#content',
        '#app',
        '.job__description',
        '[data-qa="job-description"]',
      ]),
  },
  {
    id: 'lever',
    name: 'Lever',
    matchPatterns: ['*://jobs.lever.co/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        if (u.hostname !== 'jobs.lever.co') return false;
        const parts = u.pathname.split('/').filter(Boolean);
        return parts.length >= 2 && parts[1] !== 'apply';
      } catch {
        return false;
      }
    },
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '.posting',
        '.content',
        '[data-qa="job-description"]',
        '.section-wrapper',
      ]),
  },
  {
    id: 'ashby',
    name: 'Ashby',
    matchPatterns: ['*://jobs.ashbyhq.com/*', '*://*.ashbyhq.com/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        if (!/ashbyhq\.com$/i.test(u.hostname)) return false;
        const parts = u.pathname.split('/').filter(Boolean);
        return parts.length >= 2;
      } catch {
        return false;
      }
    },
    extractPageText: (doc = document) =>
      extractBySelectors(doc, ['[class*="job-description"]', 'main', '#root']),
  },
  {
    id: 'workday',
    name: 'Workday',
    matchPatterns: [
      '*://*.myworkdayjobs.com/*',
      '*://*.myworkdaysite.com/*',
    ],
    isPostingUrl: (url) => /\/job\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-automation-id="jobPostingDescription"]',
        '[data-automation-id="job-posting-details"]',
        '[data-automation-id="jobPostingHeader"]',
        'main',
      ]),
    notes: 'Tenant subdomains (company.wdN.myworkdayjobs.com); SPA description nodes vary.',
  },
  {
    id: 'dice',
    name: 'Dice',
    matchPatterns: ['*://*.dice.com/*'],
    isPostingUrl: (url) => /dice\.com\/job-detail\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-testid="jobDescriptionHtml"]',
        '#jobDescription',
        'article',
        'main',
      ]),
  },
  {
    id: 'remotive',
    name: 'Remotive',
    matchPatterns: ['*://*.remotive.com/*', '*://*.remotive.io/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // /remote-jobs/{category}/{slug} — not bare /remote-jobs or category index
        return (
          parts[0] === 'remote-jobs' &&
          parts.length >= 3 &&
          !['search', ''].includes(parts[1] ?? '')
        );
      } catch {
        return false;
      }
    },
  },
  {
    id: 'weworkremotely',
    name: 'We Work Remotely',
    matchPatterns: ['*://*.weworkremotely.com/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // /remote-jobs/{slug} but not /remote-jobs or /remote-jobs/search
        return (
          parts[0] === 'remote-jobs' &&
          parts.length >= 2 &&
          parts[1] !== 'search'
        );
      } catch {
        return false;
      }
    },
  },
  {
    id: 'monster',
    name: 'Monster',
    matchPatterns: ['*://*.monster.com/*'],
    isPostingUrl: (url) =>
      /monster\.com\/job-openings\//i.test(url) ||
      /monster\.com\/(?:job-openning|jobid)\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-testid="svx-description-container"]',
        '#JobDescription',
        '.job-description',
        'article',
        'main',
      ]),
  },
  {
    id: 'himalayas',
    name: 'Himalayas',
    matchPatterns: ['*://*.himalayas.app/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // /companies/{co}/jobs/{slug} or /jobs/{slug} (not /jobs alone / filters)
        if (parts[0] === 'companies' && parts[2] === 'jobs' && parts.length >= 4) {
          return true;
        }
        return parts[0] === 'jobs' && parts.length >= 2 && !['seniorities', 'locations', 'benefits'].includes(parts[1] ?? '');
      } catch {
        return false;
      }
    },
  },
  {
    id: 'workintexas',
    name: 'WorkInTexas',
    matchPatterns: ['*://*.workintexas.com/*', '*://wit.twc.state.tx.us/*'],
    isPostingUrl: (url) =>
      /(?:joborder|displayjob|jobdetails|jobdetail)/i.test(url) ||
      /[?&](?:jo|jobid|job_id|joborderid)=/i.test(url),
    notes: 'ASP.NET portal; posting URLs vary by session — open a job detail, not the home search.',
  },
  {
    id: 'wellfound',
    name: 'Wellfound',
    matchPatterns: ['*://*.wellfound.com/*', '*://*.angel.co/*'],
    isPostingUrl: (url) =>
      /wellfound\.com\/(?:jobs|role)\//i.test(url) ||
      /angel\.co\/(?:jobs|company\/.+\/jobs)\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, ['[class*="styles_description"]', 'article', 'main']),
  },
  {
    id: 'capps',
    name: 'CAPPS',
    matchPatterns: [
      '*://capps.taleo.net/*',
      '*://*.capps.taleo.net/*',
      '*://erphcmprd.cpa.texas.gov/*',
    ],
    isPostingUrl: (url) =>
      /jobdetail\.ftl/i.test(url) ||
      /\/job\//i.test(url) ||
      /HRS_CG_SEARCH_FL|HRS_JOB_DTL|JobOpeningId=/i.test(url),
    notes: 'Texas CAPPS Recruit (legacy Taleo + PeopleSoft Candidate Gateway).',
  },
  {
    id: 'roberthalf',
    name: 'Robert Half',
    matchPatterns: ['*://*.roberthalf.com/*'],
    isPostingUrl: (url) => /roberthalf\.com\/(?:[^/]+\/)*job\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-testid="job-description"]',
        '.job-description',
        'article',
        'main',
      ]),
  },
  {
    id: 'cybercoders',
    name: 'CyberCoders',
    matchPatterns: ['*://*.cybercoders.com/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // Detail pages are /{slug-with-id}/ — exclude /jobs, /job-seekers, etc.
        if (parts.length !== 1) return false;
        const slug = parts[0] ?? '';
        return (
          !['jobs', 'job-seekers', 'employers', 'about', 'blog', 'login', 'signup'].includes(
            slug.toLowerCase()
          ) && /-\d{4,}\/?$|\d{5,}/.test(slug)
        );
      } catch {
        return false;
      }
    },
  },
  {
    id: 'usps',
    name: 'USPS',
    matchPatterns: ['*://jobs.usps.com/*', '*://*.usps.com/careers/*'],
    isPostingUrl: (url) =>
      /jobs\.usps\.com\/(?:job|jobs|job-details|announcement)/i.test(url) ||
      /[?&]JobId=/i.test(url),
  },
  {
    id: 'apple',
    name: 'Apple',
    matchPatterns: ['*://jobs.apple.com/*'],
    isPostingUrl: (url) => /jobs\.apple\.com\/[^?#]*\/details\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '#jobdetails',
        '.jd__row',
        '[class*="job-details"]',
        'main',
      ]),
  },
  {
    id: 'google',
    name: 'Google',
    matchPatterns: [
      '*://www.google.com/about/careers/*',
      '*://careers.google.com/*',
    ],
    isPostingUrl: (url) =>
      /\/jobs\/results\/\d+/i.test(url) || /[?&]job_id=\d+/i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[class*="job-description"]',
        '[data-id="job-description"]',
        'article',
        'main',
      ]),
  },
  {
    id: 'meta',
    name: 'Meta',
    matchPatterns: ['*://*.metacareers.com/*', '*://*.facebookcareers.com/*'],
    isPostingUrl: (url) => /\/jobs\/\d+/i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[class*="jobDescription"]',
        '[data-testid="job-description"]',
        'main',
      ]),
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    matchPatterns: [
      '*://careers.microsoft.com/*',
      '*://jobs.careers.microsoft.com/*',
      '*://apply.careers.microsoft.com/*',
    ],
    isPostingUrl: (url) => /\/job\/\d+/i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-automation-id="job-detail-description"]',
        '.job-description',
        'article',
        'main',
      ]),
  },
  {
    id: 'hackernews',
    name: 'Hacker News',
    matchPatterns: [
      '*://news.ycombinator.com/*',
      '*://*.ycombinator.com/jobs*',
      '*://*.ycombinator.com/companies/*',
    ],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        if (/news\.ycombinator\.com$/i.test(u.hostname)) {
          return u.pathname === '/item' && u.searchParams.has('id');
        }
        return (
          /ycombinator\.com\/companies\/[^/]+\/jobs\/[^/?#]+/i.test(url) ||
          /ycombinator\.com\/jobs\/[^/?#]+/i.test(url)
        );
      } catch {
        return false;
      }
    },
    notes: "Scan Who's Hiring item threads or YC Jobs company role pages.",
  },
] as const satisfies readonly Board[];

/** Flat list for the Chrome manifest content_scripts.matches */
export const MATCH_PATTERNS: string[] = [
  ...new Set(BOARDS.flatMap((b) => [...b.matchPatterns])),
];

export function boardDisplayNames(): string {
  return BOARDS.map((b) => b.name).join(', ');
}

export function getBoardById(id: BoardId): Board | undefined {
  return BOARDS.find((b) => b.id === id);
}

export function resolveBoard(
  href: string = typeof location !== 'undefined' ? location.href : '',
  hostname: string = typeof location !== 'undefined' ? location.hostname : ''
): Board | null {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  for (const board of BOARDS) {
    const hit = board.matchPatterns.some((p) => {
      const m = p.match(/^\*:\/\/([^/]+)(?:\/.*)?$/);
      if (!m?.[1]) return false;
      let patHost = m[1];
      if (patHost.startsWith('*.')) patHost = patHost.slice(2);
      patHost = patHost.replace(/^www\./, '').toLowerCase();
      return host === patHost || host.endsWith(`.${patHost}`);
    });
    if (hit) return board;
  }
  for (const board of BOARDS) {
    if (board.isPostingUrl?.(href)) return board;
  }
  return null;
}

export function shouldShowLauncher(
  board: Board | null | undefined,
  href: string = typeof location !== 'undefined' ? location.href : ''
): boolean {
  if (!board) return false;
  if (!board.isPostingUrl) return true;
  return board.isPostingUrl(href);
}

export function extractPageTextForBoard(
  board: Board | null | undefined,
  doc: Document = document
): string {
  const fn = board?.extractPageText ?? defaultExtractPageText;
  return fn(doc);
}
