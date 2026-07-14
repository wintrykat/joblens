import type {
  Config,
  OccasionalTravelAllowance,
  PreflightResult,
  PreflightVerdict,
} from '../types/domain';
import { computeDeterministicGeo } from './geo';
import { findBlockedEmployerHit } from './ratings';

/** Bound Haiku input size (adjustable). Prefer head of JD for location/title/apply gates. */
export const PREFLIGHT_TEXT_CAP = 10_000;

const ONSITE_RE =
  /\b(?:on[\s-]?site|in[\s-]?office|in[\s-]?person|must\s+relocate|relocation\s+required)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const REMOTE_RE =
  /\b(?:fully\s+remote|100%\s+remote|remote[\s-]?first|work\s+from\s+home|\bwfh\b|remote\s+ok|remote\s+position|primarily\s+remote)\b/i;

/** Detected onsite travel cadence (most frequent signal wins). */
export type OnsiteTravelCadence =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'unknown';

/** Higher = more frequent onsite expectation. */
const CADENCE_RANK: Record<Exclude<OnsiteTravelCadence, 'unknown'>, number> = {
  daily: 5,
  weekly: 4,
  monthly: 3,
  quarterly: 2,
  yearly: 1,
};

const ALLOWANCE_RANK: Record<Exclude<OccasionalTravelAllowance, 'none'>, number> = {
  weekly: 4,
  monthly: 3,
  quarterly: 2,
  yearly: 1,
};

/**
 * Infer how often the posting requires onsite presence.
 * When several signals appear, returns the most frequent (strictest).
 */
export function detectOnsiteTravelCadence(pageText: string): OnsiteTravelCadence {
  const t = pageText;
  let worst: OnsiteTravelCadence = 'unknown';
  const bump = (c: Exclude<OnsiteTravelCadence, 'unknown'>): void => {
    if (worst === 'unknown' || CADENCE_RANK[c] > CADENCE_RANK[worst as Exclude<OnsiteTravelCadence, 'unknown'>]) {
      worst = c;
    }
  };

  if (
    /\bdaily\b/i.test(t) ||
    /\b\d+\s*[-–to]+\s*\d*\s*days?\s+(?:a|per)\s+week\b/i.test(t) ||
    /\b(?:3|4|5)\s*days?\s+(?:a|per)\s+week\b/i.test(t) ||
    /\bdays?\s+per\s+week\b/i.test(t) ||
    /\bin[\s-]?office\s+(?:most|every)\s+day/i.test(t)
  ) {
    bump('daily');
  }
  if (
    /\bweekly\b/i.test(t) ||
    /\bonce\s+(?:a|per)\s+week\b/i.test(t) ||
    /\bevery\s+week\b/i.test(t) ||
    /\b\d+\s*times?\s+(?:a|per)\s+week\b/i.test(t)
  ) {
    bump('weekly');
  }
  if (
    /\bmonthly\b/i.test(t) ||
    /\bonce\s+(?:a|per)\s+month\b/i.test(t) ||
    /\bevery\s+month\b/i.test(t) ||
    /\b\d+\s*times?\s+(?:a|per)\s+month\b/i.test(t)
  ) {
    bump('monthly');
  }
  if (
    /\bquarterly\b/i.test(t) ||
    /\bonce\s+(?:a|per)\s+quarter\b/i.test(t) ||
    /\bevery\s+quarter\b/i.test(t)
  ) {
    bump('quarterly');
  }
  const timesPerYear = t.match(/\b(\d+)\s*times?\s+(?:a|per)\s+year\b/i);
  if (timesPerYear?.[1]) {
    const n = Number(timesPerYear[1]);
    if (n <= 1) bump('yearly');
    else if (n <= 4) bump('quarterly');
    else if (n <= 12) bump('monthly');
    else bump('weekly');
  }
  if (
    /\b(?:annually|yearly|once\s+(?:a|per)\s+year|once\s+annually)\b/i.test(t) ||
    /\b1\s*times?\s+(?:a|per)\s+year\b/i.test(t)
  ) {
    bump('yearly');
  }
  if (worst === 'unknown' && /\boccasional(?:ly)?\b/i.test(t) && ONSITE_RE.test(t)) {
    bump('yearly');
  }
  return worst;
}

/**
 * True when outside-radius hybrid/light travel should Soft-warn instead of Hard skip.
 */
export function allowsOccasionalTravelOutsideRadius(
  allowance: OccasionalTravelAllowance | undefined,
  cadence: OnsiteTravelCadence
): boolean {
  if (!allowance || allowance === 'none') return false;
  if (cadence === 'unknown') return true;
  if (cadence === 'daily') return false;
  return CADENCE_RANK[cadence] <= ALLOWANCE_RANK[allowance];
}

export function truncateForPreflight(pageText: string, cap = PREFLIGHT_TEXT_CAP): string {
  const t = pageText.trim();
  if (t.length <= cap) return t;
  const head = Math.floor(cap * 0.7);
  const tail = cap - head - 20;
  return `${t.slice(0, head)}\n…\n${t.slice(-Math.max(0, tail))}`;
}

export function inferWorkModelHint(pageText: string): 'onsite' | 'hybrid' | 'remote' | 'unclear' {
  const hasRemote = REMOTE_RE.test(pageText);
  const hasHybrid = HYBRID_RE.test(pageText);
  const hasOnsite = ONSITE_RE.test(pageText);
  if (hasHybrid) return 'hybrid';
  if (hasOnsite && !hasRemote) return 'onsite';
  if (hasRemote && !hasOnsite) return 'remote';
  if (hasOnsite && hasRemote) return 'hybrid';
  return 'unclear';
}

function extractOrgCandidates(pageText: string, title: string, docTitle?: string): string[] {
  const out: string[] = [];
  if (docTitle) out.push(docTitle);
  if (title) out.push(title);
  // Early header region often carries company name
  out.push(pageText.slice(0, 1200));
  return out;
}

function findBlockedInHaystacks(
  haystacks: readonly string[],
  blocked: readonly string[]
): string | null {
  for (const hay of haystacks) {
    const hit = findBlockedEmployerHit(hay, blocked);
    if (hit) return hit;
  }
  // Also match blocked name as substring of early page text (broader than org-field match)
  const early = haystacks.join('\n').toLowerCase();
  for (const raw of blocked) {
    const needle = raw.trim().toLowerCase();
    if (needle.length >= 2 && early.includes(needle)) return raw.trim();
  }
  return null;
}

export function needsSemanticPreflight(cfg: Config): boolean {
  const p = cfg.preferences;
  if (p.blockedEmployers.some((e) => e.trim().length >= 2)) return true;
  if (p.clearancePolicy !== 'ignore') return true;
  if (Object.values(p.roleSkipCategories).some(Boolean)) return true;
  if (p.flagShellEmployers) return true;
  if (p.flagPermNotices || cfg.flagPermNotices) return true;
  if (p.remoteOnly) return true;
  return false;
}

function emptyResult(
  verdict: PreflightVerdict,
  reasons: string[],
  extra?: Partial<PreflightResult>
): PreflightResult {
  return {
    verdict,
    reasons,
    sources: ['local'],
    flags: [],
    ...extra,
  };
}

/**
 * Free local hard-gate preflight. Biased toward false negatives (unknown over hard_skip)
 * when work model or location is ambiguous.
 */
export function runLocalPreflight(args: {
  cfg: Config;
  pageText: string;
  pageTitle?: string;
}): PreflightResult {
  const { cfg, pageText, pageTitle = '' } = args;
  const reasons: string[] = [];
  const workModelHint = inferWorkModelHint(pageText);
  const blockedHit = findBlockedInHaystacks(
    extractOrgCandidates(pageText, pageTitle, pageTitle),
    cfg.preferences.blockedEmployers
  );

  if (blockedHit) {
    return emptyResult('hard_skip', [`Blocked employer match: ${blockedHit}`], {
      workModelHint,
      orgHint: blockedHit,
      flags: ['blocked_employer'],
    });
  }

  if (cfg.preferences.remoteOnly && (workModelHint === 'onsite' || workModelHint === 'hybrid')) {
    return emptyResult(
      'hard_skip',
      [`remoteOnly: posting looks ${workModelHint}`],
      { workModelHint, flags: ['remote_only'] }
    );
  }

  const geo = computeDeterministicGeo({
    locations: cfg.locations,
    pageText,
  });

  if (geo?.verdict === 'excluded') {
    if (workModelHint === 'onsite' || workModelHint === 'hybrid') {
      const cadence = detectOnsiteTravelCadence(pageText);
      const allowance = cfg.preferences.occasionalTravelAllowance;
      if (allowsOccasionalTravelOutsideRadius(allowance, cadence)) {
        const cadenceLabel = cadence === 'unknown' ? 'unspecified light travel' : cadence;
        return emptyResult(
          'soft',
          [
            `Travel outside radius (${cadenceLabel}) allowed by your setting (up to ${allowance}): ${geo.reason}`,
          ],
          {
            workModelHint,
            geoNote: geo.reason,
            flags: ['geo_excluded_travel_allowed'],
          }
        );
      }
      return emptyResult('hard_skip', [geo.reason], {
        workModelHint,
        geoNote: geo.reason,
        flags: ['geo_excluded'],
      });
    }
    if (workModelHint === 'remote') {
      // Commute exclude does not apply to clear remote roles
      reasons.push(`Geo distance noted but remote: ${geo.reason}`);
    } else {
      // Ambiguous work model — soft signal only
      return emptyResult('soft', [`Possible geo miss (work model unclear): ${geo.reason}`], {
        workModelHint,
        geoNote: geo.reason,
        flags: ['geo_excluded_unclear_model'],
      });
    }
  }

  if (geo?.verdict === 'eligible' && (workModelHint === 'onsite' || workModelHint === 'hybrid')) {
    reasons.push(geo.reason);
  }

  if (!needsSemanticPreflight(cfg) && workModelHint !== 'unclear') {
    return emptyResult(reasons.length ? 'clear' : 'clear', reasons.length ? reasons : ['No local hard gates hit'], {
      workModelHint,
    });
  }

  if (reasons.length) {
    return emptyResult('soft', reasons, { workModelHint });
  }

  return emptyResult('unknown', [], { workModelHint });
}

const VERDICT_RANK: Record<PreflightVerdict, number> = {
  clear: 0,
  unknown: 1,
  soft: 2,
  hard_skip: 3,
};

/** Merge local + Haiku results. Local hard_skip is sticky. */
export function mergePreflightResults(
  local: PreflightResult,
  haiku: PreflightResult | null
): PreflightResult {
  if (!haiku) return local;
  if (local.verdict === 'hard_skip') {
    return {
      ...local,
      sources: Array.from(new Set([...local.sources, ...haiku.sources])),
      reasons: [...local.reasons, ...haiku.reasons.filter((r) => !local.reasons.includes(r))],
      flags: Array.from(new Set([...local.flags, ...haiku.flags])),
      workModelHint: local.workModelHint || haiku.workModelHint,
      orgHint: local.orgHint || haiku.orgHint,
      geoNote: local.geoNote || haiku.geoNote,
    };
  }

  const verdict =
    VERDICT_RANK[haiku.verdict] >= VERDICT_RANK[local.verdict] ? haiku.verdict : local.verdict;

  return {
    verdict,
    reasons: [...local.reasons, ...haiku.reasons.filter((r) => !local.reasons.includes(r))],
    sources: Array.from(new Set([...local.sources, ...haiku.sources])),
    workModelHint: haiku.workModelHint || local.workModelHint,
    orgHint: haiku.orgHint || local.orgHint,
    geoNote: haiku.geoNote || local.geoNote,
    flags: Array.from(new Set([...local.flags, ...haiku.flags])),
  };
}

/** True when auto mode should skip the Haiku call. */
export function shouldSkipHaiku(local: PreflightResult, cfg: Config): boolean {
  if (local.verdict === 'hard_skip') return true;
  if (local.verdict === 'clear' && !needsSemanticPreflight(cfg)) return true;
  return false;
}

/** Cheap stable signature for cache validation (not cryptographic). */
export function pageTextSignature(pageText: string, cap = 800): string {
  const s = pageText.replace(/\s+/g, ' ').trim().slice(0, cap);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Extract Zip/Indeed-style listing key from the SERP URL when present. */
export function listingKeyFromHref(href: string): string {
  try {
    const u = new URL(href);
    return u.searchParams.get('lk') || u.searchParams.get('jk') || '';
  } catch {
    return '';
  }
}

/**
 * Cache key for preflight. Prefer listing keys (lk/jk) so SPA card flips
 * do not collide on a sticky canonical /c/.../Job URL from JSON-LD.
 */
export function preflightCacheKey(args: {
  href: string;
  canonicalUrl: string;
}): string {
  const listingKey = listingKeyFromHref(args.href);
  if (listingKey) return `lk:${listingKey}`;
  return `u:${args.canonicalUrl || args.href}`;
}

/** Fingerprint of the visible listing (used to detect SPA card changes). */
export function listingFingerprint(args: {
  href: string;
  canonicalUrl: string;
  paneTitle: string;
  pageText: string;
}): string {
  const key = preflightCacheKey(args);
  const title = args.paneTitle.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
  return `${key}|${title}|${pageTextSignature(args.pageText)}`;
}

/** Remote with no worker-residency restriction (nationwide / no state residency). */
export function looksUnrestrictedRemoteResidency(pageText: string): boolean {
  const t = pageText;
  const unrestricted =
    /\bnationwide\b/i.test(t) ||
    /\bno\s+[A-Z]{2}\s+residency\s+required\b/i.test(t) ||
    /\bno\s+[A-Za-z]+\s+residency\s+required\b/i.test(t) ||
    /\bopen\s+to\s+(?:all\s+)?(?:nationwide|US|U\.S\.|united\s+states)\b/i.test(t) ||
    /\bopen\s+to\s+nationwide\s+candidates\b/i.test(t) ||
    /\bany\s+(?:US|U\.S\.)\s+(?:state|location)\b/i.test(t) ||
    /\bwork\s+from\s+anywhere\b/i.test(t);
  if (!unrestricted) return false;
  // Prefer remote signal, but LinkedIn often shows "City · Remote" without "fully remote"
  const remoteish =
    /\bremote\b/i.test(t) ||
    REMOTE_RE.test(t) ||
    /\bwork\s+from\s+home\b/i.test(t);
  return remoteish;
}

function looksResidencyHardSkip(result: PreflightResult): boolean {
  if (result.flags.some((f) => /residency|region/i.test(f))) return true;
  return result.reasons.some((r) =>
    /workEligibleRegions|residency|eligible regions|regions? limited/i.test(r)
  );
}

/**
 * Demote bogus Haiku residency hard_skips when the JD is clearly nationwide remote.
 * Does not touch local hard_skips (blocked employer, commute onsite, remoteOnly).
 */
export function sanitizeHaikuResidencySkip(
  result: PreflightResult,
  pageText: string
): PreflightResult {
  if (result.verdict !== 'hard_skip') return result;
  if (!result.sources.includes('haiku')) return result;
  // Pure local hard_skip — leave alone
  if (result.sources.length === 1 && result.sources[0] === 'local') return result;
  if (!looksResidencyHardSkip(result)) return result;
  if (!looksUnrestrictedRemoteResidency(pageText)) return result;

  return {
    ...result,
    verdict: 'clear',
    reasons: [
      'Remote / nationwide — employer city is not a residency limit',
      ...result.reasons.map(humanizePreflightReason),
    ].slice(0, 3),
    flags: result.flags.filter((f) => !/residency|region/i.test(f)),
  };
}

/** Make preflight reasons readable in the launcher badge. */
export function humanizePreflightReason(reason: string): string {
  return reason
    .replace(/\bworkEligibleRegions\b/g, 'your remote residency regions')
    .replace(/\bcandidateRemoteResidency\b/g, 'your remote residency regions')
    .replace(/\bremoteOnly\b/g, 'remote-only preference')
    .replace(/\bblockedEmployers\b/g, 'blocked employers')
    .replace(/\bflagPermNotices\b/g, 'PERM notices')
    .replace(/\bflagShellEmployers\b/g, 'shell employers');
}

export function humanizePreflightReasons(reasons: readonly string[]): string[] {
  return reasons.map(humanizePreflightReason);
}

