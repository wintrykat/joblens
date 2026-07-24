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
const REMOTE_STRONG_RE =
  /\b(?:fully\s+remote|100%\s+remote|remote[\s-]?first|work\s+from\s+home|\bwfh\b|remote\s+ok|remote\s+position|primarily\s+remote)\b/i;
/** Header / work-location remote ("City, ST · Remote", "Work Location: Remote but …"). */
const REMOTE_PRIMARY_RE =
  /(?:^|[·•|,]\s*|\bwork\s*location\s*:\s*|\blocation\s*:\s*)remote\b/i;
/** Short onsite training/onboarding — travel cadence, not hybrid primary. */
const SHORT_ONSITE_TRAINING_RE =
  /\b\d+\s*(?:weeks?|days?)\s+(?:of\s+)?(?:mandatory\s+)?(?:(?:training|onboarding|orientation)\s+)?on[\s-]?site\b|\bon[\s-]?site\s+(?:training|onboarding|orientation)\b|\b(?:mandatory|initial)\s+(?:training|onboarding|orientation)\s+on[\s-]?site\b|\b(?:initial\s+)?onboarding\s+on[\s-]?site\b|\borientation\s+on[\s-]?site\b/i;

export function hasShortOnsiteTraining(pageText: string): boolean {
  return SHORT_ONSITE_TRAINING_RE.test(pageText);
}

export function hasRemotePrimarySignal(pageText: string): boolean {
  return (
    REMOTE_STRONG_RE.test(pageText) ||
    REMOTE_PRIMARY_RE.test(pageText) ||
    /\bremote\s+but\b/i.test(pageText)
  );
}

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
    if (
      worst === 'unknown' ||
      CADENCE_RANK[c] > CADENCE_RANK[worst as Exclude<OnsiteTravelCadence, 'unknown'>]
    ) {
      worst = c;
    }
  };

  // One-shot / short training stays rare even if "onsite" appears.
  if (hasShortOnsiteTraining(t)) {
    bump('yearly');
  }

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
  const remotePrimary = hasRemotePrimarySignal(pageText);
  const hasHybrid = HYBRID_RE.test(pageText);
  const hasOnsite = ONSITE_RE.test(pageText);
  const shortTraining = hasShortOnsiteTraining(pageText);

  // Remote-primary + short onsite training → still remote (travel soft, not commute hybrid).
  if (remotePrimary && shortTraining && !hasHybrid) return 'remote';
  if (hasHybrid) return 'hybrid';
  if (hasOnsite && !remotePrimary) return 'onsite';
  if (remotePrimary && !hasOnsite) return 'remote';
  if (hasOnsite && remotePrimary) return 'hybrid';
  return 'unclear';
}

const US_STATE_ALIASES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

function normalizeRegionToken(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\./g, '');
  if (/^[a-z]{2}$/i.test(t)) return t.toUpperCase();
  return US_STATE_ALIASES[t] || t.toUpperCase();
}

const US_STATE_CODES = new Set(Object.values(US_STATE_ALIASES));

function isUsStateCode(code: string): boolean {
  return US_STATE_CODES.has(code.toUpperCase());
}

/** Country-level allow tokens used in multi-country residency lists. */
export type AllowedCountry = 'US' | 'CA' | 'UK' | 'WEU' | 'EU';

/**
 * Parse country allow-list chunks like "US, Canada or WEU countries (UK, …)".
 * Does not treat bare "CA" as Canada (that's California as a US state).
 */
export function extractAllowedCountries(chunk: string): AllowedCountry[] {
  const out: AllowedCountry[] = [];
  const seen = new Set<AllowedCountry>();
  const push = (c: AllowedCountry): void => {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };
  if (/\b(?:United\s+States|U\.?\s*S\.?\s*A?\.?)\b/i.test(chunk) || /\bUS\b/.test(chunk)) {
    push('US');
  }
  if (/\bCanada\b/i.test(chunk)) push('CA');
  if (/\b(?:United\s+Kingdom|U\.?\s*K\.?|Britain|England)\b/i.test(chunk) || /\bUK\b/.test(chunk)) {
    push('UK');
  }
  if (/\bWEU\b|\bWestern\s+Europe(?:an)?\b/i.test(chunk)) push('WEU');
  if (/\b(?:\bEU\b|European\s+Union)\b/i.test(chunk)) push('EU');
  return out;
}

/** True when any candidate region is covered by a country in the allow-list (OR semantics). */
export function regionsMatchCountryAllowList(
  regions: readonly string[],
  countries: readonly AllowedCountry[]
): boolean {
  if (!countries.length) return false;
  if (!regions.length) return false;
  const normalized = regions.map(normalizeRegionToken).filter(Boolean);
  if (countries.includes('US') && normalized.some((r) => isUsStateCode(r))) return true;
  // Future: map CA/UK regions if candidates store countries; US states are the common case.
  return false;
}

/**
 * Find an explicit multi-country / country residency allow clause on the page.
 * Examples: "based out of US, Canada or WEU", "must be located in the US or Canada".
 */
export function findCountryAllowClause(pageText: string): {
  clause: string;
  countries: AllowedCountry[];
} | null {
  const patterns = [
    /(?:candidates?\s+must\s+be\s+|must\s+be\s+|should\s+be\s+)?(?:based|located|reside)\s+(?:out\s+of|in)\s+([^.!\n]{8,200})/gi,
    /(?:location|residency|work\s+location)\s*:\s*((?:remote[\s\-–—]*)?(?:US|U\.S\.|United\s+States|Canada|WEU|UK)[^.!\n]{0,160})/gi,
  ];
  for (const re of patterns) {
    for (const m of pageText.matchAll(re)) {
      const clause = (m[1] || m[0] || '').trim();
      if (!clause) continue;
      const countries = extractAllowedCountries(clause);
      // Need at least one country token; prefer multi-country OR US-with-peers
      if (countries.length >= 1) {
        // Skip pure US-state include lists without country wording
        if (
          countries.length === 1 &&
          countries[0] === 'US' &&
          !/\b(?:US|U\.S\.|United\s+States|Canada|WEU|UK|country|countries)\b/i.test(clause)
        ) {
          continue;
        }
        return { clause, countries };
      }
    }
  }
  return null;
}

/**
 * Country-level US remote scope (not a state subset).
 * "Remote-US", "Role Location: Remote-US", "Remote (US)", "U.S.-based developer" —
 * candidate US states are in-scope.
 */
export function looksUsCountryRemoteScope(pageText: string): boolean {
  const t = pageText;
  if (/\brole\s+location\s*:\s*remote[\s\-–—]*U\.?S\.?A?\b/i.test(t)) return true;
  if (/\bremote[\s\-–—]*U\.?S\.?A?\b/i.test(t)) return true;
  if (/\bU\.?S\.?A?[\s\-–—]*remote\b/i.test(t)) return true;
  if (/\bremote\s*\(\s*U\.?S\.?A?\s*\)/i.test(t)) return true;
  if (looksUsBasedWorkerRequirement(t)) return true;
  if (/\b(?:must|should)\s+(?:reside|be\s+(?:based|located))\s+in\s+the\s+(?:US|U\.S\.|United\s+States)\b/i.test(t)) {
    // Country-only when the same clause doesn't name a US state
    const clause = t.match(
      /(?:must|should)\s+(?:reside|be\s+(?:based|located))\s+in\s+the\s+(?:US|U\.?S\.|United\s+States)[^.!\n]{0,80}/i
    )?.[0];
    if (clause && extractStateTokens(clause).length === 0) return true;
  }
  const allow = findCountryAllowClause(t);
  if (allow && allow.countries.includes('US') && allow.countries.length >= 1) {
    // Multi-country OR-list that includes US, or US-only country clause
    return true;
  }
  return false;
}

/**
 * "U.S.-based [role/candidate]" means the worker must live in the US.
 * "U.S.-based clients" alone does not.
 */
export function looksUsBasedWorkerRequirement(pageText: string): boolean {
  const t = pageText;
  // Strip client-only phrases so they don't confuse nearby worker matches
  const withoutClients = t.replace(
    /\bU\.?\s*S\.?-?\s*based\s+clients?\b/gi,
    ' '
  );
  if (
    /\b(?:looking\s+for|seeking|hiring|need(?:s|ed)?)\s+(?:an?\s+)?U\.?\s*S\.?-?\s*based\b/i.test(
      withoutClients
    )
  ) {
    return true;
  }
  if (
    /\bU\.?\s*S\.?-?\s*based\s+(?:\w+[\/-]?\s*){0,5}(?:developer|engineer|programmer|designer|analyst|architect|candidate|applicant|contractor|employee|worker|specialist|consultant)\b/i.test(
      withoutClients
    )
  ) {
    return true;
  }
  if (
    /\b(?:must|should)\s+be\s+U\.?\s*S\.?-?\s*based\b/i.test(withoutClients) ||
    /\bU\.?\s*S\.?-?\s*based\s+(?:candidates?|applicants?|only)\b/i.test(withoutClients)
  ) {
    return true;
  }
  return false;
}

function extractStateTokens(chunk: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Full state names (longest first)
  const names = Object.keys(US_STATE_ALIASES).sort((a, b) => b.length - a.length);
  let rest = chunk;
  for (const name of names) {
    const re = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(rest)) {
      const code = US_STATE_ALIASES[name];
      if (code && !seen.has(code)) {
        seen.add(code);
        out.push(code);
      }
      rest = rest.replace(re, ' ');
    }
  }
  for (const m of rest.matchAll(/\b([A-Z]{2})\b/g)) {
    const code = (m[1] || '').toUpperCase();
    if (Object.values(US_STATE_ALIASES).includes(code) && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

export type ResidencyEval = {
  verdict: 'clear' | 'hard_skip' | 'unknown';
  reason: string;
  mode: 'exclude' | 'include' | 'none';
  states: string[];
};

/**
 * Local remote-residency gate.
 *
 * Principle: parse include/exclude state sets from the JD; hard_skip only when
 * candidate regions are non-empty and their intersection with allowed residency
 * is empty (exclude: every candidate state is forbidden; include: none overlap).
 * HQ / "City · Remote" alone is not a residency restriction.
 */
export function evaluateRemoteResidency(
  pageText: string,
  workEligibleRegions: readonly string[]
): ResidencyEval {
  const regions = workEligibleRegions.map(normalizeRegionToken).filter(Boolean);
  const t = pageText;

  const excludeMatch = t.match(
    /(?:not\s+accepting|are\s+not\s+accepting|will\s+not\s+(?:hire|accept|consider)|do\s+not\s+(?:hire|accept|consider)|excluding|cannot\s+be\s+considered|can\s+not\s+be\s+considered)[^.!\n]{0,200}/i
  );
  if (excludeMatch?.[0]) {
    const states = extractStateTokens(excludeMatch[0]);
    if (states.length) {
      if (regions.length === 0) {
        return {
          verdict: 'unknown',
          reason: `Posting excludes remote workers in ${states.join(', ')}; no candidate residency regions configured`,
          mode: 'exclude',
          states,
        };
      }
      const blocked = regions.every((r) => states.includes(r));
      if (blocked) {
        return {
          verdict: 'hard_skip',
          reason: `Posting excludes remote workers in ${states.join(', ')}; your regions (${regions.join(', ')}) are all excluded`,
          mode: 'exclude',
          states,
        };
      }
      return {
        verdict: 'clear',
        reason: `Posting excludes ${states.join(', ')}; your regions (${regions.join(', ')}) are permitted`,
        mode: 'exclude',
        states,
      };
    }
  }

  // Multi-country allow lists (OR): "US, Canada or WEU" — US states satisfy US.
  const countryAllow = findCountryAllowClause(t);
  if (countryAllow && regionsMatchCountryAllowList(regions, countryAllow.countries)) {
    const labels = countryAllow.countries.join('/');
    return {
      verdict: 'clear',
      reason: `Posting allows residency in ${labels}; your regions (${regions.join(', ')}) are covered`,
      mode: 'include',
      states: [],
    };
  }
  if (countryAllow && countryAllow.countries.includes('US') && regions.length === 0) {
    return {
      verdict: 'unknown',
      reason: `Posting limits residency to ${countryAllow.countries.join('/')}; no candidate regions configured`,
      mode: 'include',
      states: [],
    };
  }

  const includeMatch = t.match(
    /(?:must\s+reside\s+in|candidates?\s+(?:must\s+be\s+)?(?:located|based)\s+(?:out\s+of|in)|only\s+(?:hiring|accepting)\s+(?:from|in)|open\s+(?:only\s+)?to\s+(?:candidates\s+in|residents\s+of)|(?:location|residency)\s*:\s*(?:candidates?\s+must\s+be\s+)?(?:based|located)\s+(?:out\s+of|in))[^.!\n]{0,200}/i
  );
  if (
    includeMatch?.[0] &&
    !/\bunited\s+states\b|\bU\.?S\.?\b|\bnationwide\b|\bcanada\b|\bWEU\b|\bUK\b/i.test(
      includeMatch[0]
    )
  ) {
    const states = extractStateTokens(includeMatch[0]);
    if (states.length) {
      if (regions.length === 0) {
        return {
          verdict: 'unknown',
          reason: `Posting limits residency to ${states.join(', ')}; no candidate regions configured`,
          mode: 'include',
          states,
        };
      }
      const ok = regions.some((r) => states.includes(r));
      if (!ok) {
        return {
          verdict: 'hard_skip',
          reason: `Posting requires residency in ${states.join(', ')}; your regions (${regions.join(', ')}) do not overlap`,
          mode: 'include',
          states,
        };
      }
      return {
        verdict: 'clear',
        reason: `Posting allows residency in ${states.join(', ')}; overlaps your regions (${regions.join(', ')})`,
        mode: 'include',
        states,
      };
    }
  }

  // Country-level US / nationwide remote: any configured US state is in-scope.
  if (looksUsCountryRemoteScope(t) || looksUnrestrictedRemoteResidency(t)) {
    const allUs =
      regions.length === 0 || regions.every((r) => isUsStateCode(r));
    if (allUs) {
      return {
        verdict: 'clear',
        reason: looksUsCountryRemoteScope(t)
          ? 'Remote role scoped to the US; your state residency is within the US'
          : 'Remote / nationwide — no state residency subset that excludes you',
        mode: 'none',
        states: [],
      };
    }
  }

  return { verdict: 'unknown', reason: '', mode: 'none', states: [] };
}

// Keep legacy name used by looksUnrestrictedRemoteResidency
const REMOTE_RE = REMOTE_STRONG_RE;

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

const CLEARANCE_REQUIRED_RE =
  /\b(?:(?:active|current|existing)\s+)?(?:security\s+)?clearance\s+(?:required|needed|mandatory)\b|\b(?:must|requires?|need(?:s|ed)?)\s+(?:an?\s+)?(?:active\s+)?(?:security\s+)?clearance\b|\brequires?\s+(?:an?\s+)?(?:active\s+)?(?:secret|top\s+secret|ts\/?sci|public\s+trust)\b|\b(?:top\s+secret|secret|ts\/?sci|public\s+trust)\s+clearance\b|\b(?:active|current)\s+(?:top\s+secret|secret|ts\/?sci)\s+clearance\b|\b(?:active|current)\s+(?:top\s+secret|secret|ts\/?sci)\b|\b(?:dod|doe)\s+(?:security\s+)?clearance\b/i;

const CLEARANCE_PREFERRED_RE =
  /\b(?:security\s+)?clearance\s+(?:preferred|desired|a\s+plus|nice\s+to\s+have)\b|\b(?:preferred|desired)\s+(?:security\s+)?clearance\b|\b(?:able|willingness|willing)\s+to\s+(?:obtain|get|acquire)\s+(?:a\s+)?(?:security\s+)?clearance\b|\bclearance\s+(?:eligible|eligibility)\b/i;

/**
 * Detect clearance language for local preflight + policy enforcement.
 * Bare "clearance" / board UI chrome is NOT enough — require required/preferred phrasing.
 */
export function detectClearanceLanguage(
  pageText: string,
  opts?: { includePreferred?: boolean }
): { hit: boolean; preferredOnly: boolean; snippet: string } {
  const t = pageText;
  if (CLEARANCE_REQUIRED_RE.test(t)) {
    const m = t.match(CLEARANCE_REQUIRED_RE);
    return { hit: true, preferredOnly: false, snippet: (m?.[0] || 'clearance required').trim() };
  }
  const preferred = CLEARANCE_PREFERRED_RE.test(t);
  if (preferred) {
    const m = t.match(CLEARANCE_PREFERRED_RE);
    const snippet = (m?.[0] || 'clearance preferred').trim();
    if (opts?.includePreferred) {
      return { hit: true, preferredOnly: true, snippet };
    }
    return { hit: false, preferredOnly: true, snippet };
  }
  return { hit: false, preferredOnly: false, snippet: '' };
}

/**
 * Local clearance gate. skip → hard_skip; flag → soft.
 * Respects clearanceSkipUntil for "able to obtain" when date is in the future.
 */
export function evaluateClearanceGate(cfg: Config, pageText: string): PreflightResult | null {
  const policy = cfg.preferences.clearancePolicy;
  if (policy === 'ignore') return null;

  const includePreferred = cfg.preferences.clearanceIncludePreferred;
  const detected = detectClearanceLanguage(pageText, { includePreferred });
  if (!detected.hit) return null;

  const skipUntil = (cfg.preferences.clearanceSkipUntil || '').trim();
  if (skipUntil && detected.preferredOnly) {
    const today = new Date().toISOString().slice(0, 10);
    if (today >= skipUntil && !includePreferred) return null;
  }

  if (policy === 'skip') {
    return emptyResult(
      'hard_skip',
      [
        detected.preferredOnly
          ? `Clearance preferred / obtainable (${detected.snippet}) — skip policy`
          : `Clearance required (${detected.snippet}) — skip policy`,
      ],
      { flags: ['clearance'] }
    );
  }

  return emptyResult(
    'soft',
    [
      detected.preferredOnly
        ? `Clearance preferred / obtainable noted (${detected.snippet})`
        : `Clearance language noted (${detected.snippet})`,
    ],
    { flags: ['clearance'] }
  );
}

/**
 * Promote soft clearance to hard_skip only when local text confirms clearance
 * and policy is skip. Never promote Haiku-invented clearance with no JD evidence.
 * Strip unverified Haiku clearance flags/reasons.
 */
export function enforceClearancePolicy(
  result: PreflightResult,
  cfg: Config,
  pageText: string
): PreflightResult {
  const policy = cfg.preferences.clearancePolicy;
  const detected = detectClearanceLanguage(pageText, {
    includePreferred: cfg.preferences.clearanceIncludePreferred,
  });

  if (!detected.hit) {
    const claimedClearance =
      result.flags.some((f) => /clearance/i.test(f)) ||
      result.reasons.some((r) => /\bclearance\b/i.test(r));
    if (!claimedClearance) return result;

    const cleanedReasons = result.reasons.filter((r) => !/\bclearance\b/i.test(r));
    const cleanedFlags = result.flags.filter((f) => !/clearance/i.test(f));
    const otherHard = cleanedFlags.some((f) =>
      /blocked|remote_only|geo_excluded|residency_excluded|skip_category|perm|shell/i.test(f)
    );
    // Drop invented clearance; demote hard_skip when clearance was the only gate
    if (result.verdict === 'hard_skip' && !otherHard) {
      return {
        ...result,
        verdict: cleanedReasons.length ? 'soft' : 'clear',
        reasons: cleanedReasons.length
          ? cleanedReasons
          : ['No clearance requirement found on posting'],
        flags: cleanedFlags,
        sources: Array.from(new Set([...result.sources, 'local'])),
      };
    }
    return { ...result, reasons: cleanedReasons, flags: cleanedFlags };
  }

  if (policy !== 'skip') return result;
  if (result.verdict === 'hard_skip' && result.flags.includes('clearance')) return result;

  return {
    ...result,
    verdict: 'hard_skip',
    reasons: [
      `Clearance required (${detected.snippet}) — skip policy`,
      ...result.reasons.filter((r) => !/\bclearance\b/i.test(r)),
    ].slice(0, 3),
    flags: Array.from(new Set([...result.flags, 'clearance'])),
    sources: Array.from(new Set([...result.sources, 'local'])),
  };
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
      [`Remote-only preference: posting looks ${workModelHint}`],
      { workModelHint, flags: ['remote_only'] }
    );
  }

  const clearance = evaluateClearanceGate(cfg, pageText);
  if (clearance) {
    return clearance;
  }

  const residency = evaluateRemoteResidency(pageText, cfg.workEligibleRegions);
  if (residency.verdict === 'hard_skip') {
    return emptyResult('hard_skip', [residency.reason], {
      workModelHint,
      flags: ['residency_excluded'],
    });
  }
  if (residency.verdict === 'clear' && residency.reason) {
    reasons.push(residency.reason);
  }

  const geo = computeDeterministicGeo({
    locations: cfg.locations,
    pageText,
  });

  const cadence = detectOnsiteTravelCadence(pageText);
  const allowance = cfg.preferences.occasionalTravelAllowance;
  const remotePrimary =
    workModelHint === 'remote' || (hasRemotePrimarySignal(pageText) && hasShortOnsiteTraining(pageText));

  if (geo?.verdict === 'excluded') {
    // Remote-primary / short training: commute distance is not a hard gate.
    if (remotePrimary) {
      if (allowsOccasionalTravelOutsideRadius(allowance, cadence) || hasShortOnsiteTraining(pageText)) {
        reasons.push(
          `Remote-primary with light onsite travel (${cadence === 'unknown' ? 'training/occasional' : cadence}): ${geo.reason}`
        );
      } else {
        reasons.push(`Geo distance noted but remote: ${geo.reason}`);
      }
    } else if (workModelHint === 'onsite' || workModelHint === 'hybrid') {
      if (allowsOccasionalTravelOutsideRadius(allowance, cadence)) {
        const cadenceLabel = cadence === 'unknown' ? 'unspecified light travel' : cadence;
        return emptyResult(
          'soft',
          [
            ...reasons,
            `Travel outside radius (${cadenceLabel}) allowed by your setting (up to ${allowance}): ${geo.reason}`,
          ],
          {
            workModelHint,
            geoNote: geo.reason,
            flags: ['geo_excluded_travel_allowed', ...(residency.verdict === 'clear' ? ['residency_ok'] : [])],
          }
        );
      }
      return emptyResult('hard_skip', [...reasons, geo.reason], {
        workModelHint,
        geoNote: geo.reason,
        flags: ['geo_excluded'],
      });
    } else {
      return emptyResult('soft', [...reasons, `Possible geo miss (work model unclear): ${geo.reason}`], {
        workModelHint,
        geoNote: geo.reason,
        flags: ['geo_excluded_unclear_model'],
      });
    }
  }

  if (geo?.verdict === 'eligible' && (workModelHint === 'onsite' || workModelHint === 'hybrid')) {
    reasons.push(geo.reason);
  }

  const flags =
    residency.verdict === 'clear' ? (['residency_ok'] as string[]) : ([] as string[]);

  if (!needsSemanticPreflight(cfg) && workModelHint !== 'unclear' && residency.verdict !== 'unknown') {
    return emptyResult(
      reasons.some((r) => /travel|training|distance/i.test(r)) ? 'soft' : 'clear',
      reasons.length ? reasons : ['No local hard gates hit'],
      { workModelHint, flags }
    );
  }

  if (reasons.length) {
    return emptyResult(
      reasons.some((r) => /travel|training|distance|geo/i.test(r)) ? 'soft' : 'clear',
      reasons,
      { workModelHint, flags }
    );
  }

  return emptyResult('unknown', [], { workModelHint, flags });
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
    return (
      u.searchParams.get('lk') ||
      u.searchParams.get('jk') ||
      u.searchParams.get('vjk') ||
      ''
    );
  } catch {
    return '';
  }
}

/**
 * Cache key for preflight. Prefer listing keys (lk/jk/vjk) so SPA card flips
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
  // Include text signature for cache/debug; SPA change detection should use identity only.
  return `${listingIdentityFingerprint(args)}|${pageTextSignature(args.pageText)}`;
}

/**
 * Identity-only fingerprint for SPA change detection (Indeed/Zip card flips).
 * Excludes page-text signature so lazy-loaded JD growth / scroll mutations do not re-run preflight.
 */
export function listingIdentityFingerprint(args: {
  href: string;
  canonicalUrl: string;
  paneTitle: string;
}): string {
  const key = preflightCacheKey(args);
  const title = args.paneTitle.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
  return `${key}|${title}`;
}

/** Remote with no worker-residency restriction (nationwide / US-wide / no state residency). */
export function looksUnrestrictedRemoteResidency(pageText: string): boolean {
  if (looksUsCountryRemoteScope(pageText)) return true;
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
    /workEligibleRegions|residency|eligible regions|regions? limited|Remote-US|intersection|nationwide exception|WEU|Canada/i.test(
      r
    )
  );
}

/** Haiku admitted the candidate regions are allowed — do not keep hard_skip. */
function haikuAdmitsResidencyAllowed(result: PreflightResult): boolean {
  return result.reasons.some((r) =>
    /\bare allowed\b|\bunder US scope\b|\bwithin the US\b|\bwithin US\b|\bare permitted\b|\bare covered\b|\bincludes? (?:all )?US states\b/i.test(
      r
    )
  );
}

/**
 * Prefer decisive local residency parse over Haiku: demote model hard_skips when
 * local says residency_ok / clear intersection, or the JD is unrestricted remote.
 * Does not clear local-only hard_skips.
 */
export function sanitizeHaikuResidencySkip(
  result: PreflightResult,
  pageText: string,
  opts?: { local?: PreflightResult | null; workEligibleRegions?: readonly string[] }
): PreflightResult {
  if (result.verdict !== 'hard_skip') return result;
  if (!result.sources.includes('haiku')) return result;
  if (result.sources.length === 1 && result.sources[0] === 'local') return result;
  if (!looksResidencyHardSkip(result)) return result;

  const local = opts?.local;

  if (local?.flags.includes('residency_ok') || haikuAdmitsResidencyAllowed(result)) {
    return {
      ...result,
      verdict: local?.verdict === 'soft' ? 'soft' : 'clear',
      reasons: [
        ...(local?.reasons.length
          ? local.reasons
          : haikuAdmitsResidencyAllowed(result)
            ? ['Your regions are allowed under the posting residency rules']
            : ['Residency permitted for your regions']),
      ].slice(0, 3),
      flags: Array.from(
        new Set([
          'residency_ok',
          ...(local?.flags ?? []),
          ...result.flags.filter((f) => !/residency_excluded|region/i.test(f)),
        ])
      ),
      sources: Array.from(new Set([...result.sources, 'local'])),
    };
  }

  const regions = opts?.workEligibleRegions ?? [];
  if (regions.length) {
    const residency = evaluateRemoteResidency(pageText, regions);
    if (residency.verdict === 'clear') {
      return {
        ...result,
        verdict: local?.verdict === 'soft' ? 'soft' : 'clear',
        reasons: [residency.reason, ...result.reasons.map(humanizePreflightReason)].slice(0, 3),
        flags: Array.from(
          new Set([
            'residency_ok',
            ...(local?.flags ?? []),
            ...result.flags.filter((f) => !/residency_excluded|region/i.test(f)),
          ])
        ),
      };
    }
  }

  if (looksUnrestrictedRemoteResidency(pageText)) {
    return {
      ...result,
      verdict: 'clear',
      reasons: [
        looksUsCountryRemoteScope(pageText)
          ? 'Remote role scoped to the US; your state residency is within the US'
          : 'Remote / nationwide — employer city is not a residency limit',
        ...result.reasons.map(humanizePreflightReason),
      ].slice(0, 3),
      flags: Array.from(
        new Set([
          'residency_ok',
          ...result.flags.filter((f) => !/residency_excluded|region/i.test(f)),
        ])
      ),
    };
  }

  return result;
}

const US_CITIZEN_NOTE_RE =
  /\b(?:U\.?\s*S\.?\.?\s*|United\s+States\s+|American\s+)?citizen(?:ship)?\b|\bUS\s+citizen\b/i;

const NEEDS_SPONSORSHIP_NOTE_RE =
  /\b(?:need(?:s|ed)?|require(?:s|d)?|seeking)\s+(?:visa\s+)?sponsorship\b|\bnot\s+a\s+(?:U\.?\s*S\.?\.?\s*)?citizen\b|\bH-?1B\b|\bEAD\b|\bgreen\s+card\s+pending\b/i;

const POSTING_US_CITIZEN_REQUIRED_RE =
  /\b(?:must\s+be\s+(?:a\s+)?U\.?\s*S\.?\.?\s*citizen|U\.?\s*S\.?\.?\s*citizenship\s+(?:required|mandatory|needed)|only\s+U\.?\s*S\.?\.?\s*citizens?\s+(?:may|can|will)|requires?\s+U\.?\s*S\.?\.?\s*citizenship)\b/i;

/** Candidate work-auth note indicates US citizenship. */
export function candidateClaimsUsCitizenship(note: string): boolean {
  const n = note.trim();
  if (!n) return false;
  if (NEEDS_SPONSORSHIP_NOTE_RE.test(n) && !US_CITIZEN_NOTE_RE.test(n)) return false;
  return US_CITIZEN_NOTE_RE.test(n);
}

/** Posting explicitly requires US citizenship (not merely US-based / work auth). */
export function postingRequiresUsCitizenship(pageText: string): boolean {
  return POSTING_US_CITIZEN_REQUIRED_RE.test(pageText);
}

function looksCitizenshipHardSkip(result: PreflightResult): boolean {
  if (result.flags.some((f) => /citizen|work_?auth|authorization/i.test(f))) return true;
  return result.reasons.some((r) =>
    /\bcitizen|\bcitizenship\b|work\s+auth|eligibility\s+gate|may exclude candidate/i.test(r)
  );
}

/**
 * Demote Haiku hard_skips on US citizenship when the candidate note says US citizen,
 * or when the model hedges without a clear conflict ("may exclude").
 * Citizenship ≠ residency — do not treat citizen requirements as region gates.
 */
export function sanitizeHaikuCitizenshipSkip(
  result: PreflightResult,
  pageText: string,
  workAuthorizationNote: string
): PreflightResult {
  if (result.verdict !== 'hard_skip') return result;
  if (!result.sources.includes('haiku')) return result;
  if (!looksCitizenshipHardSkip(result)) return result;

  // Sticky local hard gates (blocked employer, etc.) — leave alone if not citizenship-shaped
  if (
    result.sources.includes('local') &&
    result.flags.some((f) =>
      /blocked|remote_only|geo_excluded|residency_excluded|clearance|perm|shell|skip_category/i.test(f)
    ) &&
    !result.reasons.some((r) => /\bcitizen|\bcitizenship\b/i.test(r))
  ) {
    return result;
  }

  const requiresCitizen = postingRequiresUsCitizenship(pageText);
  const isCitizen = candidateClaimsUsCitizenship(workAuthorizationNote);

  if (requiresCitizen && isCitizen) {
    return {
      ...result,
      verdict: 'clear',
      reasons: ['Posting requires U.S. citizenship; your work authorization note matches'],
      flags: Array.from(
        new Set([
          'citizenship_ok',
          ...result.flags.filter((f) => !/citizen|work_?auth|eligibility/i.test(f)),
        ])
      ),
      sources: Array.from(new Set([...result.sources, 'local'])),
    };
  }

  // Hedge / invented exclusion without configured conflict → not a hard_skip
  const hedges =
    result.reasons.some((r) => /\bmay exclude\b|\bmight exclude\b|\bcould exclude\b/i.test(r)) ||
    (!workAuthorizationNote.trim() && requiresCitizen);

  if (hedges || (requiresCitizen && !workAuthorizationNote.trim())) {
    return {
      ...result,
      verdict: 'soft',
      reasons: [
        requiresCitizen && !workAuthorizationNote.trim()
          ? 'Posting requires U.S. citizenship; add a work authorization note to confirm fit'
          : 'U.S. citizenship is required — confirm against your work authorization note',
        ...result.reasons
          .filter((r) => !/\bmay exclude\b|\beligibility gate\b/i.test(r))
          .map(humanizePreflightReason),
      ].slice(0, 3),
      flags: Array.from(
        new Set([
          ...result.flags.filter((f) => !/citizen|eligibility/i.test(f)),
          'citizenship_unverified',
        ])
      ),
      sources: Array.from(new Set([...result.sources, 'local'])),
    };
  }

  return result;
}

const FIELD_NAME_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bworkEligibleRegions\b/g, 'your remote residency regions'],
  [/\bcandidateRemoteResidency\b/g, 'your remote residency regions'],
  [/\bremoteOnly\b/g, 'remote-only preference'],
  [/\bblockedEmployers\b/g, 'blocked employers'],
  [/\bflagPermNotices\b/g, 'PERM notices'],
  [/\bflagShellEmployers\b/g, 'shell employers'],
  [/\bclearancePolicy\b/g, 'clearance policy'],
  [/\bclearanceIncludePreferred\b/g, 'preferred-clearance setting'],
  [/\bclearanceSkipUntil\b/g, 'clearance skip-until date'],
  [/\boccasionalTravelAllowance\b/g, 'occasional travel allowance'],
  [/\broleSkipCategories\b/g, 'role skip categories'],
  [/\bcompensationMinUsd\b/g, 'minimum pay'],
  [/\bcompensationMaxUsd\b/g, 'maximum pay'],
  [/\bminContractMonths\b/g, 'minimum contract length'],
  [/\bLOCAL_PREFLIGHT\b/g, 'local check'],
  [/\bHARD_GATES\b/g, 'hard gates'],
  [/\bresidency_excluded\b/g, 'residency not matching your regions'],
  [/\bresidency_ok\b/g, 'residency OK'],
  [/\bgeo_excluded\b/g, 'outside your commute radius'],
  [/\bblocked_employer\b/g, 'blocked employer'],
  [/\bremote_only\b/g, 'remote-only'],
  [/\bskip_category\b/g, 'skip category'],
  [/\bworkAuthorizationNote\b/g, 'work authorization note'],
  [/\beligibility\s*\/?\s*gate\b/gi, 'eligibility check'],
  [/\bresidency\/eligibility gate\b/gi, 'eligibility check'],
];

/** Make preflight reasons readable in the launcher badge. */
export function humanizePreflightReason(reason: string): string {
  let out = reason
    .replace(/\bresidency\/eligibility gate\b/gi, 'eligibility check')
    .replace(/\beligibility gate\b/gi, 'eligibility check')
    .replace(/\bmay exclude candidate\b/gi, 'might not match your profile');
  for (const [re, label] of FIELD_NAME_REPLACEMENTS) {
    out = out.replace(re, label);
  }
  // Strip leftover camelCase identifiers that leaked from model output
  out = out.replace(/\b([a-z]+[A-Z][a-zA-Z0-9]*)\b/g, (m) => {
    if (m.length < 4) return m;
    return m
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase();
  });
  // snake_case machine ids
  out = out.replace(/\b([a-z]+_[a-z0-9_]+)\b/g, (m) => m.replace(/_/g, ' '));
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function humanizePreflightReasons(reasons: readonly string[]): string[] {
  return reasons.map(humanizePreflightReason);
}

