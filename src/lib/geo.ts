import type { Analysis, DeterministicGeo, Location, ZipCentroids } from '../types/domain';
import zipCentroidsJson from '../data/zipCentroids.json';
import { ONSITE_COMMUTE_DEALBREAKER } from './ratings';

const zipCentroids = zipCentroidsJson as unknown as ZipCentroids;

const EARTH_MI = 3958.8;

/** Major US cities → approximate centroid (for postings that name a city without a ZIP). */
const CITY_COORDS: ReadonlyArray<{ pattern: RegExp; label: string; coord: readonly [number, number] }> = [
  { pattern: /\bnew\s*york\b|\bnyc\b|\bbrooklyn\b|\bmanhattan\b|\bqueens\b/i, label: 'New York, NY', coord: [40.7128, -74.006] },
  { pattern: /\bsan\s*francisco\b/i, label: 'San Francisco, CA', coord: [37.7749, -122.4194] },
  { pattern: /\blos\s*angeles\b/i, label: 'Los Angeles, CA', coord: [34.0522, -118.2437] },
  { pattern: /\bseattle\b/i, label: 'Seattle, WA', coord: [47.6062, -122.3321] },
  { pattern: /\bchicago\b/i, label: 'Chicago, IL', coord: [41.8781, -87.6298] },
  { pattern: /\bboston\b/i, label: 'Boston, MA', coord: [42.3601, -71.0589] },
  { pattern: /\bdenver\b/i, label: 'Denver, CO', coord: [39.7392, -104.9903] },
  { pattern: /\baustin\b/i, label: 'Austin, TX', coord: [30.2672, -97.7431] },
  { pattern: /\bdallas\b/i, label: 'Dallas, TX', coord: [32.7767, -96.797] },
  { pattern: /\bhouston\b/i, label: 'Houston, TX', coord: [29.7604, -95.3698] },
  { pattern: /\bphiladelphia\b|\bphilly\b/i, label: 'Philadelphia, PA', coord: [39.9526, -75.1652] },
  { pattern: /\batlanta\b/i, label: 'Atlanta, GA', coord: [33.749, -84.388] },
  { pattern: /\bmiami\b/i, label: 'Miami, FL', coord: [25.7617, -80.1918] },
  { pattern: /\bwashington(?:\s*,?\s*d\.?c\.?)?\b|\bdc\b(?!\w)/i, label: 'Washington, DC', coord: [38.9072, -77.0369] },
];

const LOCATION_CONTEXT_RE =
  /(?:location|located|based|office|onsite|on-site|hybrid|headquarters|hq|workplace|work\s*from)\b[^.\n]{0,120}/gi;

/** Approximate state centroids when a City, ST header is present but the city is unknown. */
const STATE_COORDS: ReadonlyArray<{ code: string; label: string; coord: readonly [number, number] }> = [
  { code: 'WA', label: 'Washington State', coord: [47.4009, -121.4905] },
  { code: 'OR', label: 'Oregon', coord: [43.8041, -120.5542] },
  { code: 'CA', label: 'California', coord: [36.7783, -119.4179] },
  { code: 'TX', label: 'Texas', coord: [31.9686, -99.9018] },
  { code: 'NY', label: 'New York State', coord: [42.1657, -74.9481] },
  { code: 'IL', label: 'Illinois', coord: [40.3495, -88.9861] },
  { code: 'PA', label: 'Pennsylvania', coord: [40.5908, -77.2098] },
  { code: 'FL', label: 'Florida', coord: [27.7663, -81.6868] },
  { code: 'MA', label: 'Massachusetts', coord: [42.2302, -71.5301] },
  { code: 'CO', label: 'Colorado', coord: [39.0598, -105.3111] },
  { code: 'GA', label: 'Georgia', coord: [33.0406, -83.6431] },
];

/**
 * True when a match at `index` sits in a residency exclusion / negation window
 * (e.g. "not accepting … in California, Illinois, and New York").
 */
export function isNegatedLocationMention(text: string, index: number): boolean {
  if (index < 0) return false;
  const start = Math.max(0, index - 160);
  const window = text.slice(start, index);
  return (
    /\bnot\s+accepting\b/i.test(window) ||
    /\bcannot\s+be\s+considered\b/i.test(window) ||
    /\bcan\s+not\s+be\s+considered\b/i.test(window) ||
    /\bare\s+not\s+accepting\b/i.test(window) ||
    /\bwe\s+are\s+not\b/i.test(window) ||
    /\bexcluding\b/i.test(window) ||
    /\bexcept(?:ing)?\b/i.test(window) ||
    /\boutside\s+of\b/i.test(window) ||
    /\bother\s+than\b/i.test(window) ||
    /\bdo\s+not\s+(?:hire|accept|consider)\b/i.test(window) ||
    /\bwill\s+not\s+(?:hire|accept|consider)\b/i.test(window) ||
    /\bapplications?\s+from\b/i.test(window)
  );
}

export function padZip(zip: string | number | null | undefined): string {
  const digits = String(zip ?? '').replace(/\D/g, '');
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

export function haversineMiles(
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** All valid US ZIPs in text (order of appearance). */
export function extractAllZipsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = /\b(\d{5})(?:-\d{4})?\b/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const z = m[1];
    if (z && zipCentroids[z] && !seen.has(z)) {
      seen.add(z);
      out.push(z);
    }
  }
  return out;
}

/** First valid ZIP (legacy helper). Prefer resolvePostingLocation for geo. */
export function extractZipFromText(text: string | null | undefined): string | null {
  return extractAllZipsFromText(text)[0] ?? null;
}

function extractZipsInLocationContext(text: string): string[] {
  const snippets: string[] = [];
  for (const m of text.matchAll(LOCATION_CONTEXT_RE)) {
    if (m[0]) snippets.push(m[0]);
  }
  // Also take early header-ish lines (Ashby/Built In often put city in the first screenful)
  snippets.push(text.slice(0, 800));
  const found: string[] = [];
  const seen = new Set<string>();
  for (const snip of snippets) {
    for (const z of extractAllZipsFromText(snip)) {
      if (!seen.has(z)) {
        seen.add(z);
        found.push(z);
      }
    }
  }
  return found;
}

type CityHit = { label: string; coord: readonly [number, number]; index: number };

/**
 * Earliest non-negated city mention wins (not first entry in CITY_COORDS).
 * Skips cities that only appear inside exclusion / negation windows.
 */
export function extractCityCoord(text: string): { label: string; coord: readonly [number, number] } | null {
  if (!text) return null;
  let best: CityHit | null = null;
  for (const city of CITY_COORDS) {
    const re = new RegExp(city.pattern.source, city.pattern.flags.includes('g') ? city.pattern.flags : `${city.pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const index = m.index;
      if (isNegatedLocationMention(text, index)) continue;
      if (!best || index < best.index) {
        best = { label: city.label, coord: city.coord, index };
      }
      break; // earliest hit for this city pattern is enough
    }
  }
  return best ? { label: best.label, coord: best.coord } : null;
}

/** Prefer "City, ST" / "City, State · Remote" header signals when the city itself is unknown. */
export function extractStateFromLocationHeader(
  text: string
): { label: string; coord: readonly [number, number] } | null {
  if (!text) return null;
  // Score the earliest non-negated City, ST-style hit in the early header / work-location lines.
  const header = text.slice(0, 1500);
  const re =
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b(?:\s*[·•|,/-]\s*|\s+)(?:Remote|Hybrid|On[\s-]?site)?/g;
  let m: RegExpExecArray | null;
  let best: { code: string; index: number } | null = null;
  while ((m = re.exec(header))) {
    const index = m.index;
    const code = (m[2] || '').toUpperCase();
    if (!code || isNegatedLocationMention(header, index)) continue;
    if (!best || index < best.index) best = { code, index };
  }
  if (!best) {
    // Fallback: Work Location: … Remote but … still may list City, ST earlier
    const loose = header.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/);
    if (loose?.[2] && !isNegatedLocationMention(header, loose.index ?? 0)) {
      best = { code: loose[2].toUpperCase(), index: loose.index ?? 0 };
    }
  }
  if (!best) return null;
  const state = STATE_COORDS.find((s) => s.code === best!.code);
  return state ? { label: state.label, coord: state.coord } : null;
}

export type ResolvePostingLocationArgs = {
  pageText?: string;
  statedLocation?: string;
  operatorZips?: readonly string[];
};

export type ResolvedPostingLocation =
  | { kind: 'zip'; zip: string; coord: readonly [number, number]; label: string }
  | { kind: 'city'; coord: readonly [number, number]; label: string };

/**
 * Resolve where the job is — never trust a bare page-wide ZIP that merely equals
 * an operator ZIP (common false positive when the JD only names a city).
 */
export function resolvePostingLocation({
  pageText = '',
  statedLocation = '',
  operatorZips = [],
}: ResolvePostingLocationArgs): ResolvedPostingLocation | null {
  const operator = new Set(operatorZips.map(padZip));
  const stated = statedLocation.trim();
  const corpus = `${stated}\n${pageText}`;

  // 1) ZIP in stated location string (masthead / decluttered header)
  for (const z of extractAllZipsFromText(stated)) {
    const coord = zipCentroids[z];
    if (coord) return { kind: 'zip', zip: z, coord, label: `ZIP ${z}` };
  }

  // 2) Named city in stated location or early page text / location context
  //    (skips cities that only appear in exclusion / negation windows)
  const cityFromStated = extractCityCoord(stated);
  if (cityFromStated) {
    return { kind: 'city', ...cityFromStated };
  }

  // Prefer City, ST header (e.g. Ferndale, WA · Remote) before exclusion-tainted cities.
  const stateFromHeader = extractStateFromLocationHeader(corpus);
  if (stateFromHeader) {
    // If a known city appears *before* the state header hit and is not negated, prefer it.
    const early = pageText.slice(0, 1200);
    const cityEarly = extractCityCoord(early);
    if (cityEarly) return { kind: 'city', ...cityEarly };
    return { kind: 'city', ...stateFromHeader };
  }

  const locationSnippets = [...corpus.matchAll(LOCATION_CONTEXT_RE)].map((m) => m[0] || '');
  locationSnippets.unshift(pageText.slice(0, 1200));
  for (const snip of locationSnippets) {
    const city = extractCityCoord(snip);
    if (city) return { kind: 'city', ...city };
  }

  // 3) ZIP in location-context snippets — skip ZIPs that are only the operator's
  //    unless no city was found and it's the only signal (still prefer non-operator)
  const contextZips = extractZipsInLocationContext(corpus);
  const nonOperator = contextZips.filter((z) => !operator.has(z));
  const pick = nonOperator[0] ?? null;
  if (pick) {
    const coord = zipCentroids[pick];
    if (coord) return { kind: 'zip', zip: pick, coord, label: `ZIP ${pick}` };
  }

  // 4) City anywhere in first 4k of page (last resort; still skip negated mentions)
  const cityAnywhere = extractCityCoord(pageText.slice(0, 4000));
  if (cityAnywhere) return { kind: 'city', ...cityAnywhere };

  return null;
}

export type ComputeGeoArgs = {
  locations: readonly Location[];
  pageText?: string;
  statedLocation?: string;
};

function verdictAgainstLocations(
  postingCoord: readonly [number, number],
  postingLabel: string,
  locations: readonly Location[],
  postingZip: string | null
): DeterministicGeo | null {
  let best: { miles: number; zip: string; radiusMiles: number } | null = null;
  for (const loc of locations) {
    const z = padZip(loc.zip);
    const coord = zipCentroids[z];
    if (!coord) continue;
    const miles = haversineMiles(postingCoord, coord);
    const radius = Number(loc.radiusMiles) || 0;
    if (!best || miles < best.miles) {
      best = { miles, zip: z, radiusMiles: radius };
    }
  }
  if (!best) return null;

  const eligible = best.miles <= best.radiusMiles;
  return {
    verdict: eligible ? 'eligible' : 'excluded',
    reason: `Deterministic: ${postingLabel} is ${best.miles.toFixed(1)} mi from ${best.zip} (radius ${best.radiusMiles} mi).`,
    method: 'zip-haversine',
    postingZip: postingZip,
    nearestOperatorZip: best.zip,
    distanceMiles: Math.round(best.miles * 10) / 10,
  };
}

/**
 * If we can resolve a posting location and at least one operator ZIP, return a
 * deterministic onsite/hybrid geo object. Otherwise null.
 */
export function computeDeterministicGeo({
  locations,
  pageText = '',
  statedLocation = '',
}: ComputeGeoArgs): DeterministicGeo | null {
  const resolved = resolvePostingLocation({
    pageText,
    statedLocation,
    operatorZips: locations.map((l) => l.zip),
  });
  if (!resolved) return null;

  if (resolved.kind === 'zip') {
    return verdictAgainstLocations(
      resolved.coord,
      `ZIP ${resolved.zip}`,
      locations,
      resolved.zip
    );
  }

  return verdictAgainstLocations(resolved.coord, resolved.label, locations, null);
}

export type ApplyGeoContext = {
  locations: readonly Location[];
  pageText: string;
};

export const NO_LOCATIONS_GEO_REASON = 'No commute locations configured';

/**
 * Prefer deterministic geo for onsite/hybrid when computable; leave remote to the model.
 * Never feed prior geo.reason back in (avoids reinforcing a bad GEO_HINT).
 * When locations are empty and work is onsite/hybrid, force geo unclear (no commute dealbreaker).
 */
export function applyDeterministicGeo(
  analysis: Analysis,
  { locations, pageText }: ApplyGeoContext
): Analysis {
  const model = analysis.workModel ?? analysis.masthead.workModel;
  if (model === 'remote') return analysis;

  const hasLocations = locations.some((l) => l.zip.trim());
  if (!hasLocations && (model === 'onsite' || model === 'hybrid')) {
    return {
      ...analysis,
      geo: {
        verdict: 'unclear',
        reason: NO_LOCATIONS_GEO_REASON,
        method: 'model',
        postingZip: null,
        distanceMiles: null,
      },
    };
  }

  const stated = [
    analysis.masthead.location,
    analysis.declutteredJD.slice(0, 600),
    `${analysis.masthead.organization} ${analysis.masthead.title}`,
  ]
    .filter(Boolean)
    .join('\n');

  const computed = computeDeterministicGeo({ locations, pageText, statedLocation: stated });
  if (!computed) return analysis;

  if (model === 'onsite' || model === 'hybrid' || model === 'unclear' || !model) {
    let dealbreakers = analysis.dealbreakers;
    if (computed.verdict === 'excluded' && model === 'onsite') {
      const already = dealbreakers.some((d) => /onsite|location|commute/i.test(d.requirement));
      if (!already) {
        dealbreakers = [
          {
            requirement: ONSITE_COMMUTE_DEALBREAKER,
            reason: computed.reason,
            evidence: stated.split('\n').find((l) => /york|location|onsite|office/i.test(l)) || stated.slice(0, 160),
          },
          ...dealbreakers,
        ];
      }
    }

    return {
      ...analysis,
      dealbreakers,
      geo: {
        verdict: computed.verdict,
        reason: computed.reason,
        method: computed.method,
        postingZip: computed.postingZip,
        distanceMiles: computed.distanceMiles,
      },
    };
  }
  return analysis;
}
