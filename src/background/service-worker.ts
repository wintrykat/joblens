import { z } from 'zod';
import { getConfig } from '../lib/storage';
import { callClaude, parseJsonResponse } from '../lib/anthropic';
import {
  EXTRACTION_SYSTEM,
  buildExtractionUser,
  ANALYSIS_SYSTEM,
  buildAnalysisUser,
} from '../lib/prompts';
import { applyDeterministicGeo, computeDeterministicGeo } from '../lib/geo';
import { applyRatingFloors } from '../lib/ratings';
import {
  AnalyzeJdRequestSchema,
  ExtractSkillsRequestSchema,
  OpenSidePanelRequestSchema,
  parseAnalysisPayload,
  parseExtractedSkills,
  type AnalyzeJdSuccessData,
  type ExtractSkillsSuccessData,
} from '../types/messages';

const BackgroundRequestSchema = z.discriminatedUnion('type', [
  ExtractSkillsRequestSchema,
  AnalyzeJdRequestSchema,
]);

void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => {
    console.warn('JobLens: setPanelBehavior failed', err);
  });

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const openReq = OpenSidePanelRequestSchema.safeParse(msg);
  if (openReq.success) {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: 'No tab for side panel open.' });
      return false;
    }
    const startScan = openReq.data.startScan !== false;
    // Call open() synchronously so the content-script user gesture is preserved.
    try {
      if (startScan) {
        void chrome.storage.session.set({ pendingScan: true, pendingScanTabId: tabId });
      }
      void chrome.sidePanel.open({ tabId }).then(
        () => sendResponse({ ok: true, data: { opened: true } }),
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error: message });
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message });
    }
    return true;
  }

  handle(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message });
    });
  return true;
});

async function handle(
  raw: unknown
): Promise<ExtractSkillsSuccessData | AnalyzeJdSuccessData> {
  const parsed = BackgroundRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unknown or invalid message: ${parsed.error.message}`);
  }
  const msg = parsed.data;
  const cfg = await getConfig();

  if (msg.type === 'EXTRACT_SKILLS') {
    // Sonnet 5 adaptive thinking defaults to high effort and counts against
    // max_tokens — 2048 was mostly consumed by thinking, truncating the JSON.
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
  analysis = applyRatingFloors(analysis);
  return { analysis };
}
