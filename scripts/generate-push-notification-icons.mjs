import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Iconos recomendados para Web Push / PWA Android con OneSignal:
 * - chrome-notification-256.png → Default Icon URL del panel OneSignal (~256², puede ser color)
 * - badge-monochrome-96.png → manifest `badge` y chrome_web_badge (silueta clara sobre alpha)
 */

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const svgPath = join(root, 'public', 'logo-eventum-icon.svg');
const outDir = join(root, 'public', 'icons', 'push');

await mkdir(outDir, { recursive: true });

const svgText = await readFile(svgPath, 'utf8');
// Quita fondo oscuro para generar máscara solo de la forma de la marca
const svgNoBg = svgText.replace(/<rect width="120" height="120"[^/]+\/?>/,
  '<rect width="120" height="120" fill="none"/>');

await sharp(Buffer.from(svgNoBg), { density: 300 })
  .resize(256, 256)
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, 'chrome-notification-256.png'));

const badgeBuf = await sharp(Buffer.from(svgNoBg), { density: 300 })
  .resize(96, 96)
  .ensureAlpha()
  .png()
  .toBuffer();

const { data, info } = await sharp(badgeBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

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
    // Marca típica púrpura/rosa/clara sobre transparencia: tomar luminosidad
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

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, 'badge-monochrome-96.png'));

console.log(`Wrote ${join(outDir, 'chrome-notification-256.png')}`);
console.log(`Wrote ${join(outDir, 'badge-monochrome-96.png')}`);
