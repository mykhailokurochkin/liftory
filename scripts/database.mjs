import { spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';

const action = process.argv[2];
if (!['up', 'down'].includes(action)) throw new Error('Use database.mjs up|down.');
const disk = statfsSync('.');
if (action === 'up' && disk.bavail * disk.bsize < 10 * 1024 ** 3)
  throw new Error('At least 10 GiB free disk is required. No cleanup was performed.');
const args = ['compose', '--project-name', 'personal-liftory-local', '-f', 'compose.local.yaml'];
const result = spawnSync(
  'docker',
  [...args, ...(action === 'up' ? ['up', '-d', '--wait'] : ['stop'])],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
