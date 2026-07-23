#!/usr/bin/env node
/**
 * Rasterize JobLens icons from SVG (transparent, thick strokes for 16px).
 *
 * - brand: teal disc + cream rim + coral lens (store / UI)
 * - toolbar-light: dark rim for light toolbars
 * - toolbar-dark: light rim for dark toolbars
 *
 * Coral lens fill replaces a tiny arrow so the mark stays readable at 16px.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 32, 48, 128];

function markSvg({ rim, lens, handle, badge }) {
  const badgeLayer = badge
    ? `<circle cx="64" cy="64" r="60" fill="${badge}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
  ${badgeLayer}
  <!-- solid coral lens = guidance/focus, readable at 16px -->
  <circle cx="52" cy="50" r="26" fill="${lens}"/>
  <circle cx="52" cy="50" r="26" stroke="${rim}" stroke-width="16" fill="none"/>
  <line x1="74" y1="72" x2="104" y2="102" stroke="${handle}" stroke-width="16" stroke-linecap="round"/>
</svg>`;
}

const variants = {
  brand: markSvg({
    badge: '#0F766E',
    rim: '#F8FAFC',
    lens: '#E07A5F',
    handle: '#F8FAFC',
  }),
  'toolbar-light': markSvg({
    badge: null,
    rim: '#0F766E',
    lens: '#E07A5F',
    handle: '#0F766E',
  }),
  'toolbar-dark': markSvg({
    badge: null,
    rim: '#5EEAD4',
    lens: '#FB923C',
    handle: '#5EEAD4',
  }),
};

async function raster(svg, size, file) {
  await sharp(Buffer.from(svg))
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(file);
}

async function main() {
  for (const size of SIZES) {
    await raster(variants.brand, size, resolve(outDir, `brand-${size}.png`));
    await raster(variants.brand, size, resolve(outDir, `icon${size}.png`));
    await raster(
      variants['toolbar-light'],
      size,
      resolve(outDir, `toolbar-light-${size}.png`)
    );
    await raster(
      variants['toolbar-dark'],
      size,
      resolve(outDir, `toolbar-dark-${size}.png`)
    );
  }

  await raster(variants.brand, 1024, resolve(outDir, 'joblens-icon.png'));
  writeFileSync(resolve(outDir, 'brand.svg'), variants.brand);
  writeFileSync(resolve(outDir, 'toolbar-light.svg'), variants['toolbar-light']);
  writeFileSync(resolve(outDir, 'toolbar-dark.svg'), variants['toolbar-dark']);
  console.log(`Wrote icons → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
