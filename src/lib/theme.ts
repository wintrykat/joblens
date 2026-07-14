import type { ThemePreference } from '../types/domain';

/** Apply Forced / Default theme to document.documentElement. */
export function applyTheme(theme: ThemePreference | string | undefined | null): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

/**
 * Load theme from config and keep it synced with chrome.storage changes.
 * Returns an unsubscribe function.
 */
export function watchThemeFromConfig(): () => void {
  let cancelled = false;

  void (async () => {
    const { getConfig } = await import('./storage');
    if (cancelled) return;
    const cfg = await getConfig();
    if (!cancelled) applyTheme(cfg.theme);
  })();

  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ): void => {
    if (area !== 'local' || !changes.config) return;
    const next = changes.config.newValue as { theme?: ThemePreference } | undefined;
    if (next && typeof next === 'object' && 'theme' in next) {
      applyTheme(next.theme);
    } else {
      void (async () => {
        const { getConfig } = await import('./storage');
        applyTheme((await getConfig()).theme);
      })();
    }
  };

  chrome.storage.onChanged.addListener(onChanged);
  return () => {
    cancelled = true;
    chrome.storage.onChanged.removeListener(onChanged);
  };
}
