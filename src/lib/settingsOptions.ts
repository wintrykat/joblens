import type {
  EmploymentPriority,
  RoleFamilyId,
  SkipCategoryId,
} from '../types/domain';

/** Claude API model IDs available as of 2026-07-13 (Anthropic Claude Platform). */
export type ClaudeModelOption = {
  id: string;
  label: string;
};

export const CLAUDE_MODELS: readonly ClaudeModelOption[] = [
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
] as const;

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';

/**
 * Education levels useful for JD matching across US, UK, IN, IE, AU, NZ, SE, NO, FI, CA.
 * Labels sorted alphabetically.
 */
export const EDUCATION_LEVELS: readonly string[] = [
  'A-Levels / Leaving Certificate / Secondary school diploma',
  'Associate degree / Foundation degree / Higher Certificate',
  'Bachelor of Arts (BA)',
  'Bachelor of Engineering (BEng / BE)',
  'Bachelor of Science (BSc / BS)',
  "Bachelor's degree (unspecified field)",
  'Doctorate (PhD / DPhil)',
  'High school diploma / Gymnasium / Upper secondary',
  'Master of Business Administration (MBA)',
  'Master of Engineering (MEng / ME)',
  'Master of Science (MSc / MS)',
  "Master's degree (unspecified field)",
  'No formal degree',
  'Postgraduate diploma / certificate (PGDip / PGCert)',
  'Professional licence / charter (PE, CPA, CEng, etc.)',
  'Some college / Incomplete bachelor\'s',
  'Trade / vocational / polytechnic diploma',
].sort((a, b) => a.localeCompare(b, 'en'));

/** Former skip-trigger text; now controlled by `flagPermNotices`. */
export const PERM_SKIP_TRIGGER =
  'Posting reads like a PERM labor-certification notice rather than a genuine open role';

export function isPermSkipTrigger(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('perm') && (t.includes('labor') || t.includes('labour') || t.includes('certification'));
}

/** Deprecated UI catalog; kept for prompt label lookups on legacy configs. */
export const ROLE_FAMILY_OPTIONS: ReadonlyArray<{ id: RoleFamilyId; label: string }> = [
  { id: 'software_eng', label: 'Software engineering' },
  { id: 'support_eng', label: 'Support / customer engineering' },
  { id: 'other', label: 'Other' },
];

export const EMPLOYMENT_PRIORITY_OPTIONS: ReadonlyArray<{
  id: EmploymentPriority;
  label: string;
}> = [
  { id: 'permanent', label: 'Permanent / full-time' },
  { id: 'contract_to_hire', label: 'Contract-to-hire' },
  { id: 'long_contract', label: 'Long contract' },
  { id: 'short_contract', label: 'Short contract / C2C' },
  { id: 'part_time', label: 'Part-time / hourly' },
];

export const SKIP_CATEGORY_OPTIONS: ReadonlyArray<{
  id: SkipCategoryId;
  label: string;
  hint: string;
}> = [
  {
    id: 'ml_training',
    label: 'Jobs whose main purpose is training ML / AI / LLMs',
    hint:
      'Flags postings where the work is building/training models (not a normal product or ops role that merely uses AI).',
  },
  {
    id: 'ai_live_tech_interview',
    label: 'Live AI technical deep-dive screens',
    hint: 'Flag or skip postings that advertise live AI-proctored technical interviews.',
  },
  {
    id: 'unverifiable_employer',
    label: 'Unverifiable employer',
    hint: 'Flag employers with no clear web presence or identity.',
  },
];

export const SHELL_EMPLOYER_SKIP_TRIGGER =
  'Employer appears thin, brand-new, or otherwise unverifiable (shell / scam heuristic)';

/** Category skip triggers injected when the matching preference toggle is on. */
export const SKIP_CATEGORY_TRIGGERS: Record<SkipCategoryId, string> = {
  ml_training:
    'Role\'s main purpose is training ML / AI / LLM models rather than a traditional applied product or ops job',
  ai_live_tech_interview:
    'Screening process includes a live AI technical deep-dive interview',
  unverifiable_employer:
    'Employer identity is thin, unverifiable, or reads like a shell company',
};
