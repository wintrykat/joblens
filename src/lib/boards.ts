import type { Board, BoardId } from '../types/domain';

const TEXT_CAP = 24_000;

/** Prefer innerText; fall back to textContent (jsdom / some embeds lack innerText). */
function elementText(el: Element): string {
  const html = el as HTMLElement;
  return (html.innerText || el.textContent || '').trim();
}

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
    const t = elementText(el);
    if (t.length > best.length) best = t;
  }
  return best.slice(0, TEXT_CAP);
}

function extractBySelectors(doc: Document, selectors: readonly string[]): string {
  let best = '';
  for (const sel of selectors) {
    for (const el of doc.querySelectorAll(sel)) {
      const t = elementText(el);
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
    matchPatterns: ['*://builtin.com/*', '*://*.builtin.com/*'],
    isPostingUrl: (url) => /builtin\.com\/(?:[^/]+\/)?job\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[class*="JobDescription"]',
        '[data-id="job-description"]',
        'article',
        'main',
        '#content',
      ]),
  },
  {
    id: 'ziprecruiter',
    name: 'ZipRecruiter',
    matchPatterns: ['*://*.ziprecruiter.com/*'],
    isPostingUrl: (url) => {
      // Standalone posting pages
      if (/ziprecruiter\.com\/c\/[^/?#]+\/Job\//i.test(url)) return true;
      if (/ziprecruiter\.com\/job\//i.test(url)) return true;
      if (/ziprecruiter\.com\/jobs\/[^/?#]+/i.test(url) && !/\/jobs-search/i.test(url))
        return true;
      // Split-pane SERP with a selected listing (lk = listing key)
      try {
        const u = new URL(url);
        if (/\/jobs-search/i.test(u.pathname) && u.searchParams.has('lk')) return true;
      } catch {
        /* ignore */
      }
      return false;
    },
    isScannableJob: (doc) => zipDetailLooksLikeJob(doc),
    resolveJobUrl: (doc, url) => resolveZipJobUrl(doc, url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-testid="job-details-scroll-container"]',
        '[data-testid="right-pane"]',
      ]),
    notes: 'Split-pane /jobs-search uses detail pane + optional lk=; hooks reusable for similar boards.',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    matchPatterns: ['*://indeed.com/*', '*://*.indeed.com/*'],
    isPostingUrl: (url) => {
      if (/indeed\.com\/(?:viewjob|m\/viewjob|rc\/clk|pagead\/clk)/i.test(url)) return true;
      if (/indeed\.com\/jobs?\/view/i.test(url)) return true;
      try {
        const u = new URL(url);
        // Standalone: jk=. Split-pane SERP: vjk= highlights the open detail card.
        if (u.searchParams.has('jk') || u.searchParams.has('vjk')) return true;
      } catch {
        /* ignore */
      }
      return false;
    },
    isScannableJob: (doc) => indeedDetailLooksLikeJob(doc),
    resolveJobUrl: (doc, url) => resolveIndeedJobUrl(doc, url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '#jobDescriptionText',
        '.jobsearch-JobComponent-description',
        '[data-testid="jobsearch-JobComponent-description"]',
        '.jobsearch-jobDescriptionText',
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        '#jobsearch-ViewjobPaneWrapper',
        '.jobsearch-RightPane',
      ]),
    notes:
      'SPA: /viewjob?jk= or /jobs?…&vjk= split pane. Login walls may hide JD. Prefer vjk/jk for cache identity.',
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
    matchPatterns: ['*://dice.com/*', '*://*.dice.com/*'],
    isPostingUrl: (url) =>
      /dice\.com\/job-detail\//i.test(url) ||
      /dice\.com\/jobs\/detail\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-testid="jobDescriptionHtml"]',
        '#jobDescription',
        '[class*="job-description"]',
        'article',
        'main',
      ]),
  },
  {
    id: 'remotive',
    name: 'Remotive',
    matchPatterns: ['*://remotive.com/*', '*://*.remotive.com/*', '*://*.remotive.io/*'],
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
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '.job',
        '.content',
        'article',
        '[class*="job-description"]',
        'main',
      ]),
  },
  {
    id: 'remoteok',
    name: 'Remote OK',
    matchPatterns: ['*://remoteok.com/*', '*://*.remoteok.com/*', '*://remoteok.io/*', '*://*.remoteok.io/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // /remote-jobs/{slug-id} — not bare /remote-jobs, /remote-jobs/*, feeds, api
        if (parts[0] !== 'remote-jobs' || parts.length < 2) return false;
        const slug = parts[1] ?? '';
        return (
          slug.length > 0 &&
          !['search', 'api', ''].includes(slug.toLowerCase()) &&
          !slug.startsWith('?')
        );
      } catch {
        return false;
      }
    },
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '.description',
        '[class*="description"]',
        'article',
        '#job',
        'main',
      ]),
    notes: 'Detail URLs are /remote-jobs/{slug}-{id}; list is /remote-jobs.',
  },
  {
    id: 'weworkremotely',
    name: 'We Work Remotely',
    matchPatterns: ['*://weworkremotely.com/*', '*://*.weworkremotely.com/*'],
    isPostingUrl: (url) => {
      try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        // /remote-jobs/{slug} but not /remote-jobs or /remote-jobs/search
        // Also /remote-{category}-jobs/{company}/{slug}
        if (parts[0] === 'remote-jobs') {
          return parts.length >= 2 && parts[1] !== 'search';
        }
        return (
          /^remote-.+-jobs$/i.test(parts[0] ?? '') &&
          parts.length >= 3
        );
      } catch {
        return false;
      }
    },
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '.listing-container',
        '#job-listing-show-container',
        'article',
        'section.job',
        'main',
      ]),
  },
  {
    id: 'monster',
    name: 'Monster',
    matchPatterns: ['*://monster.com/*', '*://*.monster.com/*'],
    isPostingUrl: (url) =>
      /monster\.com\/job-openings\//i.test(url) ||
      /monster\.com\/(?:job-openning|jobid)\//i.test(url) ||
      /monster\.com\/job\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[data-testid="svx-description-container"]',
        '#JobDescription',
        '.job-description',
        '[class*="JobDescription"]',
        'article',
        'main',
      ]),
  },
  {
    id: 'himalayas',
    name: 'Himalayas',
    matchPatterns: ['*://himalayas.app/*', '*://*.himalayas.app/*'],
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
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[class*="job-description"]',
        '[class*="JobDescription"]',
        'article',
        'main',
      ]),
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
    matchPatterns: ['*://wellfound.com/*', '*://*.wellfound.com/*', '*://*.angel.co/*'],
    isPostingUrl: (url) =>
      /wellfound\.com\/(?:jobs|role)\//i.test(url) ||
      /angel\.co\/(?:jobs|company\/.+\/jobs)\//i.test(url),
    extractPageText: (doc = document) =>
      extractBySelectors(doc, [
        '[class*="styles_description"]',
        '[class*="job-description"]',
        'article',
        'main',
      ]),
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
  href: string = typeof location !== 'undefined' ? location.href : '',
  doc?: Document
): boolean {
  if (!board) return false;
  if (!board.isPostingUrl && !board.isScannableJob) return true;
  if (board.isPostingUrl?.(href)) return true;
  if (doc && board.isScannableJob?.(doc, href)) return true;
  return false;
}

const ZIP_STANDALONE_JOB_RE = /\/c\/[^/?#]+\/Job\//i;

function zipDetailPane(doc: Document): Element | null {
  return (
    doc.querySelector('[data-testid="job-details-scroll-container"]') ??
    doc.querySelector('[data-testid="right-pane"]')
  );
}

function zipDetailLooksLikeJob(doc: Document): boolean {
  const pane = zipDetailPane(doc);
  if (!pane) return false;
  const text = (pane.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 400) return false;
  const lower = text.toLowerCase();
  const hasDescription =
    /job description/i.test(text) ||
    Boolean(pane.querySelector('#job_description, .job_description, [data-testid*="description"]'));
  const hasApply =
    /\bapply\b/i.test(lower) ||
    Boolean(pane.querySelector('a[href*="apply"], button, [role="button"]'));
  return hasDescription || hasApply;
}

function indeedDetailPane(doc: Document): Element | null {
  return (
    doc.querySelector('#jobsearch-ViewjobPaneWrapper') ??
    doc.querySelector('.jobsearch-RightPane') ??
    doc.querySelector('[class*="JobComponent"]') ??
    doc.querySelector('#jobDescriptionText')?.closest('section, div') ??
    null
  );
}

function indeedDetailLooksLikeJob(doc: Document): boolean {
  const desc =
    doc.querySelector('#jobDescriptionText') ??
    doc.querySelector('.jobsearch-JobComponent-description') ??
    doc.querySelector('[data-testid="jobsearch-JobComponent-description"]');
  if (desc && elementText(desc).length >= 120) return true;
  const pane = indeedDetailPane(doc);
  if (!pane) return false;
  const text = elementText(pane).replace(/\s+/g, ' ');
  if (text.length < 300) return false;
  return /job description|responsibilities|qualifications|\bapply\b/i.test(text);
}

function resolveIndeedJobUrl(_doc: Document, url: string): string {
  try {
    const u = new URL(url);
    const key = u.searchParams.get('jk') || u.searchParams.get('vjk');
    if (key) {
      // Canonical standalone URL for bookmarks / cache even when on /jobs?vjk=
      return `https://${u.hostname}/viewjob?jk=${encodeURIComponent(key)}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

function ldJsonNodes(scriptText: string): unknown[] {
  try {
    const raw = JSON.parse(scriptText || 'null') as unknown;
    return Array.isArray(raw) ? raw : [raw];
  } catch {
    return [];
  }
}

function itemListEntries(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const typed = node as { '@type'?: string | string[]; itemListElement?: unknown[] };
  const types = Array.isArray(typed['@type'])
    ? typed['@type']
    : typed['@type']
      ? [typed['@type']]
      : [];
  if (!types.some((t) => String(t).toLowerCase() === 'itemlist')) return [];
  return typed.itemListElement ?? [];
}

function entryNameAndUrl(entry: unknown): { name: string; url: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const item = entry as {
    name?: string;
    url?: string;
    item?: { name?: string; url?: string };
  };
  const name = (item.name ?? item.item?.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const url = item.url ?? item.item?.url;
  if (!name || !url) return null;
  return { name, url };
}

function resolveZipJobUrlFromJsonLd(doc: Document, title: string): string | null {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    for (const node of ldJsonNodes(script.textContent || '')) {
      for (const entry of itemListEntries(node)) {
        const parsed = entryNameAndUrl(entry);
        if (parsed && parsed.name === title) return parsed.url;
      }
    }
  }
  return null;
}

function resolveZipJobUrl(doc: Document, fallbackUrl: string): string {
  const pane = zipDetailPane(doc);
  const title = (pane?.querySelector('h1, h2')?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (title) {
    const fromLd = resolveZipJobUrlFromJsonLd(doc, title);
    if (fromLd) return fromLd;
  }

  const scope = pane ?? doc;
  const near = scope.querySelector<HTMLAnchorElement>('a[href*="/c/"][href*="/Job/"]');
  if (near?.href && ZIP_STANDALONE_JOB_RE.test(near.href)) return near.href;

  const selected = doc.querySelector(
    '[aria-selected="true"] a[href*="/c/"][href*="/Job/"], [data-selected="true"] a[href*="/c/"][href*="/Job/"]'
  ) as HTMLAnchorElement | null;
  if (selected?.href && ZIP_STANDALONE_JOB_RE.test(selected.href)) return selected.href;

  return fallbackUrl;
}

export function extractPageTextForBoard(
  board: Board | null | undefined,
  doc: Document = document
): string {
  const fn = board?.extractPageText ?? defaultExtractPageText;
  return fn(doc);
}
