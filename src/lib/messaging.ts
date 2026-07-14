import type {
  AnalyzeJdRequest,
  AnalyzeJdSuccessData,
  ExtensionRequest,
  ExtensionResponse,
  ExtractSkillsRequest,
  ExtractSkillsSuccessData,
  GetPageTextSuccessData,
  OpenSidePanelRequest,
  PreflightJdRequest,
  PreflightJdSuccessData,
  ProposeConfigFromDocsSuccessData,
} from '../types/messages';
import {
  isExtensionFailure,
  isExtensionSuccess,
  isOkResponse,
} from '../types/messages';
import { boardDisplayNames } from './boards';

function sendMessage<TReq extends ExtensionRequest, TData>(
  message: TReq
): Promise<ExtensionResponse<TData>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res: unknown) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message || 'Extension messaging failed.',
        });
        return;
      }
      if (isExtensionSuccess<TData>(res) || isExtensionFailure(res)) {
        resolve(res);
        return;
      }
      resolve({ ok: false, error: 'Malformed extension response.' });
    });
  });
}

export function extractSkills(
  req: Omit<ExtractSkillsRequest, 'type'> & { type?: 'EXTRACT_SKILLS' } = {}
): Promise<ExtensionResponse<ExtractSkillsSuccessData>> {
  return sendMessage({ type: 'EXTRACT_SKILLS', ...req });
}

export function analyzeJd(
  req: Omit<AnalyzeJdRequest, 'type'>
): Promise<ExtensionResponse<AnalyzeJdSuccessData>> {
  return sendMessage({ type: 'ANALYZE_JD', ...req });
}

export function preflightJd(
  req: Omit<PreflightJdRequest, 'type'>
): Promise<ExtensionResponse<PreflightJdSuccessData>> {
  return sendMessage({ type: 'PREFLIGHT_JD', ...req });
}

export function proposeConfigFromDocs(req: {
  documentText: string;
  truncated?: boolean;
}): Promise<ExtensionResponse<ProposeConfigFromDocsSuccessData>> {
  return sendMessage({
    type: 'PROPOSE_CONFIG_FROM_DOCS',
    documentText: req.documentText,
    truncated: req.truncated,
  });
}

export function openSidePanel(
  opts: { startScan?: boolean } = {}
): Promise<ExtensionResponse<{ opened: true }>> {
  const message: OpenSidePanelRequest = {
    type: 'OPEN_SIDE_PANEL',
    startScan: opts.startScan,
  };
  return sendMessage(message);
}

export function getPageTextFromTab(
  tabId: number
): Promise<ExtensionResponse<GetPageTextSuccessData>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' }, (res: unknown) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error:
            chrome.runtime.lastError.message ||
            `JobLens is not active on this page. Supported: ${boardDisplayNames()}. Open a posting URL, not a search list.`,
        });
        return;
      }
      if (isExtensionFailure(res) || isExtensionSuccess<GetPageTextSuccessData>(res)) {
        resolve(res);
        return;
      }
      resolve({ ok: false, error: 'Malformed content-script response.' });
    });
  });
}

/** @deprecated Prefer openSidePanel; kept for any leftover callers. */
export function runScanOnTab(
  tabId: number
): Promise<ExtensionResponse<{ started: true }>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'RUN_SCAN' }, (res: unknown) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message || 'No content script on this page.',
        });
        return;
      }
      if (isExtensionFailure(res)) {
        resolve(res);
        return;
      }
      if (isOkResponse(res)) {
        resolve({ ok: true, data: { started: true } });
        return;
      }
      resolve({ ok: false, error: 'Malformed content-script response.' });
    });
  });
}
