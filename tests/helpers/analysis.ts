import type { Analysis } from '../../src/types/domain';
import { EMPTY_ANALYSIS } from '../../src/types/domain';

export function makeAnalysis(partial: Partial<Analysis> = {}): Analysis {
  return {
    ...EMPTY_ANALYSIS,
    ...partial,
    masthead: {
      ...EMPTY_ANALYSIS.masthead,
      ...(partial.masthead ?? {}),
    },
    fit: {
      ...EMPTY_ANALYSIS.fit,
      ...(partial.fit ?? {}),
    },
    apply: {
      ...EMPTY_ANALYSIS.apply,
      ...(partial.apply ?? {}),
    },
    skillMatches: partial.skillMatches ?? EMPTY_ANALYSIS.skillMatches,
    dealbreakers: partial.dealbreakers ?? EMPTY_ANALYSIS.dealbreakers,
    skipFlags: partial.skipFlags ?? EMPTY_ANALYSIS.skipFlags,
  };
}
