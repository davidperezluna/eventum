#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function finalizeBuild(distPath) {
  const indexPath = path.join(distPath, 'index.html');
  // Idempotent: rerunning the finalizer must not manufacture a new version.
  const original = fs.readFileSync(indexPath, 'utf8')
    .replace(/<meta name="eventum-build" content="[a-f0-9]+">\s*/g, '');
  const manifestPath = path.join(distPath, 'ngsw.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (manifest && (!manifest.hashTable || !manifest.index || !(manifest.index in manifest.hashTable))) {
    throw new Error('Invalid Angular manifest: missing index hash');
  }
  // Include asset-only releases too (images/fonts can change without a new main bundle).
  const assets = manifest ? Object.entries(manifest.hashTable)
    .filter(([name]) => name !== manifest.index).sort(([a], [b]) => a.localeCompare(b)) : [];
  const buildId = createHash('sha256').update(JSON.stringify({ html: original, assets })).digest('hex');
  const html = original.replace('</head>', `<meta name="eventum-build" content="${buildId}"></head>`);
  fs.writeFileSync(indexPath, html);
  fs.writeFileSync(path.join(distPath, '404.html'), html);

  if (manifest) {
    // Angular already generated ngsw.json. Recompute the hash of the FINAL HTML.
    manifest.hashTable[manifest.index] = createHash('sha1').update(html).digest('hex');
    manifest.appData = { ...manifest.appData, buildId };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return buildId;
}

if (require.main === module) {
  const candidates = ['dist/admin-panel/browser', 'dist/admin-panel'];
  const dist = candidates.map(p => path.resolve(__dirname, '..', p))
    .find(p => fs.existsSync(path.join(p, 'index.html')));
  if (!dist) throw new Error('Build output missing. Run the Angular build first.');
  console.log(`[build] Final HTML, 404 and service-worker hashes synchronized: ${finalizeBuild(dist)}`);
}
module.exports = { finalizeBuild };
