/**
 * Soft rating floors / consistency after model + preference merge.
 *
 * Hard gates (dealbreakers, geo exclusion) can only lower Fit/Apply.
 * Soft prefs alone must not invent a hard Fail. When there is no hard
 * evidence, optimistic skill/geo evidence may raise a contradictory Poor/No.
 */

import type { Analysis, ApplyRating, ApplyVerdict, Config, FitRating, FitScore } from '../types/domain';
import { FIT_LABEL_BY_SCORE } from '../types/domain';

/** Deterministic dealbreaker title when onsite commute exceeds maxCommutingDistance. */
export const ONSITE_COMMUTE_DEALBREAKER =
  'Onsite role exceeds configured max commuting distance';

/** Deterministic dealbreaker when preferences.remoteOnly rejects non-remote work. */
export const REMOTE_ONLY_DEALBREAKER = 'Remote-only preference excludes this work model';

/** Deterministic dealbreaker when organization matches preferences.blockedEmployers. */
export const BLOCKED_EMPLOYER_DEALBREAKER = 'Employer matches blocked-employers list';

/** Fit floor when skill evidence is strong and no hard gate. */
export const FIT_FLOOR_STRONG: FitScore = 85;
/** Fit floor when skill evidence is good and no hard gate. */
export const FIT_FLOOR_GOOD: FitScore = 75;
/** Fit floor / hard-gate cap (Unlikely). */
export const FIT_FLOOR_UNLIKELY: FitScore = 60;

const STRONG_MATCH_MIN = 3;
const STRONG_MATCH_RATIO = 0.75;
const GOOD_MATCH_MIN = 2;

/**
 * Prefer negative language for hard-gate titles. Models often invert the
 * commute constraint into a positive preference statement.
 */
const LEGACY_POSITIVE_TITLES: Array<{ match: RegExp; title: string }> = [
  {
    match: /onsite\s+work\s+location\s+within\s+configured\s+commute\s+radius/i,
    title: ONSITE_COMMUTE_DEALBREAKER,
  },
  {
    match: /work\s+location\s+within\s+(the\s+)?configured\s+commute/i,
    title: ONSITE_COMMUTE_DEALBREAKER,
  },
  {
    match: /commute\s+(radius|distance)\s+(is\s+)?(satisfied|within|ok|met)/i,
    title: ONSITE_COMMUTE_DEALBREAKER,
  },
];

export function normalizeDealbreakerTitles(dealbreakers: Analysis['dealbreakers']): Analysis['dealbreakers'] {
  return dealbreakers.map((d) => {
    const hit = LEGACY_POSITIVE_TITLES.find((r) => r.match.test(d.requirement));
    return hit ? { ...d, requirement: hit.title } : d;
  });
}

export function findBlockedEmployerHit(
  organization: string,
  blocked: readonly string[] | undefined,
): string | null {
  const org = organization.trim().toLowerCase();
  if (!org || !blocked?.length) return null;
  for (const raw of blocked) {
    const needle = raw.trim().toLowerCase();
    if (needle.length >= 2 && org.includes(needle)) return raw.trim();
  }
  return null;
}

function prefsOf(cfg?: Config | null) {
  return cfg?.preferences;
}

function capFitAt(fit: FitRating, maxScore: FitScore, rationaleExtra: string): FitRating {
  if (fit.score <= maxScore) return fit;
  return {
    label: FIT_LABEL_BY_SCORE[maxScore],
    score: maxScore,
    rationale: [fit.rationale, rationaleExtra].filter(Boolean).join(' ').trim(),
  };
}

/** Raise Fit when the model was too pessimistic vs observable evidence. */
function floorFitAt(fit: FitRating, minScore: FitScore, rationaleExtra: string): FitRating {
  if (fit.score >= minScore) return fit;
  return {
    label: FIT_LABEL_BY_SCORE[minScore],
    score: minScore,
    rationale: [fit.rationale, rationaleExtra].filter(Boolean).join(' ').trim(),
  };
}

export function looksLikeScam(analysis: Analysis): boolean {
  const smell = analysis.postingSmell.toLowerCase();
  if (/(scam|shell\s+company|phishing|fraud)/i.test(smell)) return true;
  return analysis.skipFlags.some((f) => /shell company|scam|fraud/i.test(f.trigger));
}

export type SkillStrength = 'none' | 'good' | 'strong';

/**
 * Observable skill evidence for lifting contradictory Poor/No when there is
 * no hard gate. Absolute match counts or high match ratio (no mismatches).
 */
export function skillEvidenceStrength(analysis: Analysis): SkillStrength {
  const skills = analysis.skillMatches;
  if (!skills.length) return 'none';
  let matches = 0;
  let partials = 0;
  let mismatches = 0;
  for (const s of skills) {
    if (s.status === 'match') matches++;
    else if (s.status === 'partial') partials++;
    else if (s.status === 'mismatch') mismatches++;
  }
  if (mismatches > 0) return 'none';
  const ratio = matches / skills.length;
  if (
    (matches >= STRONG_MATCH_MIN && skills.length >= STRONG_MATCH_MIN) ||
    (matches >= GOOD_MATCH_MIN && skills.length >= GOOD_MATCH_MIN && ratio >= STRONG_MATCH_RATIO)
  ) {
    return 'strong';
  }
  if (matches >= GOOD_MATCH_MIN && matches >= partials && skills.length >= GOOD_MATCH_MIN) {
    return 'good';
  }
  return 'none';
}

function raiseApply(apply: ApplyRating, min: ApplyVerdict, rationaleExtra: string): ApplyRating {
  const rank: Record<ApplyVerdict, number> = { no: 0, maybe: 1, yes: 2 };
  if (rank[apply.verdict] >= rank[min]) return apply;
  return {
    verdict: min,
    rationale: [apply.rationale, rationaleExtra].filter(Boolean).join(' ').trim(),
  };
}

/**
 * Cap Fit/Apply when hard gates fire; lift contradictory Poor/No when they do not.
 *
 * Consistency: empty hard gates + solid skillMatches must not leave Poor / Apply no.
 */
export function applyRatingFloors(analysis: Analysis, cfg?: Config | null): Analysis {
  let next: Analysis = {
    ...analysis,
    dealbreakers: normalizeDealbreakerTitles(analysis.dealbreakers),
  };

  const prefs = prefsOf(cfg);
  const wm = next.masthead.workModel;
  if (prefs?.remoteOnly && (wm === 'onsite' || wm === 'hybrid')) {
    const already = next.dealbreakers.some((d) => d.requirement === REMOTE_ONLY_DEALBREAKER);
    if (!already) {
      next = {
        ...next,
        dealbreakers: [
          ...next.dealbreakers,
          {
            requirement: REMOTE_ONLY_DEALBREAKER,
            evidence: `workModel=${wm}`,
            reason: 'preferences.remoteOnly is enabled',
          },
        ],
      };
    }
  }

  const blockedHit = findBlockedEmployerHit(next.masthead.organization, prefs?.blockedEmployers);
  if (blockedHit) {
    const already = next.dealbreakers.some((d) => d.requirement === BLOCKED_EMPLOYER_DEALBREAKER);
    if (!already) {
      next = {
        ...next,
        dealbreakers: [
          ...next.dealbreakers,
          {
            requirement: BLOCKED_EMPLOYER_DEALBREAKER,
            evidence: next.masthead.organization.trim(),
            reason: `Matched blocked employer "${blockedHit}"`,
          },
        ],
      };
    }
  }

  const hasDb = next.dealbreakers.length > 0;
  const geoExcluded = next.geo?.verdict === 'excluded';
  const scam = looksLikeScam(next);
  const hardGate = hasDb || geoExcluded || scam;

  let fit = next.fit;
  let apply = next.apply;

  if (hasDb || geoExcluded) {
    if (apply.verdict !== 'no') {
      apply = {
        verdict: 'no',
        rationale: [
          apply.rationale,
          hasDb
            ? 'Apply forced to no: hard dealbreaker present.'
            : 'Apply forced to no: geo excluded.',
        ]
          .filter(Boolean)
          .join(' ')
          .trim(),
      };
    }
    fit = capFitAt(fit, FIT_FLOOR_UNLIKELY, 'Fit capped at Unlikely: hard gate present.');
  }

  if (scam) {
    fit = { label: 'Poor fit', score: 0, rationale: fit.rationale || 'Scam / shell signals.' };
    apply = {
      verdict: 'no',
      rationale: [apply.rationale, 'Apply no: scam / shell signals.'].filter(Boolean).join(' ').trim(),
    };
  }

  // Lift contradictory Poor/No only when no hard disqualifier remains after preference merge.
  if (!hardGate) {
    const strength = skillEvidenceStrength(next);
    if (strength === 'strong') {
      fit = floorFitAt(fit, FIT_FLOOR_STRONG, 'Fit raised: skills substantially match with no hard gates.');
      apply = raiseApply(apply, 'yes', 'Apply raised: no hard gates and strong skill evidence.');
    } else if (strength === 'good') {
      fit = floorFitAt(fit, FIT_FLOOR_GOOD, 'Fit raised: solid skill matches with no hard gates.');
      apply = raiseApply(apply, 'maybe', 'Apply raised from no: no hard gates.');
    } else if (
      (next.geo?.verdict === 'eligible' || next.geo?.verdict === 'unclear') &&
      (fit.score === 0 || apply.verdict === 'no')
    ) {
      fit = floorFitAt(fit, FIT_FLOOR_UNLIKELY, 'Fit raised from Poor: no hard gates triggered.');
      apply = raiseApply(apply, 'maybe', 'Apply raised from no: no hard gates.');
    }
  }

  if (fit.label !== FIT_LABEL_BY_SCORE[fit.score]) {
    fit = { ...fit, label: FIT_LABEL_BY_SCORE[fit.score] };
  }

  if (fit === next.fit && apply === next.apply && next.dealbreakers === analysis.dealbreakers) {
    return next;
  }
  return { ...next, fit, apply };
}
