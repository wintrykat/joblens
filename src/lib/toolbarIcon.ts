/** Apply toolbar icons that match light/dark color scheme (transparent glyphs). */

const LIGHT_PATHS: Record<string, string> = {
  '16': 'icons/toolbar-light-16.png',
  '32': 'icons/toolbar-light-32.png',
  '48': 'icons/toolbar-light-48.png',
  '128': 'icons/toolbar-light-128.png',
};

const DARK_PATHS: Record<string, string> = {
  '16': 'icons/toolbar-dark-16.png',
  '32': 'icons/toolbar-dark-32.png',
  '48': 'icons/toolbar-dark-48.png',
  '128': 'icons/toolbar-dark-128.png',
};

const OFFSCREEN_URL = 'offscreen-theme.html';

let creatingOffscreen: Promise<void> | null = null;

async function ensureThemeOffscreen(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const runtime = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: {
      contextTypes?: string[];
      documentUrls?: string[];
    }) => Promise<unknown[]>;
  };

  if (typeof runtime.getContexts === 'function') {
    const existing = await runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    if (existing.length > 0) return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  const offscreen = chrome.offscreen as typeof chrome.offscreen & {
    createDocument: (params: {
      url: string;
      reasons: string[];
      justification: string;
    }) => Promise<void>;
  };

  creatingOffscreen = offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['MATCH_MEDIA'],
      justification: 'Detect color scheme to swap toolbar icons for light/dark themes.',
    })
    .catch((err: unknown) => {
      console.warn('JobLens: offscreen theme probe failed', err);
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

export async function applyToolbarIcon(dark: boolean): Promise<void> {
  const path = dark ? DARK_PATHS : LIGHT_PATHS;
  await chrome.action.setIcon({ path });
}

export function startToolbarIconThemeSync(): void {
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (
      msg &&
      typeof msg === 'object' &&
      (msg as { type?: string }).type === 'joblens.colorScheme' &&
      typeof (msg as { dark?: unknown }).dark === 'boolean'
    ) {
      void applyToolbarIcon((msg as { dark: boolean }).dark);
    }
    return false;
  });

  void ensureThemeOffscreen();
}
