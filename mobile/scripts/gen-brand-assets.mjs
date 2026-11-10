#!/usr/bin/env node
/**
 * Writes the app icon, Android adaptive icon layers, favicon and splash art in
 * assets/images from the brand kit SVG (assets/brand/rentopya-icon-colorful.svg,
 * a copy of frontend/src/assets/brand; docs/brand.md). Run it after the kit
 * changes and commit the PNGs:
 *
 *   npm i --no-save sharp && node scripts/gen-brand-assets.mjs
 *
 * sharp is not a dependency: the PNGs are committed, the app never renders SVG
 * icons at build time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { default: sharp } = await import('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => path.join(root, 'assets/images', f);
const icon = fs.readFileSync(path.join(root, 'assets/brand/rentopya-icon-colorful.svg'), 'utf8');

/** The "R" glyph and its transform, as the kit draws it on the 850×850 tile. */
const d = icon.match(/ d="([^"]+)"/)[1];
const transform = icon.match(/transform="([^"]+)"/)[1];
/** Bounding box of the glyph on the tile (measured once with sharp's trim). */
const MARK = { x: 207, y: 211, w: 436, h: 428 };

const INDIGO = '#2E358C';
const INDIGO_LIGHT = '#8E95EC';

/** The glyph alone, filled, scaled so its width is `share` of a `size` square canvas, centred. */
function markSvg({ fill, size, share }) {
  const scale = (size * share) / MARK.w;
  const tx = size / 2 - (MARK.x + MARK.w / 2) * scale;
  const ty = size / 2 - (MARK.y + MARK.h / 2) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<g transform="translate(${tx} ${ty}) scale(${scale})"><path fill="${fill}" fill-rule="evenodd" transform="${transform}" d="${d}"/></g></svg>`;
}

/** The glyph cropped to its own box (splash art). */
function markCropSvg({ fill, width }) {
  const scale = width / MARK.w;
  const height = Math.round(MARK.h * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${MARK.x} ${MARK.y} ${MARK.w} ${MARK.h}">
<path fill="${fill}" fill-rule="evenodd" transform="${transform}" d="${d}"/></svg>`;
}

const gradient = icon.replace(/<path[^>]*\/>/, '');

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png();

await png(icon, 1024).toFile(out('icon.png'));
await png(icon, 48).toFile(out('favicon.png'));
await png(gradient, 1024).toFile(out('android-icon-background.png'));
// Adaptive icon: the launcher masks to the inner 66 %; the glyph stays well inside it.
await sharp(Buffer.from(markSvg({ fill: '#FFFFFF', size: 1024, share: 0.4 })))
  .png()
  .toFile(out('android-icon-foreground.png'));
await sharp(Buffer.from(markSvg({ fill: '#FFFFFF', size: 1024, share: 0.4 })))
  .png()
  .toFile(out('android-icon-monochrome.png'));
await sharp(Buffer.from(markCropSvg({ fill: INDIGO, width: 400 })))
  .png()
  .toFile(out('splash-icon.png'));
await sharp(Buffer.from(markCropSvg({ fill: INDIGO_LIGHT, width: 400 })))
  .png()
  .toFile(out('splash-icon-dark.png'));
console.log('brand assets: wrote 7 PNGs to assets/images');
