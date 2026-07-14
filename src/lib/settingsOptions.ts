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
