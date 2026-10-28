import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statfsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const disk = statfsSync('.');
if (disk.bavail * disk.bsize < 10 * 1024 ** 3)
  throw new Error('At least 10 GiB free disk is required before building.');

const result = spawnSync('pnpm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', API_INTERNAL_URL: 'http://127.0.0.1:3331' },
});
if (result.status !== 0) process.exit(result.status ?? 1);
const standalone = 'apps/web/.next/standalone/apps/web';
mkdirSync(standalone + '/.next', { recursive: true });
for (const [source, destination] of [
  ['apps/web/public', standalone + '/public'],
  ['apps/web/.next/static', standalone + '/.next/static'],
]) {
  if (!existsSync(destination)) symlinkSync(resolve(source), destination, 'dir');
}
