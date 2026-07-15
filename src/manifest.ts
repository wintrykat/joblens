import { defineManifest } from '@crxjs/vite-plugin';
import { MATCH_PATTERNS } from './lib/boards';

export default defineManifest({
  manifest_version: 3,
  name: 'JobLens',
  version: '1.4.3',
  description:
    'AI-assisted job-posting triage: masthead, skill match/mismatch, geo eligibility, decluttered JD, configurable triage preferences.',
  action: {},
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
  ],
  web_accessible_resources: [
    { resources: ['bookmarks.html'], matches: ['<all_urls>'] },
  ],
});
