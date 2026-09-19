import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const useShell = process.platform === 'win32';

const vercelEnv = process.env.VERCEL_ENV || '';
const gitRef = process.env.VERCEL_GIT_COMMIT_REF || '';
const isProd = vercelEnv === 'production';
const configuration = isProd ? 'production' : 'dev';

console.log(
  `[vercel-build] VERCEL_ENV=${vercelEnv || '(local)'} REF=${gitRef || '(none)'} → ng build --configuration ${configuration}`,
);

const build = spawnSync(
  'npx',
  ['ng', 'build', '--configuration', configuration],
  { cwd: root, stdio: 'inherit', shell: useShell },
);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const copy = spawnSync(process.execPath, [join(root, 'scripts', 'copy-404.js')], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(copy.status ?? 1);
