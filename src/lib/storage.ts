import type { Bookmark, Config, Location, WorkHistoryEntry, ExtractedSkill } from '../types/domain';
import { ConfigSchema } from '../types/domain';
import {
  DEFAULT_CLAUDE_MODEL,
  isPermSkipTrigger,
  PERM_SKIP_TRIGGER,
} from './settingsOptions';

export const DEFAULT_CONFIG: Config = {
  apiKey: '',
  model: DEFAULT_CLAUDE_MODEL,
  education: '',
  locations: [],
  workEligibleRegions: [],
  proficiencies: [],
  deficiencies: [],
  workHistory: [],
  extractedSkills: [],
  skipTriggers: [],
  flagPermNotices: true,
  theme: 'default',
  bookmarks: [],
};

function migrateConfigShape(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };

  // Lift legacy PERM skip-trigger text into the dedicated checkbox flag.
  if (Array.isArray(next.skipTriggers)) {
    const triggers = (next.skipTriggers as unknown[]).filter(
      (t): t is string => typeof t === 'string'
    );
    const hadPerm = triggers.some(isPermSkipTrigger);
    next.skipTriggers = triggers.filter((t) => !isPermSkipTrigger(t));
    if (typeof next.flagPermNotices !== 'boolean') {
      // Preserve intent if they still had the PERM line; otherwise keep product default on.
      next.flagPermNotices = true;
    } else if (hadPerm) {
      next.flagPermNotices = true;
    }
  } else if (typeof next.flagPermNotices !== 'boolean') {
    next.flagPermNotices = true;
  }

  return next;
}

function normalizeStored(raw: unknown): Config {
  const merged = migrateConfigShape({
    ...DEFAULT_CONFIG,
    ...(typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}),
  });
  const parsed = ConfigSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  console.warn('[JobLens] Config failed validation; merging conservatively', parsed.error.message);
  return {
    ...DEFAULT_CONFIG,
    apiKey: typeof merged.apiKey === 'string' ? merged.apiKey : '',
    model:
      typeof merged.model === 'string' && merged.model
        ? merged.model
        : DEFAULT_CONFIG.model,
    flagPermNotices:
      typeof merged.flagPermNotices === 'boolean'
        ? merged.flagPermNotices
        : DEFAULT_CONFIG.flagPermNotices,
  };
}

export async function getConfig(): Promise<Config> {
  const stored = await chrome.storage.local.get('config');
  return normalizeStored(stored.config);
}

export async function setConfig(patch: Partial<Config>): Promise<Config> {
  const current = await getConfig();
  const next = ConfigSchema.parse({ ...current, ...patch });
  await chrome.storage.local.set({ config: next });
  return next;
}

export async function addBookmark(entry: Bookmark): Promise<Bookmark[]> {
  const cfg = await getConfig();
  const bookmarks = [entry, ...cfg.bookmarks.filter((b) => b.url !== entry.url)];
  await setConfig({ bookmarks });
  return bookmarks;
}

export async function removeBookmark(url: string): Promise<Bookmark[]> {
  const cfg = await getConfig();
  const bookmarks = cfg.bookmarks.filter((b) => b.url !== url);
  await setConfig({ bookmarks });
  return bookmarks;
}

export async function isBookmarked(url: string): Promise<boolean> {
  const cfg = await getConfig();
  return cfg.bookmarks.some((b) => b.url === url);
}

/** Skip triggers sent to the model, including the optional PERM check. */
export function effectiveSkipTriggers(cfg: Config): string[] {
  const base = cfg.skipTriggers.filter((t) => !isPermSkipTrigger(t));
  if (cfg.flagPermNotices && !base.some(isPermSkipTrigger)) {
    return [...base, PERM_SKIP_TRIGGER];
  }
  return base;
}

export type { Config, Bookmark, Location, WorkHistoryEntry, ExtractedSkill };
