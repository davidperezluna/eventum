import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Iconos recomendados para Web Push / PWA Android con OneSignal:
 * - chrome-notification-256.png → Default Icon URL del panel OneSignal (~256², puede ser color)
 * - badge-monochrome-96.png → manifest `badge` y chrome_web_badge (silueta; la E debe llenar el lienzo sin “aire” SVG)
 */

const CANVAS_BADGE = 96;
/** Tras trim, el glifo usa hasta esta fracción del lienzo final (margen seguro ante recortes del sistema). */
const GLYPH_FILL_RATIO = 0.88;

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const svgPath = join(root, 'public', 'logo-eventum-icon.svg');
const outDir = join(root, 'public', 'icons', 'push');

await mkdir(outDir, { recursive: true });

const svgText = await readFile(svgPath, 'utf8');
const svgNoBg = svgText.replace(/<rect width="120" height="120"[^/]+\/?>/,
  '<rect width="120" height="120" fill="none"/>');

await sharp(Buffer.from(svgNoBg), { density: 300 })
  .resize(256, 256)
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, 'chrome-notification-256.png'));

/** Render alto + silueta + trim → escala dentro del lienzo final (sin padding del viewBox SVG). */
const innerMaxPx = Math.round(CANVAS_BADGE * GLYPH_FILL_RATIO);
const rasterSize = 512;

const rasterBuf = await sharp(Buffer.from(svgNoBg), { density: 300 })
  .resize(rasterSize, rasterSize)
  .ensureAlpha()
  .png()
  .toBuffer();

const { data, info } = await sharp(rasterBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;

const out = Buffer.allocUnsafe(w * h * 4);
for (let row = 0; row < h; row++) {
  for (let col = 0; col < w; col++) {
    const i = (row * w + col) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const bright = Math.max(r, g, b);
    const isGlyph = bright > 50 && a > 30;

    const o = (row * w + col) * 4;
    if (isGlyph) {
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = Math.min(255, Math.round(bright));
    } else {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
    }
  }
}

const trimmedBuf = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9 })
  .trim()
  .toBuffer();

const glyphBuf = await sharp(trimmedBuf)
  .resize(innerMaxPx, innerMaxPx, { fit: 'inside', withoutEnlargement: false })
  .png({ compressionLevel: 9 })
  .toBuffer();

const { width: gw, height: gh } = await sharp(glyphBuf).metadata();

await sharp({
  create: {
    width: CANVAS_BADGE,
    height: CANVAS_BADGE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    {
      input: glyphBuf,
      left: Math.floor((CANVAS_BADGE - gw) / 2),
      top: Math.floor((CANVAS_BADGE - gh) / 2),
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, 'badge-monochrome-96.png'));

console.log(`Wrote ${join(outDir, 'chrome-notification-256.png')}`);
console.log(`Wrote ${join(outDir, 'badge-monochrome-96.png')}`);