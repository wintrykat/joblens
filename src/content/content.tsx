import { createRoot, type Root } from 'react-dom/client';
import { useCallback, type JSX } from 'react';
import {
  extractPageTextForBoard,
  resolveBoard,
  shouldShowLauncher,
} from '../lib/boards';
import { openSidePanel, preflightJd, isExtensionContextValid } from '../lib/messaging';
import { getConfig, hasGeoIntent } from '../lib/storage';
import type { PreflightMode, PreflightResult, PreflightVerdict } from '../types/domain';
import {
  humanizePreflightReasons,
  listingFingerprint,
  pageTextSignature,
  preflightCacheKey,
} from '../lib/preflight';
import {
  GetPageTextRequestSchema,
  RunScanRequestSchema,
} from '../types/messages';
import { launcherStyles } from './launcherStyles';

const board = resolveBoard();
let launcherRoot: Root | null = null;
let launcherHost: HTMLElement | null = null;

type BadgeVerdict = PreflightVerdict | 'idle' | 'loading' | 'error';

type LauncherUiState = {
  mode: PreflightMode;
  badge: BadgeVerdict;
  reasons: string[];
  ready: boolean;
};

type CacheEntry = {
  result: PreflightResult;
  title: string;
  textSig: string;
};

const ui: LauncherUiState = {
  mode: 'auto',
  badge: 'idle',
  reasons: [],
  ready: false,
};

const preflightCache = new Map<string, CacheEntry>();
let preflightGen = 0;
let preflightDebounce: ReturnType<typeof setTimeout> | undefined;
let lastListingFp = '';

function badgeLabel(v: BadgeVerdict): string {
  switch (v) {
    case 'loading':
      return 'Preflight…';
    case 'clear':
      return 'Clear';
    case 'soft':
      return 'Soft concern';
    case 'hard_skip':
      return 'Hard skip';
    case 'unknown':
      return 'Unknown';
    case 'error':
      return 'Preflight unavailable';
    default:
      return 'Preflight idle';
  }
}

function Launcher(): JSX.Element {
  const onScan = useCallback(() => {
    void openSidePanel({ startScan: true });
  }, []);

  const onQuick = useCallback(() => {
    void runPreflight({ forceHaiku: true });
  }, []);

  const reasons = humanizePreflightReasons(ui.reasons);
  const title = reasons.length ? reasons.join('\n') : badgeLabel(ui.badge);
  const showQuick = ui.mode === 'hybrid';
  const body = reasons[0]
    ? reasons
        .slice(0, 2)
        .map((r) => (r.length > 140 ? `${r.slice(0, 137)}…` : r))
        .join('\n')
    : null;

  return (
    <div className="dock">
      <div className="badge" data-verdict={ui.badge} title={title}>
        <div className="badge-title">{badgeLabel(ui.badge)}</div>
        {body ? <div className="badge-body">{body}</div> : null}
      </div>
      <div className="row">
        {showQuick ? (
          <button
            className="quick"
            type="button"
            onClick={onQuick}
            disabled={ui.badge === 'loading' || !ui.ready}
          >
            Quick check
          </button>
        ) : null}
        <button className="launcher" type="button" onClick={onScan}>
          JobLens · Scan
        </button>
      </div>
    </div>
  );
}

function renderLauncher(): void {
  if (!launcherRoot) return;
  launcherRoot.render(<Launcher />);
}

function setUi(patch: Partial<LauncherUiState>): void {
  Object.assign(ui, patch);
  renderLauncher();
}

function mountLauncher(): void {
  if (launcherHost || document.getElementById('joblens-root')) {
    renderLauncher();
    return;
  }
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

function postingRejectReason(): string | null {
  if (shouldShowLauncher(board, location.href, document)) return null;
  return board
    ? 'Open a job posting page on this site (not a search/list page).'
    : 'Unsupported page.';
}

function resolvedPageUrl(): string {
  return board?.resolveJobUrl?.(document, location.href) ?? location.href;
}

function paneTitle(): string {
  const pane =
    document.querySelector('[data-testid="job-details-scroll-container"]') ??
    document.querySelector('[data-testid="right-pane"]');
  const fromPane = pane?.querySelector('h1, h2')?.textContent;
  return (fromPane || document.title || '').replace(/\s+/g, ' ').trim();
}

function currentListingContext(): {
  href: string;
  canonicalUrl: string;
  title: string;
  pageText: string;
  cacheKey: string;
  fingerprint: string;
  textSig: string;
} {
  const href = location.href;
  const canonicalUrl = resolvedPageUrl();
  const title = paneTitle();
  const pageText = extractPageTextForBoard(board);
  const textSig = pageTextSignature(pageText);
  const cacheKey = preflightCacheKey({ href, canonicalUrl });
  const fingerprint = listingFingerprint({
    href,
    canonicalUrl,
    paneTitle: title,
    pageText,
  });
  return { href, canonicalUrl, title, pageText, cacheKey, fingerprint, textSig };
}

async function refreshModeFromConfig(): Promise<void> {
  if (!isExtensionContextValid()) {
    setUi({
      ready: false,
      badge: 'error',
      reasons: ['JobLens was updated or reloaded — refresh this page to continue.'],
    });
    return;
  }
  try {
    const cfg = await getConfig();
    setUi({
      mode: cfg.preflightMode === 'hybrid' ? 'hybrid' : 'auto',
      ready: Boolean(cfg.apiKey.trim() && hasGeoIntent(cfg)),
    });
  } catch {
    setUi({
      ready: false,
      badge: isExtensionContextValid() ? ui.badge : 'error',
      reasons: isExtensionContextValid()
        ? ui.reasons
        : ['JobLens was updated or reloaded — refresh this page to continue.'],
    });
  }
}

function readCache(
  key: string,
  title: string,
  textSig: string
): PreflightResult | null {
  const entry = preflightCache.get(key);
  if (!entry) return null;
  // Invalidate sticky canonical hits when the visible listing changed.
  if (entry.title !== title || entry.textSig !== textSig) return null;
  return entry.result;
}

async function runPreflight(opts: { forceHaiku?: boolean } = {}): Promise<void> {
  if (!isExtensionContextValid()) {
    setUi({
      badge: 'error',
      reasons: ['JobLens was updated or reloaded — refresh this page to continue.'],
    });
    return;
  }
  if (!shouldShowLauncher(board, location.href, document)) return;

  const gen = ++preflightGen;
  const ctx = currentListingContext();

  if (!opts.forceHaiku) {
    const cached = readCache(ctx.cacheKey, ctx.title, ctx.textSig);
    if (cached) {
      if (gen === preflightGen) {
        setUi({ badge: cached.verdict, reasons: cached.reasons });
      }
      return;
    }
  }

  setUi({ badge: 'loading', reasons: [] });

  const res = await preflightJd({
    url: ctx.canonicalUrl,
    pageText: ctx.pageText,
    pageTitle: ctx.title || document.title,
    forceHaiku: opts.forceHaiku,
  });

  if (gen !== preflightGen) return;

  if (!res.ok) {
    setUi({ badge: 'error', reasons: [res.error] });
    return;
  }

  const pf = res.data.preflight;
  // Re-read context in case the pane settled during the round-trip.
  const settled = currentListingContext();
  if (settled.fingerprint !== ctx.fingerprint) {
    if (gen === preflightGen) {
      lastListingFp = '';
      schedulePreflight();
    }
    return;
  }

  preflightCache.set(settled.cacheKey, {
    result: pf,
    title: settled.title,
    textSig: settled.textSig,
  });
  setUi({ badge: pf.verdict, reasons: pf.reasons });
}

function schedulePreflight(): void {
  clearTimeout(preflightDebounce);
  preflightDebounce = setTimeout(() => {
    void (async () => {
      if (!isExtensionContextValid()) {
        setUi({
          badge: 'error',
          reasons: ['JobLens was updated or reloaded — refresh this page to continue.'],
        });
        return;
      }
      await refreshModeFromConfig();
      if (!shouldShowLauncher(board, location.href, document)) return;
      if (!ui.ready) {
        setUi({ badge: 'idle', reasons: ['Set API key and geography in Options'] });
        return;
      }
      await runPreflight({ forceHaiku: false });
    })().catch(() => {
      if (!isExtensionContextValid()) {
        setUi({
          badge: 'error',
          reasons: ['JobLens was updated or reloaded — refresh this page to continue.'],
        });
      }
    });
  }, 500);
}

function syncLauncher(): void {
  if (shouldShowLauncher(board, location.href, document)) {
    mountLauncher();
    schedulePreflight();
  } else {
    clearTimeout(preflightDebounce);
    preflightGen += 1;
    lastListingFp = '';
    unmountLauncher();
  }
}

/** React to Zip/Indeed-style card flips even when location.href is slow to update. */
function onSpaMaybeChanged(): void {
  const show = shouldShowLauncher(board, location.href, document);
  if (!show) {
    if (lastListingFp) {
      lastListingFp = '';
      syncLauncher();
    }
    return;
  }

  const fp = currentListingContext().fingerprint;
  if (fp === lastListingFp) {
    mountLauncher();
    return;
  }

  lastListingFp = fp;
  preflightGen += 1;
  setUi({ badge: 'loading', reasons: [] });
  mountLauncher();
  schedulePreflight();
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  const pageTextReq = GetPageTextRequestSchema.safeParse(msg);
  if (pageTextReq.success) {
    const reject = postingRejectReason();
    if (reject) {
      sendResponse({ ok: false, error: reject });
      return true;
    }
    const ctx = currentListingContext();
    sendResponse({
      ok: true,
      data: {
        url: ctx.canonicalUrl,
        pageText: ctx.pageText,
        boardId: board?.id || '',
        boardName: board?.name || '',
        title: ctx.title || document.title,
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (!isExtensionContextValid()) return;
  if (area !== 'local' || !changes.config) return;
  preflightCache.clear();
  lastListingFp = '';
  void refreshModeFromConfig()
    .then(() => {
      if (shouldShowLauncher(board, location.href, document)) {
        schedulePreflight();
      }
    })
    .catch(() => undefined);
});

syncLauncher();

/** SPA watch: observe a stable root so Zip replacing right-pane cannot detach us. */
{
  const needsSpaWatch = Boolean(board?.isScannableJob || board?.resolveJobUrl);

  const wrapHistory = (method: 'pushState' | 'replaceState'): void => {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History['pushState']>) => {
      const result = original(...args);
      onSpaMaybeChanged();
      return result;
    };
  };
  wrapHistory('pushState');
  wrapHistory('replaceState');
  window.addEventListener('popstate', onSpaMaybeChanged);

  if (needsSpaWatch) {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(onSpaMaybeChanged, 250);
    });
    // documentElement survives pane remounts; observing a right-pane node does not.
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}
