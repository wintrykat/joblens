import { createRoot } from 'react-dom/client';
import { useCallback, type JSX } from 'react';
import {
  extractPageTextForBoard,
  resolveBoard,
  shouldShowLauncher,
} from '../lib/boards';
import { openSidePanel } from '../lib/messaging';
import {
  GetPageTextRequestSchema,
  RunScanRequestSchema,
} from '../types/messages';
import { launcherStyles } from './launcherStyles';

const board = resolveBoard();

function Launcher(): JSX.Element {
  const onScan = useCallback(() => {
    void openSidePanel({ startScan: true });
  }, []);

  return (
    <button className="launcher" type="button" onClick={onScan}>
      JobLens · Scan
    </button>
  );
}

function mountLauncher(): void {
  const host = document.createElement('div');
  host.id = 'joblens-root';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = launcherStyles;
  shadow.appendChild(styleEl);
  const mount = document.createElement('div');
  shadow.appendChild(mount);
  createRoot(mount).render(<Launcher />);
}

function postingRejectReason(): string | null {
  if (shouldShowLauncher(board)) return null;
  return board
    ? 'Open a job posting page on this site (not a search/list page).'
    : 'Unsupported page.';
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  const pageTextReq = GetPageTextRequestSchema.safeParse(msg);
  if (pageTextReq.success) {
    const reject = postingRejectReason();
    if (reject) {
      sendResponse({ ok: false, error: reject });
      return true;
    }
    sendResponse({
      ok: true,
      data: {
        url: location.href,
        pageText: extractPageTextForBoard(board),
        boardId: board?.id || '',
        boardName: board?.name || '',
        title: document.title,
      },
    });
    return true;
  }

  const scanReq = RunScanRequestSchema.safeParse(msg);
  if (scanReq.success) {
    const reject = postingRejectReason();
    if (reject) {
      sendResponse({ ok: false, error: reject });
      return true;
    }
    void openSidePanel({ startScan: true }).then((res) => {
      if (!res.ok) {
        sendResponse({ ok: false, error: res.error });
        return;
      }
      sendResponse({ ok: true, data: { started: true } });
    });
    return true;
  }

  return false;
});

if (shouldShowLauncher(board)) {
  mountLauncher();
}
