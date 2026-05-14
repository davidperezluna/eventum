import sharp from 'sharp';
import { mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const svgPath = join(root, 'public', 'logo-eventum-icon.svg');
const outDir = join(root, 'public', 'icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

await access(svgPath);
await mkdir(outDir, { recursive: true });

const svg = sharp(svgPath, { density: 300 });

for (const size of sizes) {
  const out = join(outDir, `icon-${size}x${size}.png`);
  await svg.clone().resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  console.log('Wrote', out);
}
