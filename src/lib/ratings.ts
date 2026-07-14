import type { Analysis, Dealbreaker, FitRating, FitScore } from '../types/domain';
import {
  DEFAULT_APPLY,
  DEFAULT_FIT,
  FIT_LABEL_BY_SCORE,
} from '../types/domain';

export const ONSITE_COMMUTE_DEALBREAKER =
  'Onsite work location not within configured commute radius';

const LEGACY_POSITIVE_TITLES: ReadonlyArray<{ match: RegExp; replacement: string }> = [
  {
    match: /^Onsite work location within configured commute radius$/i,
    replacement: ONSITE_COMMUTE_DEALBREAKER,
  },
  {
    match: /^Willingness to relocate\/travel to unanticipated U\.?S\.? client sites$/i,
    replacement: 'Relocation/travel requirements not compatible with configured commute radius',
  },
];

export function normalizeDealbreakerTitles(
  dealbreakers: readonly Dealbreaker[]
): Dealbreaker[] {
  return dealbreakers.map((d) => {
    for (const rule of LEGACY_POSITIVE_TITLES) {
      if (rule.match.test(d.requirement.trim())) {
        return { ...d, requirement: rule.replacement };
      }
    }
    return d;
  });
}

function capFitAt(fit: FitRating, maxScore: FitScore): FitRating {
  if (fit.score <= maxScore) return fit;
  return {
    label: FIT_LABEL_BY_SCORE[maxScore],
    score: maxScore,
    rationale: fit.rationale,
  };
}

function looksLikeScam(analysis: Analysis): boolean {
  if (/scam|shell company|phishing|fraudulent/i.test(analysis.postingSmell || '')) {
    return true;
  }
  return analysis.skipFlags.some((s) =>
    /shell company|scam|fraud/i.test(`${s.trigger} ${s.evidence}`)
  );
}

/**
 * Enforce Apply?/Fit floors after geo + model analysis so hard disqualifiers
 * cannot be soft-pedaled by the model.
 */
export function applyRatingFloors(analysis: Analysis): Analysis {
  const dealbreakers = normalizeDealbreakerTitles(analysis.dealbreakers);
  let fit: FitRating = analysis.fit ?? DEFAULT_FIT;
  let apply = analysis.apply ?? DEFAULT_APPLY;

  const geoExcluded = analysis.geo?.verdict === 'excluded';
  const hasDealbreaker = dealbreakers.length > 0;
  const hardDisqualifier = hasDealbreaker || geoExcluded;

  if (hardDisqualifier) {
    apply = {
      verdict: 'no',
      rationale:
        apply.rationale?.trim() ||
        (geoExcluded
          ? 'Location or commute is outside configured eligibility.'
          : 'One or more hard dealbreakers apply.'),
    };
    fit = capFitAt(fit, 60);
  }

  if (looksLikeScam(analysis)) {
    fit = {
      label: 'Poor fit',
      score: 0,
      rationale: fit.rationale || 'Posting appears fraudulent or like a shell employer.',
    };
    apply = {
      verdict: 'no',
      rationale: apply.rationale || 'Clear scam / shell-employer signals.',
    };
  }

  // Re-sync label to score after caps.
  fit = {
    ...fit,
    label: FIT_LABEL_BY_SCORE[fit.score],
  };

  return { ...analysis, dealbreakers, fit, apply };
}
