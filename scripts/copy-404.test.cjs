const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { finalizeBuild } = require('./copy-404.js');

function removeFixture(dir) {
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('eventum-build-test-'));
  fs.rmSync(dir, { recursive: true });
}

for (const base of ['/', '/eventum/']) {
  test(`final HTML matches Angular hash and 404 at ${base}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventum-build-test-'));
    try {
      fs.writeFileSync(path.join(dir, 'index.html'), '<html><head></head><body><script src="main-A.js"></script></body></html>');
      fs.writeFileSync(path.join(dir, 'ngsw.json'), JSON.stringify({ index: `${base}index.html`, hashTable: { [`${base}index.html`]: 'old', [`${base}main-A.js`]: 'untouched' } }));
      const id = finalizeBuild(dir);
      const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'ngsw.json')));
      assert.equal(manifest.hashTable[`${base}index.html`], createHash('sha1').update(html).digest('hex'));
      assert.equal(manifest.hashTable[`${base}main-A.js`], 'untouched');
      assert.equal(manifest.appData.buildId, id);
      assert.equal(fs.readFileSync(path.join(dir, '404.html'), 'utf8'), html);
      assert.equal(finalizeBuild(dir), id);
      manifest.hashTable[`${base}logo.svg`] = 'changed-image';
      fs.writeFileSync(path.join(dir, 'ngsw.json'), JSON.stringify(manifest));
      assert.notEqual(finalizeBuild(dir), id);
      fs.writeFileSync(path.join(dir, 'index.html'), html.replace('main-A.js', 'main-B.js'));
      assert.notEqual(finalizeBuild(dir), id);
    } finally {
      // Only this test's explicitly created temp directory is removed.
      removeFixture(dir);
    }
  });
}
test('dev output remains free of a service-worker manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventum-build-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><head></head></html>');
    finalizeBuild(dir);
    assert.equal(fs.existsSync(path.join(dir, 'ngsw.json')), false);
  } finally { removeFixture(dir); }
});
