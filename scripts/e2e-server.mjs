import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Browser tests require TEST_DATABASE_URL pointing to a separate test database.');
}
const env = {
  ...process.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  NODE_ENV: 'development',
  LIFTORY_DEV_AUTH: 'true',
  APP_ORIGIN: 'http://127.0.0.1:3330',
  API_HOST: '127.0.0.1',
  API_PORT: '3331',
  API_INTERNAL_URL: 'http://127.0.0.1:3331',
};
const migration = spawnSync('pnpm', ['--filter', '@liftory/api', 'db:migrate'], {
  stdio: 'inherit',
  env,
});
if (migration.status !== 0) process.exit(migration.status ?? 1);
const children = [
  spawn(process.execPath, ['apps/api/dist/main.mjs'], { stdio: 'inherit', env }),
  spawn(process.execPath, ['apps/web/.next/standalone/apps/web/server.js'], {
    stdio: 'inherit',
    env: { ...env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3330' },
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* Already stopped. */
    }
  }
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
