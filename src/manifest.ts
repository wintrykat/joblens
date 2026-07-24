import { defineManifest } from '@crxjs/vite-plugin';
import { MATCH_PATTERNS } from './lib/boards';

export default defineManifest({
  manifest_version: 3,
  name: 'JobLens',
  version: '1.6.3',
  description:
    'AI-assisted job-posting triage: masthead, skill match/mismatch, geo eligibility, decluttered JD, configurable triage preferences.',
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  action: {
    default_title: 'JobLens',
    // Light-toolbar glyph by default; service worker swaps for dark via prefers-color-scheme.
    default_icon: {
      '16': 'icons/toolbar-light-16.png',
      '32': 'icons/toolbar-light-32.png',
      '48': 'icons/toolbar-light-48.png',
      '128': 'icons/toolbar-light-128.png',
    },
  },
  options_page: 'index.html',
  side_panel: {
    default_path: 'sidepanel.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: MATCH_PATTERNS,
      js: ['src/content/content.tsx'],
      run_at: 'document_idle',
    },
  ],
  host_permissions: ['https://api.anthropic.com/*'],
  permissions: [
    'storage',
    'activeTab',
    'scripting',
    'clipboardWrite',
    'sidePanel',
    'tabs',
    'offscreen',
  ],
  web_accessible_resources: [
    { resources: ['bookmarks.html'], matches: ['<all_urls>'] },
  ],
});
