/**
 * Background message pipeline (testable; no chrome listener side effects).
 */

import { z } from 'zod';
import { getConfig, hasGeoIntent } from './storage';
import { callClaude, parseJsonResponse } from './anthropic';
import {
  EXTRACTION_SYSTEM,
  buildExtractionUser,
  ANALYSIS_SYSTEM,
  buildAnalysisUser,
  CONFIG_PROPOSE_SYSTEM,
  buildConfigProposeUser,
  PREFLIGHT_SYSTEM,
  buildPreflightUser,
  buildPreflightHardGates,
} from './prompts';
import { applyDeterministicGeo, computeDeterministicGeo } from './geo';
import { applyRatingFloors } from './ratings';
import {
  mergePreflightResults,
  runLocalPreflight,
  shouldSkipHaiku,
  truncateForPreflight,
  sanitizeHaikuResidencySkip,
  humanizePreflightReasons,
} from './preflight';
import { PREFLIGHT_CLAUDE_MODEL } from './settingsOptions';
import { parseConfigProposal, sanitizeConfigForPropose } from './docImport';
import {
  AnalyzeJdRequestSchema,
  ExtractSkillsRequestSchema,
  ProposeConfigFromDocsRequestSchema,
  PreflightJdRequestSchema,
  parseAnalysisPayload,
  parseExtractedSkills,
  parsePreflightPayload,
  type AnalyzeJdSuccessData,
  type ExtractSkillsSuccessData,
  type PreflightJdSuccessData,
  type ProposeConfigFromDocsSuccessData,
} from '../types/messages';

const BackgroundRequestSchema = z.discriminatedUnion('type', [
  ExtractSkillsRequestSchema,
  AnalyzeJdRequestSchema,
  ProposeConfigFromDocsRequestSchema,
  PreflightJdRequestSchema,
]);

export type BackgroundHandleResult =
  | ExtractSkillsSuccessData
  | AnalyzeJdSuccessData
  | ProposeConfigFromDocsSuccessData
  | PreflightJdSuccessData;

export async function handleBackgroundRequest(raw: unknown): Promise<BackgroundHandleResult> {
  const parsed = BackgroundRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unknown or invalid message: ${parsed.error.message}`);
  }
  const msg = parsed.data;
  const cfg = await getConfig();

  if (msg.type === 'EXTRACT_SKILLS') {
    const text = await callClaude({
      apiKey: cfg.apiKey,
      model: cfg.model,
      system: EXTRACTION_SYSTEM,
      user: buildExtractionUser(msg.workHistory ?? cfg.workHistory),
      maxTokens: 8192,
      thinking: 'disabled',
    });
    const json = parseJsonResponse(text);
    return { skills: parseExtractedSkills(json) };
  }

  if (msg.type === 'PROPOSE_CONFIG_FROM_DOCS') {
    const text = await callClaude({
      apiKey: cfg.apiKey,
      model: cfg.model,
      system: CONFIG_PROPOSE_SYSTEM,
      user: buildConfigProposeUser({
        documentText: msg.documentText,
        truncated: Boolean(msg.truncated),
        currentConfigJson: JSON.stringify(sanitizeConfigForPropose(cfg), null, 2),
      }),
      maxTokens: 12288,
      thinking: 'disabled',
    });
    const proposal = parseConfigProposal(parseJsonResponse(text));
    return proposal;
  }

  if (msg.type === 'PREFLIGHT_JD') {
    if (!cfg.apiKey.trim()) {
      throw new Error('Add an Anthropic API key in Options before preflight.');
    }
    if (!hasGeoIntent(cfg)) {
      throw new Error(
        'Set geography intent in Options (ZIP, region, or remote-only) before preflight.'
      );
    }

    const local = runLocalPreflight({
      cfg,
      pageText: msg.pageText || '',
      pageTitle: msg.pageTitle || '',
    });

    const forceHaiku = Boolean(msg.forceHaiku);
    // Local hard_skip is decisive; hybrid stays local until Quick check forces Haiku.
    if (local.verdict === 'hard_skip') {
      return {
        preflight: { ...local, reasons: humanizePreflightReasons(local.reasons) },
      };
    }
    if (!forceHaiku && cfg.preflightMode === 'hybrid') {
      return {
        preflight: { ...local, reasons: humanizePreflightReasons(local.reasons) },
      };
    }
    if (!forceHaiku && shouldSkipHaiku(local, cfg)) {
      return {
        preflight: { ...local, reasons: humanizePreflightReasons(local.reasons) },
      };
    }

    const truncated = truncateForPreflight(msg.pageText || '');
    const text = await callClaude({
      apiKey: cfg.apiKey,
      model: PREFLIGHT_CLAUDE_MODEL,
      system: PREFLIGHT_SYSTEM,
      user: buildPreflightUser({
        hardGatesJson: JSON.stringify(buildPreflightHardGates(cfg), null, 2),
        url: msg.url,
        pageText: truncated,
        localHintJson: JSON.stringify(local),
      }),
      maxTokens: 1024,
      thinking: 'disabled',
    });
    const haiku = parsePreflightPayload(parseJsonResponse(text));
    const merged = mergePreflightResults(local, haiku);
    const sanitized = sanitizeHaikuResidencySkip(merged, msg.pageText || '', {
      local,
      workEligibleRegions: cfg.workEligibleRegions,
    });
    return {
      preflight: {
        ...sanitized,
        reasons: humanizePreflightReasons(sanitized.reasons),
      },
    };
  }

  const geoHint = computeDeterministicGeo({
    locations: cfg.locations,
    pageText: msg.pageText || '',
  });
  const text = await callClaude({
    apiKey: cfg.apiKey,
    model: cfg.model,
    system: ANALYSIS_SYSTEM,
    user: buildAnalysisUser({
      profile: cfg,
      url: msg.url,
      pageText: msg.pageText,
      geoHint,
    }),
    maxTokens: 16384,
    thinking: 'adaptive',
    effort: 'medium',
  });
  let analysis = parseAnalysisPayload(parseJsonResponse(text));
  analysis = applyDeterministicGeo(analysis, {
    locations: cfg.locations,
    pageText: msg.pageText || '',
  });
  analysis = applyRatingFloors(analysis, cfg);
  return { analysis };
}
