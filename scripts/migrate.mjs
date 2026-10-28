import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['--filter', '@liftory/api', 'db:migrate'], {
  stdio: 'inherit',
  env: process.env,
});
process.exitCode = result.status ?? 1;
