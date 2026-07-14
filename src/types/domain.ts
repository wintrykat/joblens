import { z } from 'zod';

/** Confidence marker used across extraction and matching. */
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const WorkModelSchema = z.enum(['onsite', 'hybrid', 'remote', 'unclear']);
export type WorkModel = z.infer<typeof WorkModelSchema>;

export const TravelSchema = z.enum([
  'none',
  'occasional',
  'regular',
  'percent',
  'daily',
  'multi-daily',
  'unclear',
]);
export type Travel = z.infer<typeof TravelSchema>;

export const EmploymentTermsSchema = z.enum([
  'permanent',
  'contract',
  'short-term',
  'hourly',
  'gig',
  'unclear',
]);
export type EmploymentTerms = z.infer<typeof EmploymentTermsSchema>;

export const HealthInsuranceSchema = z.enum(['full', 'partial', 'none', 'unclear']);
export type HealthInsurance = z.infer<typeof HealthInsuranceSchema>;

export const MatchStatusSchema = z.enum(['match', 'partial', 'mismatch']);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const GeoVerdictSchema = z.enum(['eligible', 'excluded', 'unclear']);
export type GeoVerdict = z.infer<typeof GeoVerdictSchema>;

export const GeoMethodSchema = z.enum(['model', 'zip-haversine']);
export type GeoMethod = z.infer<typeof GeoMethodSchema>;

export const ThemePreferenceSchema = z.enum(['default', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const FitLabelSchema = z.enum([
  'Perfect fit',
  'Excellent fit',
  'Good fit',
  'Possible fit',
  'Unlikely fit',
  'Poor fit',
]);
export type FitLabel = z.infer<typeof FitLabelSchema>;

export const FitScoreSchema = z.union([
  z.literal(100),
  z.literal(95),
  z.literal(85),
  z.literal(75),
  z.literal(60),
  z.literal(0),
]);
export type FitScore = z.infer<typeof FitScoreSchema>;

/** Locked Fit label ↔ score pairs. */
export const FIT_LABEL_BY_SCORE: Record<FitScore, FitLabel> = {
  100: 'Perfect fit',
  95: 'Excellent fit',
  85: 'Good fit',
  75: 'Possible fit',
  60: 'Unlikely fit',
  0: 'Poor fit',
};

export const FIT_SCORE_BY_LABEL: Record<FitLabel, FitScore> = {
  'Perfect fit': 100,
  'Excellent fit': 95,
  'Good fit': 85,
  'Possible fit': 75,
  'Unlikely fit': 60,
  'Poor fit': 0,
};

export const ApplyVerdictSchema = z.enum(['yes', 'maybe', 'no']);
export type ApplyVerdict = z.infer<typeof ApplyVerdictSchema>;

export const FitRatingSchema = z
  .object({
    label: FitLabelSchema.default('Unlikely fit'),
    score: FitScoreSchema.default(60),
    rationale: z.string().default(''),
  })
  .transform((f) => {
    // Prefer label as source of truth when score disagrees.
    const score = FIT_SCORE_BY_LABEL[f.label] ?? f.score;
    return { label: FIT_LABEL_BY_SCORE[score], score, rationale: f.rationale };
  });
export type FitRating = z.infer<typeof FitRatingSchema>;

export const ApplyRatingSchema = z.object({
  verdict: ApplyVerdictSchema.default('maybe'),
  rationale: z.string().default(''),
});
export type ApplyRating = z.infer<typeof ApplyRatingSchema>;

export const DEFAULT_FIT: FitRating = {
  label: 'Unlikely fit',
  score: 60,
  rationale: '',
};

export const DEFAULT_APPLY: ApplyRating = {
  verdict: 'maybe',
  rationale: '',
};

export const LocationSchema = z.object({
  zip: z.string(),
  radiusMiles: z.number().finite().nonnegative(),
});
export type Location = z.infer<typeof LocationSchema>;

export const WorkHistoryEntrySchema = z.object({
  org: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  description: z.string(),
});
export type WorkHistoryEntry = z.infer<typeof WorkHistoryEntrySchema>;

export const ExtractedSkillSchema = z.object({
  skill: z.string(),
  years: z.number().finite().nonnegative(),
  source: z.string(),
  confidence: ConfidenceSchema,
});
export type ExtractedSkill = z.infer<typeof ExtractedSkillSchema>;

/** How the seeker treats a skill when matching postings. */
export const SkillStandingSchema = z.enum(['held', 'ramp', 'never_claim']);
export type SkillStanding = z.infer<typeof SkillStandingSchema>;

export const SkillClaimSchema = z.object({
  skill: z.string(),
  standing: SkillStandingSchema.default('held'),
  years: z.number().finite().nonnegative().optional(),
  lastUsed: z.string().optional(),
  scopeNote: z.string().optional(),
  confidence: ConfidenceSchema.optional(),
});
export type SkillClaim = z.infer<typeof SkillClaimSchema>;

export const RemotePreferenceSchema = z.enum([
  'prefer_remote',
  'neutral',
  'prefer_onsite',
]);
export type RemotePreference = z.infer<typeof RemotePreferenceSchema>;

export const ClearancePolicySchema = z.enum(['ignore', 'flag', 'skip']);
export type ClearancePolicy = z.infer<typeof ClearancePolicySchema>;

export const CompensationModeSchema = z.enum(['suspend_floors', 'use_floors']);
export type CompensationMode = z.infer<typeof CompensationModeSchema>;

export const PipelineLoadSchema = z.enum(['unset', 'light', 'moderate', 'heavy']);
export type PipelineLoad = z.infer<typeof PipelineLoadSchema>;

/** Ordered employment preference ids (not masthead posting enums). */
export const EmploymentPrioritySchema = z.enum([
  'permanent',
  'contract_to_hire',
  'long_contract',
  'short_contract',
  'part_time',
]);
export type EmploymentPriority = z.infer<typeof EmploymentPrioritySchema>;

export const ROLE_FAMILY_IDS = [
  'software_eng',
  'support_eng',
  'other',
] as const;
export type RoleFamilyId = (typeof ROLE_FAMILY_IDS)[number];

export const SKIP_CATEGORY_IDS = [
  'ml_training',
  'ai_live_tech_interview',
  'unverifiable_employer',
] as const;
export type SkipCategoryId = (typeof SKIP_CATEGORY_IDS)[number];

const RoleSkipCategoriesSchema = z
  .record(z.string(), z.boolean())
  .default({})
  .transform((raw) => {
    const out = {} as Record<SkipCategoryId, boolean>;
    for (const id of SKIP_CATEGORY_IDS) {
      out[id] = Boolean(raw[id]);
    }
    return out;
  });

export const DEFAULT_ROLE_SKIP_CATEGORIES: Record<SkipCategoryId, boolean> = {
  ml_training: false,
  ai_live_tech_interview: false,
  unverifiable_employer: false,
};

export const PreferencesSchema = z.object({
  roleFamilies: z.array(z.string()).default([]),
  remotePreference: RemotePreferenceSchema.default('neutral'),
  /** When true, onsite/hybrid roles are hard-skipped (geo intent without ZIPs). */
  remoteOnly: z.boolean().default(false),
  requireRelocationSubsidyOutsideMetros: z.boolean().default(false),
  employmentPriority: z.array(EmploymentPrioritySchema).default([]),
  minContractMonths: z.number().finite().nonnegative().nullable().default(null),
  clearancePolicy: ClearancePolicySchema.default('ignore'),
  clearanceIncludePreferred: z.boolean().default(false),
  clearanceSkipUntil: z.string().default(''),
  blockedEmployers: z.array(z.string()).default([]),
  roleSkipCategories: RoleSkipCategoriesSchema,
  flagShellEmployers: z.boolean().default(false),
  flagPermNotices: z.boolean().default(true),
  compensationMode: CompensationModeSchema.default('suspend_floors'),
  compensationMinUsd: z.number().finite().nonnegative().nullable().default(null),
  compensationMaxUsd: z.number().finite().nonnegative().nullable().default(null),
  flagSuspiciousComp: z.boolean().default(false),
  preferStructuredWork: z.boolean().default(false),
  pipelineLoad: PipelineLoadSchema.default('unset'),
  targetStartDate: z.string().default(''),
  availableImmediately: z.boolean().default(false),
  noticePeriodWeeks: z.number().finite().nonnegative().nullable().default(null),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = PreferencesSchema.parse({});

export const EMPTY_MASTHEAD = {
  organization: '',
  title: '',
  workModel: 'unclear' as const,
  travel: 'unclear' as const,
  employmentTerms: 'unclear' as const,
  healthInsurance: 'unclear' as const,
  payRange: '',
  seniority: '',
  workAuthorization: '',
};

export const MastheadSchema = z.object({
  organization: z.string().default(''),
  title: z.string().default(''),
  workModel: WorkModelSchema.or(z.string()).default('unclear'),
  travel: TravelSchema.or(z.string()).default('unclear'),
  employmentTerms: EmploymentTermsSchema.or(z.string()).default('unclear'),
  healthInsurance: HealthInsuranceSchema.or(z.string()).default('unclear'),
  payRange: z.string().default(''),
  seniority: z.string().default(''),
  workAuthorization: z.string().default(''),
  /** Optional free-text location some models emit; used for geo ZIP extraction. */
  location: z.string().optional(),
});
export type Masthead = z.infer<typeof MastheadSchema>;

export const GeoResultSchema = z.object({
  verdict: GeoVerdictSchema,
  reason: z.string().default(''),
  method: GeoMethodSchema.optional(),
  postingZip: z.string().nullable().optional(),
  nearestOperatorZip: z.string().optional(),
  distanceMiles: z.number().finite().nullable().optional(),
});
export type GeoResult = z.infer<typeof GeoResultSchema>;

export const SkillMatchSchema = z.object({
  requirement: z.string(),
  status: MatchStatusSchema,
  evidence: z.string().default(''),
  reason: z.string().default(''),
  confidence: ConfidenceSchema,
});
export type SkillMatch = z.infer<typeof SkillMatchSchema>;

export const DealbreakerSchema = z.object({
  requirement: z.string(),
  evidence: z.string().default(''),
  reason: z.string().default(''),
});
export type Dealbreaker = z.infer<typeof DealbreakerSchema>;

export const SkipFlagSchema = z.object({
  trigger: z.string(),
  evidence: z.string().default(''),
});
export type SkipFlag = z.infer<typeof SkipFlagSchema>;

/** Raw model analysis shape — coerced/normalized via parseAnalysis. */
export const AnalysisSchema = z.object({
  masthead: MastheadSchema.default(EMPTY_MASTHEAD),
  geo: GeoResultSchema.optional(),
  skillMatches: z.array(SkillMatchSchema).default([]),
  dealbreakers: z.array(DealbreakerSchema).default([]),
  skipFlags: z.array(SkipFlagSchema).default([]),
  postingSmell: z.string().default(''),
  declutteredJD: z.string().default(''),
  fit: FitRatingSchema.default(DEFAULT_FIT),
  apply: ApplyRatingSchema.default(DEFAULT_APPLY),
  /** Defensive: some model outputs put workModel at the top level. */
  workModel: WorkModelSchema.or(z.string()).optional(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const EMPTY_ANALYSIS: Analysis = AnalysisSchema.parse({});

export const ExtractionResultSchema = z.object({
  skills: z.array(ExtractedSkillSchema).default([]),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const BookmarkSchema = z.object({
  url: z.string().min(1),
  company: z.string().default(''),
  title: z.string().default(''),
  savedAt: z.string().default(''),
  board: z.string().default(''),
  analysis: AnalysisSchema.default(EMPTY_ANALYSIS),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const ConfigSchema = z.object({
  apiKey: z.string().default(''),
  model: z.string().min(1),
  education: z.string().default(''),
  /** Free-text work-authorization note for matching (no personal identity required). */
  workAuthorizationNote: z.string().default(''),
  locations: z.array(LocationSchema).default([]),
  workEligibleRegions: z.array(z.string()).default([]),
  proficiencies: z.array(z.string()).default([]),
  deficiencies: z.array(z.string()).default([]),
  /** Structured skill honesty (held / ramp / never-claim). */
  skillClaims: z.array(SkillClaimSchema).default([]),
  workHistory: z.array(WorkHistoryEntrySchema).default([]),
  extractedSkills: z.array(ExtractedSkillSchema).default([]),
  skipTriggers: z.array(z.string()).default([]),
  /**
   * Legacy top-level PERM flag. Synced with preferences.flagPermNotices.
   * Prefer preferences.flagPermNotices going forward.
   */
  flagPermNotices: z.boolean().default(true),
  preferences: PreferencesSchema.default(DEFAULT_PREFERENCES),
  /** Appearance: default follows Chrome/OS prefers-color-scheme; light/dark force. */
  theme: ThemePreferenceSchema.default('default'),
  // Soft-parse bookmarks so a single corrupt row cannot brick Options.
  bookmarks: z
    .array(z.unknown())
    .default([])
    .transform((rows) =>
      rows.flatMap((row) => {
        const parsed = BookmarkSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      })
    ),
});
export type Config = z.infer<typeof ConfigSchema>;

export const TRIAGE_JSON_SCHEMA = 'joblens.triage/v1' as const;

export const TriageExportSchema = z.object({
  schema: z.literal(TRIAGE_JSON_SCHEMA),
  exportedAt: z.string(),
  url: z.string(),
  board: z.string(),
  company: z.string(),
  title: z.string(),
  savedAt: z.string().nullable(),
  masthead: z.object({
    organization: z.string(),
    title: z.string(),
    workModel: z.string(),
    travel: z.string(),
    employmentTerms: z.string(),
    healthInsurance: z.string(),
    payRange: z.string(),
    seniority: z.string(),
    workAuthorization: z.string(),
  }),
  geo: z
    .object({
      verdict: GeoVerdictSchema,
      reason: z.string(),
      method: z.string(),
      postingZip: z.string().nullable(),
      distanceMiles: z.number().nullable(),
    })
    .nullable(),
  dealbreakers: z.array(DealbreakerSchema),
  skipFlags: z.array(SkipFlagSchema),
  skillMatches: z.array(SkillMatchSchema),
  postingSmell: z.string(),
  declutteredJD: z.string(),
  fit: FitRatingSchema,
  apply: ApplyRatingSchema,
});
export type TriageExport = z.infer<typeof TriageExportSchema>;

export type DeterministicGeo = {
  verdict: Exclude<GeoVerdict, 'unclear'>;
  reason: string;
  method: 'zip-haversine';
  postingZip: string | null;
  nearestOperatorZip: string;
  distanceMiles: number;
};

export type BoardId =
  | 'builtin'
  | 'ziprecruiter'
  | 'indeed'
  | 'linkedin'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'dice'
  | 'remotive'
  | 'weworkremotely'
  | 'monster'
  | 'himalayas'
  | 'workintexas'
  | 'wellfound'
  | 'capps'
  | 'roberthalf'
  | 'cybercoders'
  | 'usps'
  | 'apple'
  | 'google'
  | 'meta'
  | 'microsoft'
  | 'hackernews';

export type Board = {
  id: BoardId;
  name: string;
  matchPatterns: readonly string[];
  isPostingUrl?: (url: string) => boolean;
  /** DOM-aware gate for split-pane SPAs where URL alone is not enough. */
  isScannableJob?: (doc: Document, url: string) => boolean;
  /** Canonical/bookmark URL when location.href is still a SERP. */
  resolveJobUrl?: (doc: Document, url: string) => string;
  extractPageText?: (doc?: Document) => string;
  notes?: string;
};

export type PanelController = {
  runScan?: () => void | Promise<void>;
  openLauncher?: () => void;
};

export type PanelUiState = 'idle' | 'loading' | 'result' | 'error';

export type LatLng = readonly [number, number];
export type ZipCentroids = Readonly<Record<string, LatLng>>;
