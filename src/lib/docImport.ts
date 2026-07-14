import { z } from 'zod';
import type { Config, Location, Preferences, SkillClaim, WorkHistoryEntry } from '../types/domain';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_ROLE_SKIP_CATEGORIES,
  LocationSchema,
  SkillClaimSchema,
  WorkHistoryEntrySchema,
} from '../types/domain';

export const MAX_IMPORT_CHARS = 90_000;

export const ALLOWED_IMPORT_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'] as const;
export type AllowedImportExt = (typeof ALLOWED_IMPORT_EXTENSIONS)[number];

export const CONFIG_PROPOSAL_PATHS = [
  'education',
  'workAuthorizationNote',
  'locations',
  'workEligibleRegions',
  'skillClaims',
  'deficiencies',
  'skipTriggers',
  'workHistory',
  'preferences.remoteOnly',
  'preferences.remotePreference',
  'preferences.requireRelocationSubsidyOutsideMetros',
  'preferences.employmentPriority',
  'preferences.minContractMonths',
  'preferences.clearancePolicy',
  'preferences.clearanceIncludePreferred',
  'preferences.clearanceSkipUntil',
  'preferences.blockedEmployers',
  'preferences.roleSkipCategories',
  'preferences.flagShellEmployers',
  'preferences.flagPermNotices',
  'preferences.compensationMode',
  'preferences.compensationMinUsd',
  'preferences.compensationMaxUsd',
  'preferences.flagSuspiciousComp',
  'preferences.preferStructuredWork',
  'preferences.pipelineLoad',
  'preferences.targetStartDate',
  'preferences.availableImmediately',
  'preferences.noticePeriodWeeks',
] as const;

export type ConfigProposalPath = (typeof CONFIG_PROPOSAL_PATHS)[number];

export const ConfigProposalChangeSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  label: z.string().min(1),
  rationale: z.string().default(''),
  value: z.unknown().optional().default(null),
});
export type ConfigProposalChange = z.infer<typeof ConfigProposalChangeSchema> & {
  path: ConfigProposalPath;
};

export const ConfigProposalSchema = z.object({
  summary: z.string().default(''),
  changes: z.array(ConfigProposalChangeSchema).default([]),
});
export type ConfigProposal = {
  summary: string;
  changes: ConfigProposalChange[];
};

export function parseConfigProposal(raw: unknown): ConfigProposal {
  const parsed = ConfigProposalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config proposal: ${parsed.error.message}`);
  }
  const allowed = new Set<string>(CONFIG_PROPOSAL_PATHS);
  return {
    summary: parsed.data.summary,
    changes: parsed.data.changes
      .filter((c) => allowed.has(c.path))
      .map((c) => ({ ...c, path: c.path as ConfigProposalPath })),
  };
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function assertImportableFile(name: string): AllowedImportExt {
  const ext = fileExtension(name);
  if (ext === '.doc') {
    throw new Error(
      `"${name}" is a legacy .doc file. Convert to PDF/DOCX or paste as text/markdown.`
    );
  }
  if (!(ALLOWED_IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported file "${name}". Allowed: ${ALLOWED_IMPORT_EXTENSIONS.join(', ')}`
    );
  }
  return ext as AllowedImportExt;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const { getDocument, GlobalWorkerOptions } = pdfjs;
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .filter(Boolean)
      .join(' ');
    if (line.trim()) parts.push(line);
  }
  const text = parts.join('\n').trim();
  if (!text) {
    throw new Error(
      `No extractable text in "${file.name}" (scanned PDFs are not supported).`
    );
  }
  return text;
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = (result.value || '').trim();
  if (!text) throw new Error(`No extractable text in "${file.name}".`);
  return text;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = assertImportableFile(file.name);
  if (ext === '.txt' || ext === '.md') {
    const text = (await file.text()).trim();
    if (!text) throw new Error(`"${file.name}" is empty.`);
    return text;
  }
  if (ext === '.pdf') return extractPdfText(file);
  return extractDocxText(file);
}

export type ExtractedDocBundle = {
  text: string;
  truncated: boolean;
  fileCount: number;
  names: string[];
};

export async function extractTextsFromFiles(files: readonly File[]): Promise<ExtractedDocBundle> {
  if (!files.length) throw new Error('No files selected.');
  const blocks: string[] = [];
  const names: string[] = [];
  for (const file of files) {
    names.push(file.name);
    const body = await extractTextFromFile(file);
    blocks.push(`--- file: ${file.name} ---\n${body}`);
  }
  let text = blocks.join('\n\n');
  let truncated = false;
  if (text.length > MAX_IMPORT_CHARS) {
    text = text.slice(0, MAX_IMPORT_CHARS);
    truncated = true;
  }
  return { text, truncated, fileCount: files.length, names };
}

/** Config snapshot sent to the model (never include apiKey). */
export function sanitizeConfigForPropose(cfg: Config): Record<string, unknown> {
  const { apiKey: _omit, bookmarks: _b, ...rest } = cfg;
  return {
    ...rest,
    preferences: cfg.preferences ?? DEFAULT_PREFERENCES,
  };
}

function mergeSkillClaims(existing: SkillClaim[], incoming: unknown): SkillClaim[] {
  const parsed = z.array(SkillClaimSchema).safeParse(incoming);
  if (!parsed.success) return existing;
  const byKey = new Map(existing.map((c) => [c.skill.trim().toLowerCase(), c]));
  for (const c of parsed.data) {
    const key = c.skill.trim().toLowerCase();
    if (!key) continue;
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...prev, ...c, skill: c.skill.trim() || prev.skill } : c);
  }
  return [...byKey.values()];
}

function mergeLocations(existing: Location[], incoming: unknown): Location[] {
  const parsed = z.array(LocationSchema).safeParse(incoming);
  if (!parsed.success) return existing;
  const byZip = new Map(existing.map((l) => [l.zip.trim(), l]));
  for (const loc of parsed.data) {
    const zip = loc.zip.trim();
    if (!zip) continue;
    byZip.set(zip, loc);
  }
  return [...byZip.values()];
}

function mergeStringList(existing: string[], incoming: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(incoming);
  if (!parsed.success) return existing;
  const set = new Set(existing.map((s) => s.trim()).filter(Boolean));
  for (const s of parsed.data) {
    const t = s.trim();
    if (t) set.add(t);
  }
  return [...set];
}

function mergeWorkHistory(existing: WorkHistoryEntry[], incoming: unknown): WorkHistoryEntry[] {
  const parsed = z.array(WorkHistoryEntrySchema).safeParse(incoming);
  if (!parsed.success) return existing;
  const keyOf = (w: WorkHistoryEntry): string =>
    `${w.org}|${w.title}|${w.start}`.toLowerCase();
  const byKey = new Map(existing.map((w) => [keyOf(w), w]));
  for (const w of parsed.data) {
    byKey.set(keyOf(w), w);
  }
  return [...byKey.values()];
}

function setPref(
  prefs: Preferences,
  key: keyof Preferences,
  value: unknown
): Preferences {
  return { ...prefs, [key]: value } as Preferences;
}

/**
 * Apply selected proposal changes onto a config draft.
 * Array fields merge by key; scalars replace. Never touches apiKey/model/theme/bookmarks.
 */
export function applyConfigProposalChanges(
  cfg: Config,
  changes: readonly ConfigProposalChange[]
): Config {
  let next: Config = { ...cfg, preferences: { ...(cfg.preferences ?? DEFAULT_PREFERENCES) } };
  let prefs = { ...next.preferences };

  for (const change of changes) {
    const path = change.path;
    const value = change.value;

    switch (path) {
      case 'education':
        if (typeof value === 'string') next = { ...next, education: value };
        break;
      case 'workAuthorizationNote':
        if (typeof value === 'string') next = { ...next, workAuthorizationNote: value };
        break;
      case 'locations':
        next = { ...next, locations: mergeLocations(next.locations, value) };
        break;
      case 'workEligibleRegions':
        next = {
          ...next,
          workEligibleRegions: mergeStringList(next.workEligibleRegions, value),
        };
        break;
      case 'skillClaims':
        next = { ...next, skillClaims: mergeSkillClaims(next.skillClaims, value) };
        break;
      case 'deficiencies':
        next = { ...next, deficiencies: mergeStringList(next.deficiencies, value) };
        break;
      case 'skipTriggers':
        next = { ...next, skipTriggers: mergeStringList(next.skipTriggers, value) };
        break;
      case 'workHistory':
        next = { ...next, workHistory: mergeWorkHistory(next.workHistory, value) };
        break;
      case 'preferences.remoteOnly':
        if (typeof value === 'boolean') prefs = setPref(prefs, 'remoteOnly', value);
        break;
      case 'preferences.remotePreference':
        if (value === 'prefer_remote' || value === 'neutral' || value === 'prefer_onsite') {
          prefs = setPref(prefs, 'remotePreference', value);
        }
        break;
      case 'preferences.requireRelocationSubsidyOutsideMetros':
        if (typeof value === 'boolean') {
          prefs = setPref(prefs, 'requireRelocationSubsidyOutsideMetros', value);
        }
        break;
      case 'preferences.employmentPriority': {
        const parsed = z
          .array(
            z.enum([
              'permanent',
              'contract_to_hire',
              'long_contract',
              'short_contract',
              'part_time',
            ])
          )
          .safeParse(value);
        if (parsed.success) prefs = setPref(prefs, 'employmentPriority', parsed.data);
        break;
      }
      case 'preferences.minContractMonths':
        if (value === null || typeof value === 'number') {
          prefs = setPref(prefs, 'minContractMonths', value);
        }
        break;
      case 'preferences.clearancePolicy':
        if (value === 'ignore' || value === 'flag' || value === 'skip') {
          prefs = setPref(prefs, 'clearancePolicy', value);
        }
        break;
      case 'preferences.clearanceIncludePreferred':
        if (typeof value === 'boolean') {
          prefs = setPref(prefs, 'clearanceIncludePreferred', value);
        }
        break;
      case 'preferences.clearanceSkipUntil':
        if (typeof value === 'string') prefs = setPref(prefs, 'clearanceSkipUntil', value);
        break;
      case 'preferences.blockedEmployers':
        prefs = {
          ...prefs,
          blockedEmployers: mergeStringList(prefs.blockedEmployers, value),
        };
        break;
      case 'preferences.roleSkipCategories': {
        if (value && typeof value === 'object') {
          prefs = {
            ...prefs,
            roleSkipCategories: {
              ...DEFAULT_ROLE_SKIP_CATEGORIES,
              ...prefs.roleSkipCategories,
              ...(value as Record<string, boolean>),
            },
          };
        }
        break;
      }
      case 'preferences.flagShellEmployers':
        if (typeof value === 'boolean') prefs = setPref(prefs, 'flagShellEmployers', value);
        break;
      case 'preferences.flagPermNotices':
        if (typeof value === 'boolean') {
          prefs = setPref(prefs, 'flagPermNotices', value);
          next = { ...next, flagPermNotices: value };
        }
        break;
      case 'preferences.compensationMode':
        if (value === 'suspend_floors' || value === 'use_floors') {
          prefs = setPref(prefs, 'compensationMode', value);
        }
        break;
      case 'preferences.compensationMinUsd':
        if (value === null || typeof value === 'number') {
          prefs = setPref(prefs, 'compensationMinUsd', value);
        }
        break;
      case 'preferences.compensationMaxUsd':
        if (value === null || typeof value === 'number') {
          prefs = setPref(prefs, 'compensationMaxUsd', value);
        }
        break;
      case 'preferences.flagSuspiciousComp':
        if (typeof value === 'boolean') prefs = setPref(prefs, 'flagSuspiciousComp', value);
        break;
      case 'preferences.preferStructuredWork':
        if (typeof value === 'boolean') {
          prefs = setPref(prefs, 'preferStructuredWork', value);
        }
        break;
      case 'preferences.pipelineLoad':
        if (
          value === 'unset' ||
          value === 'light' ||
          value === 'moderate' ||
          value === 'heavy'
        ) {
          prefs = setPref(prefs, 'pipelineLoad', value);
        }
        break;
      case 'preferences.targetStartDate':
        if (typeof value === 'string') prefs = setPref(prefs, 'targetStartDate', value);
        break;
      case 'preferences.availableImmediately':
        if (typeof value === 'boolean') {
          prefs = setPref(prefs, 'availableImmediately', value);
        }
        break;
      case 'preferences.noticePeriodWeeks':
        if (value === null || typeof value === 'number') {
          prefs = setPref(prefs, 'noticePeriodWeeks', value);
        }
        break;
      default:
        break;
    }
  }

  next = { ...next, preferences: prefs };
  // Keep proficiencies synced from held claims when skillClaims changed.
  if (changes.some((c) => c.path === 'skillClaims')) {
    next = {
      ...next,
      proficiencies: next.skillClaims
        .filter((c) => c.standing === 'held' && c.skill.trim())
        .map((c) => c.skill.trim()),
    };
  }
  return next;
}
