#!/usr/bin/env node
/**
 * Post-build dist/manifest invariants only.
 * Domain coverage lives in Vitest (`npm test`).
 */
import { readFileSync } from 'node:fs';
import { MATCH_PATTERNS, BOARDS } from '../src/lib/boards';

const manifest = JSON.parse(
  readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8')
) as {
  version: string;
  content_scripts: Array<{ matches: string[] }>;
  side_panel?: { default_path?: string };
  permissions?: string[];
  action?: { default_popup?: string };
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

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
