#!/usr/bin/env node
/**
 * Zip dist/ for Load-unpacked / GitHub Releases (no signing key required).
 * Zip root contains manifest.json so the extract folder can be loaded directly.
 */
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { name, version } = require('../package.json') as {
  name: string;
  version: string;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const manifestPath = resolve(distDir, 'manifest.json');
const releaseDir = resolve(root, 'release');
const outPath = resolve(releaseDir, `${name}-${version}.zip`);

if (!existsSync(manifestPath)) {
  console.error(
    `[pack-zip] Missing ${manifestPath}. Run \`npm run build\` first.`
  );
  process.exit(1);
}

const manifest = require(manifestPath) as { version?: string };
if (manifest.version !== version) {
  console.error(
    `[pack-zip] manifest version ${manifest.version} !== package.json ${version}`
  );
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
if (existsSync(outPath)) unlinkSync(outPath);

const zip = spawnSync('zip', ['-r', '-q', outPath, '.'], {
  cwd: distDir,
  stdio: 'inherit',
});
if (zip.status !== 0) {
  console.error('[pack-zip] `zip` failed. Install zip(1) and retry.');
  process.exit(zip.status ?? 1);
}

console.log(`[pack-zip] Wrote ${outPath}`);
