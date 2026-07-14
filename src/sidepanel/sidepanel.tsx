import { useCallback, useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { boardDisplayNames } from '../lib/boards';
import { analysisToJsonString } from '../lib/jsonExport';
import { analysisToMarkdown } from '../lib/markdown';
import { analyzeJd, getPageTextFromTab } from '../lib/messaging';
import { addBookmark, getConfig, isBookmarked } from '../lib/storage';
import { watchThemeFromConfig } from '../lib/theme';
import type { Analysis, PanelUiState } from '../types/domain';
import { TriagePanel } from '../ui/TriagePanel';
import '../ui/triagePanel.css';

type PageMeta = {
  url: string;
  boardId: string;
  boardName: string;
  title: string;
};

function SidePanelApp(): JSX.Element {
  const [state, setState] = useState<PanelUiState>('idle');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [page, setPage] = useState<PageMeta | null>(null);

  const runScan = useCallback(async (): Promise<void> => {
    setState('loading');
    setError('');
    setCopied(false);
    setCopiedJson(false);

    const cfg = await getConfig();
    if (!cfg.apiKey) {
      setState('error');
      setError('No API key set. Open Options below and add one.');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setState('error');
      setError('No active tab.');
      return;
    }

    const pageRes = await getPageTextFromTab(tab.id);
    if (!pageRes.ok) {
      setState('error');
      setError(
        pageRes.error ||
          `JobLens is not active on this page. Supported: ${boardDisplayNames()}. Open a posting URL, not a search list.`
      );
      setPage(null);
      return;
    }

    const { url, pageText, boardId, boardName, title } = pageRes.data;
    setPage({ url, boardId, boardName, title });

    const res = await analyzeJd({ url, pageText });
    if (!res.ok) {
      setState('error');
      setError(res.error || 'Scan failed.');
      return;
    }

    setAnalysis(res.data.analysis);
    setState('result');
    setSaved(await isBookmarked(url));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const maybeStartPendingScan = async (): Promise<void> => {
      const session = await chrome.storage.session.get(['pendingScan']);
      if (!session.pendingScan || cancelled) return;
      await chrome.storage.session.remove(['pendingScan', 'pendingScanTabId']);
      if (!cancelled) await runScan();
    };

    void maybeStartPendingScan();

    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ): void => {
      if (area !== 'session' || !changes.pendingScan?.newValue) return;
      void maybeStartPendingScan();
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, [runScan]);

  useEffect(() => watchThemeFromConfig(), []);

  // Clear results when the active tab navigates away from the scanned URL.
  useEffect(() => {
    const onUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ): void => {
      if (!page || changeInfo.url == null) return;
      void chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
        if (active?.id === tabId && tab.url && tab.url !== page.url) {
          setAnalysis(null);
          setPage(null);
          setState('idle');
          setError('');
        }
      });
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => chrome.tabs.onUpdated.removeListener(onUpdated);
  }, [page]);

  const onBookmark = async (): Promise<void> => {
    if (!analysis || !page) return;
    const m = analysis.masthead;
    await addBookmark({
      url: page.url,
      company: m.organization || '',
      title: m.title || page.title,
      savedAt: new Date().toISOString(),
      board: page.boardId,
      analysis,
    });
    setSaved(true);
  };

  const onCopy = async (): Promise<void> => {
    if (!page) return;
    await navigator.clipboard.writeText(analysisToMarkdown(analysis, page.url));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onCopyJson = async (): Promise<void> => {
    if (!page) return;
    const m = analysis?.masthead;
    await navigator.clipboard.writeText(
      analysisToJsonString(analysis, {
        url: page.url,
        board: page.boardId,
        company: m?.organization || '',
        title: m?.title || page.title,
      })
    );
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1500);
  };

  return (
    <TriagePanel
      boardName={page?.boardName}
      state={state}
      analysis={analysis}
      error={error}
      saved={saved}
      copied={copied}
      copiedJson={copiedJson}
      onScan={() => void runScan()}
      onBookmark={() => void onBookmark()}
      onCopyMarkdown={() => void onCopy()}
      onCopyJson={() => void onCopyJson()}
      footer={
        <div className="foot">
          <button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
            Options
          </button>
          <button
            type="button"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') })}
          >
            Bookmarks
          </button>
        </div>
      }
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('JobLens side panel: #root missing');
createRoot(root).render(<SidePanelApp />);
