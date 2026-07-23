#!/usr/bin/env node
/**
 * Post-build dist/manifest invariants only.
 * Domain coverage lives in Vitest (`npm test`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { MATCH_PATTERNS, BOARDS } from '../src/lib/boards';

const manifest = JSON.parse(
  readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8')
) as {
  version: string;
  content_scripts: Array<{ matches: string[] }>;
  side_panel?: { default_path?: string };
  permissions?: string[];
  icons?: Record<string, string>;
  action?: {
    default_popup?: string;
    default_icon?: Record<string, string>;
  };
};

let fails = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    fails++;
  } else {
    console.log('ok', msg);
  }
}

assert(BOARDS.length === 25, `boards ${BOARDS.length}`);
const matches = manifest.content_scripts[0]?.matches ?? [];
for (const p of MATCH_PATTERNS) {
  assert(matches.includes(p), `manifest has ${p}`);
}
assert(manifest.version === '1.5.2', 'manifest version');
assert(manifest.side_panel?.default_path === 'sidepanel.html', 'side_panel path');
assert(manifest.permissions?.includes('sidePanel'), 'sidePanel permission');
assert(!manifest.action?.default_popup, 'no default_popup');
assert(!!manifest.icons?.['128'], 'manifest icons.128');
assert(!!manifest.action?.default_icon?.['32'], 'action default_icon');
assert(existsSync(new URL('../dist/icons/icon128.png', import.meta.url)), 'dist icon128');
assert(existsSync(new URL('../dist/icons/icon16.png', import.meta.url)), 'dist icon16');
assert(
  existsSync(new URL('../dist/icons/toolbar-dark-16.png', import.meta.url)),
  'dist toolbar-dark-16'
);
assert(
  existsSync(new URL('../dist/icons/toolbar-light-16.png', import.meta.url)),
  'dist toolbar-light-16'
);
assert(manifest.permissions?.includes('offscreen'), 'offscreen permission');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
