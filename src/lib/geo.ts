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

function extractCityCoord(text: string): { label: string; coord: readonly [number, number] } | null {
  for (const city of CITY_COORDS) {
    if (city.pattern.test(text)) {
      return { label: city.label, coord: city.coord };
    }
  }
  return null;
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
  const cityFromStated = extractCityCoord(stated);
  if (cityFromStated) {
    return { kind: 'city', ...cityFromStated };
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

  // 4) City anywhere in first 4k of page (last resort before abandoning)
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

/**
 * Prefer deterministic geo for onsite/hybrid when computable; leave remote to the model.
 * Never feed prior geo.reason back in (avoids reinforcing a bad GEO_HINT).
 */
export function applyDeterministicGeo(
  analysis: Analysis,
  { locations, pageText }: ApplyGeoContext
): Analysis {
  const model = analysis.workModel ?? analysis.masthead.workModel;
  if (model === 'remote') return analysis;

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
