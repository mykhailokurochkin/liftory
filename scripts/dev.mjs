import { spawn, spawnSync } from 'node:child_process';

if (process.env.LIFTORY_DEV_AUTH === 'true') {
  const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3300');
  if (!['localhost', '127.0.0.1'].includes(origin.hostname))
    throw new Error('Development identity requires a loopback web origin.');
  process.env.API_HOST = '127.0.0.1';
}
const migrate = spawnSync('pnpm', ['run', 'db:migrate'], { stdio: 'inherit', env: process.env });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const children = [
  spawn('pnpm', ['--filter', '@liftory/api', 'dev'], {
    stdio: 'inherit',
    env: process.env,
    detached: true,
  }),
  spawn('pnpm', ['--filter', '@liftory/web', 'dev'], {
    stdio: 'inherit',
    env: process.env,
    detached: true,
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Already stopped. */
    }
  }
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
