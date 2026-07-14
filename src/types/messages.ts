import { z } from 'zod';
import type { Analysis, ExtractedSkill, PreflightResult } from './domain';
import {
  AnalysisSchema,
  ExtractedSkillSchema,
  PreflightResultSchema,
  WorkHistoryEntrySchema,
} from './domain';

export const ExtractSkillsRequestSchema = z.object({
  type: z.literal('EXTRACT_SKILLS'),
  workHistory: z.array(WorkHistoryEntrySchema).optional(),
});
export type ExtractSkillsRequest = z.infer<typeof ExtractSkillsRequestSchema>;

export const AnalyzeJdRequestSchema = z.object({
  type: z.literal('ANALYZE_JD'),
  url: z.string().min(1),
  pageText: z.string(),
});
export type AnalyzeJdRequest = z.infer<typeof AnalyzeJdRequestSchema>;

export const RunScanRequestSchema = z.object({
  type: z.literal('RUN_SCAN'),
});
export type RunScanRequest = z.infer<typeof RunScanRequestSchema>;

export const GetPageTextRequestSchema = z.object({
  type: z.literal('GET_PAGE_TEXT'),
});
export type GetPageTextRequest = z.infer<typeof GetPageTextRequestSchema>;

export const OpenSidePanelRequestSchema = z.object({
  type: z.literal('OPEN_SIDE_PANEL'),
  startScan: z.boolean().optional(),
});
export type OpenSidePanelRequest = z.infer<typeof OpenSidePanelRequestSchema>;

export const ProposeConfigFromDocsRequestSchema = z.object({
  type: z.literal('PROPOSE_CONFIG_FROM_DOCS'),
  documentText: z.string().min(1),
  truncated: z.boolean().optional(),
});
export type ProposeConfigFromDocsRequest = z.infer<
  typeof ProposeConfigFromDocsRequestSchema
>;

export const PreflightJdRequestSchema = z.object({
  type: z.literal('PREFLIGHT_JD'),
  url: z.string().min(1),
  pageText: z.string(),
  pageTitle: z.string().optional(),
  /** When true, always call Haiku after local (Quick check). When false, auto may skip Haiku. */
  forceHaiku: z.boolean().optional(),
});
export type PreflightJdRequest = z.infer<typeof PreflightJdRequestSchema>;

export const ExtensionRequestSchema = z.discriminatedUnion('type', [
  ExtractSkillsRequestSchema,
  AnalyzeJdRequestSchema,
  RunScanRequestSchema,
  GetPageTextRequestSchema,
  OpenSidePanelRequestSchema,
  ProposeConfigFromDocsRequestSchema,
  PreflightJdRequestSchema,
]);
export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

export type ExtractSkillsSuccessData = { skills: ExtractedSkill[] };
export type AnalyzeJdSuccessData = { analysis: Analysis };
export type PreflightJdSuccessData = { preflight: PreflightResult };
export type GetPageTextSuccessData = {
  url: string;
  pageText: string;
  boardId: string;
  boardName: string;
  title: string;
};
export type ProposeConfigFromDocsSuccessData = {
  summary: string;
  changes: Array<{
    id: string;
    path: string;
    label: string;
    rationale: string;
    value?: unknown;
  }>;
};

export type ExtensionSuccess<T> = { ok: true; data: T };
export type ExtensionFailure = { ok: false; error: string };
export type ExtensionResponse<T> = ExtensionSuccess<T> | ExtensionFailure;

export function isExtensionFailure(res: unknown): res is ExtensionFailure {
  return (
    typeof res === 'object' &&
    res !== null &&
    'ok' in res &&
    (res as { ok: unknown }).ok === false
  );
}

export function isExtensionSuccess<T>(res: unknown): res is ExtensionSuccess<T> {
  return (
    typeof res === 'object' &&
    res !== null &&
    'ok' in res &&
    (res as { ok: unknown }).ok === true &&
    'data' in res
  );
}

/** Content-script RUN_SCAN may reply `{ ok: true }` without a `data` payload. */
export function isOkResponse(res: unknown): res is { ok: true; data?: unknown } {
  return (
    typeof res === 'object' &&
    res !== null &&
    'ok' in res &&
    (res as { ok: unknown }).ok === true
  );
}

export function parseExtractedSkills(raw: unknown): ExtractedSkill[] {
  const candidate = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && 'skills' in raw
      ? (raw as { skills: unknown }).skills
      : [];

  const skills = z.array(ExtractedSkillSchema).safeParse(candidate);
  if (skills.success) return skills.data;

  const loose = z
    .array(
      z.object({
        skill: z.string().default(''),
        years: z.coerce.number().finite().nonnegative().default(0),
        source: z.string().default(''),
        confidence: z.enum(['high', 'medium', 'low']).default('low'),
      })
    )
    .safeParse(candidate);
  if (!loose.success) {
    throw new Error(`Invalid skills payload: ${loose.error.message}`);
  }
  return loose.data;
}

export function parseAnalysisPayload(raw: unknown): Analysis {
  const parsed = AnalysisSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid analysis payload: ${parsed.error.message}`);
}

export function parsePreflightPayload(raw: unknown): PreflightResult {
  const candidate =
    raw && typeof raw === 'object' && 'verdict' in raw
      ? raw
      : raw && typeof raw === 'object' && 'preflight' in raw
        ? (raw as { preflight: unknown }).preflight
        : raw;

  const loose = z
    .object({
      verdict: z.enum(['clear', 'soft', 'hard_skip', 'unknown']).default('unknown'),
      reasons: z.array(z.string()).default([]),
      workModel: z.string().optional(),
      workModelHint: z.string().optional(),
      organization: z.string().optional(),
      orgHint: z.string().optional(),
      geoNote: z.string().optional(),
      flags: z.array(z.string()).default([]),
      sources: z.array(z.enum(['local', 'haiku'])).optional(),
    })
    .safeParse(candidate);

  if (!loose.success) {
    throw new Error(`Invalid preflight payload: ${loose.error.message}`);
  }

  const d = loose.data;
  const parsed = PreflightResultSchema.safeParse({
    verdict: d.verdict,
    reasons: d.reasons,
    sources: d.sources ?? ['haiku'],
    workModelHint: d.workModelHint || d.workModel,
    orgHint: d.orgHint || d.organization,
    geoNote: d.geoNote,
    flags: d.flags,
  });
  if (!parsed.success) {
    throw new Error(`Invalid preflight payload: ${parsed.error.message}`);
  }
  return parsed.data;
}
