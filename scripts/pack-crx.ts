#!/usr/bin/env node
/**
 * Pack dist/ into a signed CRXv3 (+ ZIP) under release/.
 *
 * Private key: keys/joblens.pem (created on first run; gitignored).
 * Keep the same .pem across builds so update IDs stay stable.
 *
 * Install note: sideloading .crx outside chrome://extensions Developer Mode
 * may fail with CRX_REQUIRED_PROOF_MISSING (Chrome Web Store proof). Prefer
 * Load unpacked from dist/ for local use, or upload the .zip to the store.
 */
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crx3 from 'crx3';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { name, version } = require('../package.json') as {
  name: string;
  version: string;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const manifestPath = resolve(distDir, 'manifest.json');
const releaseDir = resolve(root, 'release');
const keysDir = resolve(root, 'keys');
const keyPath = resolve(keysDir, 'joblens.pem');
const base = `${name}-${version}`;
const crxPath = resolve(releaseDir, `${base}.crx`);
const zipPath = resolve(releaseDir, `${base}.zip`);

if (!existsSync(manifestPath)) {
  console.error(
    `[pack-crx] Missing ${manifestPath}. Run \`npm run build\` first (or use \`npm run pack\`).`
  );
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
mkdirSync(keysDir, { recursive: true });

await crx3([manifestPath], {
  keyPath,
  crxPath,
  zipPath,
});

console.log(`[pack-crx] Wrote ${crxPath}`);
console.log(`[pack-crx] Wrote ${zipPath}`);
console.log(`[pack-crx] Signing key: ${keyPath}${existsSync(keyPath) ? '' : ' (new)'}`);
