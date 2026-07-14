import { createRoot, type Root } from 'react-dom/client';
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
let launcherRoot: Root | null = null;
let launcherHost: HTMLElement | null = null;

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
  if (launcherHost || document.getElementById('joblens-root')) return;
  const host = document.createElement('div');
  host.id = 'joblens-root';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = launcherStyles;
  shadow.appendChild(styleEl);
  const mount = document.createElement('div');
  shadow.appendChild(mount);
  launcherHost = host;
  launcherRoot = createRoot(mount);
  launcherRoot.render(<Launcher />);
}

function unmountLauncher(): void {
  if (launcherRoot) {
    launcherRoot.unmount();
    launcherRoot = null;
  }
  launcherHost?.remove();
  launcherHost = null;
  document.getElementById('joblens-root')?.remove();
}

function syncLauncher(): void {
  if (shouldShowLauncher(board, location.href, document)) {
    mountLauncher();
  } else {
    unmountLauncher();
  }
}

function postingRejectReason(): string | null {
  if (shouldShowLauncher(board, location.href, document)) return null;
  return board
    ? 'Open a job posting page on this site (not a search/list page).'
    : 'Unsupported page.';
}

function resolvedPageUrl(): string {
  return board?.resolveJobUrl?.(document, location.href) ?? location.href;
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
        url: resolvedPageUrl(),
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

syncLauncher();

/** Keep launcher in sync on split-pane SPAs (e.g. ZipRecruiter jobs-search). */
if (board?.isScannableJob) {
  let lastHref = location.href;
  const onNav = (): void => {
    if (location.href === lastHref) {
      syncLauncher();
      return;
    }
    lastHref = location.href;
    syncLauncher();
  };

  const wrapHistory = (method: 'pushState' | 'replaceState'): void => {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History['pushState']>) => {
      const result = original(...args);
      onNav();
      return result;
    };
  };
  wrapHistory('pushState');
  wrapHistory('replaceState');
  window.addEventListener('popstate', onNav);

  const observeTarget =
    document.querySelector('[data-testid="right-pane"]') ??
    document.querySelector('[data-testid="job-details-scroll-container"]') ??
    document.body;

  let debounce: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(onNav, 200);
  });
  observer.observe(observeTarget, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
