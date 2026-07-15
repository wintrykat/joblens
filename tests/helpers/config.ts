import type { Config } from '../../src/types/domain';
import { DEFAULT_PREFERENCES } from '../../src/types/domain';
import { DEFAULT_CONFIG } from '../../src/lib/storage';

export function makeConfig(partial: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(partial.preferences ?? {}),
      roleSkipCategories: {
        ...DEFAULT_PREFERENCES.roleSkipCategories,
        ...(partial.preferences?.roleSkipCategories ?? {}),
      },
    },
    locations: partial.locations ?? DEFAULT_CONFIG.locations,
    skillClaims: partial.skillClaims ?? DEFAULT_CONFIG.skillClaims,
    workEligibleRegions: partial.workEligibleRegions ?? DEFAULT_CONFIG.workEligibleRegions,
  };
}
