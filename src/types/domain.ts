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
  locations: z.array(LocationSchema).default([]),
  workEligibleRegions: z.array(z.string()).default([]),
  proficiencies: z.array(z.string()).default([]),
  deficiencies: z.array(z.string()).default([]),
  workHistory: z.array(WorkHistoryEntrySchema).default([]),
  extractedSkills: z.array(ExtractedSkillSchema).default([]),
  skipTriggers: z.array(z.string()).default([]),
  /** When true, analyzer flags PERM labor-certification notices as skip triggers. */
  flagPermNotices: z.boolean().default(true),
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
