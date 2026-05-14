import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * GitHub Pages "project site": https://<user>.github.io/<repo>/
 * → base-href /repo/
 * Repo <user>.github.io (user/org page) → base /
 */
function computeBaseHref() {
  const explicit = process.env.BASE_HREF?.trim();
  if (explicit !== undefined && explicit !== '') {
    let b = explicit;
    if (!b.startsWith('/')) b = `/${b}`;
    if (b === '/') return '/';
    if (!b.endsWith('/')) b = `${b}/`;
    return b;
  }

  const gh = process.env.GITHUB_REPOSITORY;
  if (gh) {
    const repo = gh.split('/')[1] || '';
    if (repo.endsWith('.github.io')) return '/';
    return `/${repo}/`;
  }

  console.warn(
    '[build-github-pages] Sin GITHUB_REPOSITORY ni BASE_HREF; usando "/" (solo válido en la raíz del dominio).',
  );
  return '/';
}

const base = computeBaseHref();
console.log(`[build-github-pages] --base-href ${base}`);

const useShell = process.platform === 'win32';
const build = spawnSync(
  'npx',
  ['ng', 'build', '--configuration', 'production', '--base-href', base],
  { cwd: root, stdio: 'inherit', shell: useShell },
);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const copy = spawnSync(process.execPath, [join(root, 'scripts', 'copy-404.js')], {
  cwd: root,
  stdio: 'inherit',
});
if (copy.status !== 0) {
  process.exit(copy.status ?? 1);
}
