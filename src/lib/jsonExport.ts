import type { Analysis, TriageExport } from '../types/domain';
import { TRIAGE_JSON_SCHEMA } from '../types/domain';

export type ExportMeta = {
  url?: string;
  board?: string;
  company?: string;
  title?: string;
  savedAt?: string | null;
};

export function analysisToJson(
  analysis: Analysis | null | undefined,
  meta: ExportMeta = {}
): TriageExport {
  const m = analysis?.masthead;
  return {
    schema: TRIAGE_JSON_SCHEMA,
    exportedAt: new Date().toISOString(),
    url: meta.url ?? '',
    board: meta.board ?? '',
    company: meta.company || m?.organization || '',
    title: meta.title || m?.title || '',
    savedAt: meta.savedAt ?? null,
    masthead: {
      organization: m?.organization ?? '',
      title: m?.title ?? '',
      workModel: String(m?.workModel ?? ''),
      travel: String(m?.travel ?? ''),
      employmentTerms: String(m?.employmentTerms ?? ''),
      healthInsurance: String(m?.healthInsurance ?? ''),
      payRange: m?.payRange ?? '',
      seniority: m?.seniority ?? '',
      workAuthorization: m?.workAuthorization ?? '',
    },
    geo: analysis?.geo
      ? {
          verdict: analysis.geo.verdict,
          reason: analysis.geo.reason || '',
          method: analysis.geo.method || 'model',
          postingZip: analysis.geo.postingZip ?? null,
          distanceMiles: analysis.geo.distanceMiles ?? null,
        }
      : null,
    dealbreakers: analysis?.dealbreakers ?? [],
    skipFlags: analysis?.skipFlags ?? [],
    skillMatches: (analysis?.skillMatches ?? []).map((s) => ({
      requirement: s.requirement,
      status: s.status,
      confidence: s.confidence,
      reason: s.reason || '',
      evidence: s.evidence || '',
    })),
    postingSmell: analysis?.postingSmell ?? '',
    declutteredJD: analysis?.declutteredJD ?? '',
    fit: analysis?.fit ?? { label: 'Unlikely fit', score: 60, rationale: '' },
    apply: analysis?.apply ?? { verdict: 'maybe', rationale: '' },
  };
}

export function analysisToJsonString(
  analysis: Analysis | null | undefined,
  meta: ExportMeta = {},
  pretty = true
): string {
  return JSON.stringify(analysisToJson(analysis, meta), null, pretty ? 2 : 0);
}
