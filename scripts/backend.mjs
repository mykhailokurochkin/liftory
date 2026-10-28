import { execFileSync, spawn } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, rmdirSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ports = { dev: '3481', prod: '3482' };

export function validateBackendConfig(values, environment) {
  const invalid = () => {
    throw new Error('Invalid private backend configuration.');
  };
  if (!Object.hasOwn(ports, environment) || values.LIFTORY_ENV !== environment) invalid();
  if (values.LIFTORY_API_PORT !== ports[environment]) invalid();
  if (
    !/^ghcr\.io\/mykhailokurochkin\/liftory-api@sha256:[a-f0-9]{64}$/.test(
      values.LIFTORY_API_IMAGE ?? '',
    ) ||
    !/^[a-f0-9]{40}$/.test(values.LIFTORY_API_COMMIT ?? '')
  )
    invalid();
  if (
    values.LIFTORY_DB_NAME !== `liftory_${environment}` ||
    values.LIFTORY_DB_USER !== `liftory_${environment}` ||
    (values.LIFTORY_DB_PASSWORD?.length ?? 0) < 24 ||
    (values.BETTER_AUTH_SECRET?.length ?? 0) < 32 ||
    !values.GOOGLE_CLIENT_ID ||
    !values.GOOGLE_CLIENT_SECRET ||
    !values.ALLOWED_EMAILS
  )
    invalid();
  try {
    const origin = new URL(values.LIFTORY_PUBLIC_ORIGIN);
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== values.LIFTORY_PUBLIC_ORIGIN ||
      origin.username ||
      origin.password
    )
      invalid();
    const database = new URL(values.LIFTORY_DATABASE_URL);
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      database.hostname !== 'db' ||
      !['', '5432'].includes(database.port) ||
      database.pathname !== `/${values.LIFTORY_DB_NAME}` ||
      decodeURIComponent(database.username) !== values.LIFTORY_DB_USER ||
      decodeURIComponent(database.password) !== values.LIFTORY_DB_PASSWORD ||
      database.search ||
      database.hash
    )
      invalid();
  } catch {
    invalid();
  }
  return values;
}

export function loadBackendConfig(file, environment) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error('Backend configuration must be a private regular file (0600).');
  const values = parseEnv(readFileSync(file, 'utf8'));
  return validateBackendConfig(values, environment);
}

async function run(args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Backend container operation failed.'));
    });
  });
}

export async function withBackendLock(file, operation) {
  const lock = file + '.lock';
  mkdirSync(lock, { mode: 0o700 });
  try {
    return await operation();
  } finally {
    rmdirSync(lock);
  }
}

function composeArgs(file, environment) {
  return [
    'compose',
    '--file',
    resolve(root, 'compose.yaml'),
    '--project-name',
    `personal-liftory-${environment}`,
    '--env-file',
    file,
  ];
}

export async function applyBackend(values, file, adapters = {}) {
  validateBackendConfig(values, values.LIFTORY_ENV);
  const env = { ...process.env, ...values };
  const compose = composeArgs(file, values.LIFTORY_ENV);
  const runDocker = adapters.runDocker ?? run;
  const freeBytes =
    adapters.freeBytes ??
    (() => {
      const disk = statfsSync(root);
      return disk.bsize * disk.bavail;
    });
  if ((await freeBytes()) < 10 * 1024 ** 3)
    throw new Error('Backend delivery requires at least 10 GiB free on the host.');
  const platform =
    adapters.platform ??
    (() =>
      execFileSync('docker', ['info', '--format', '{{.OSType}}/{{.Architecture}}'], {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim());
  if (!['linux/x86_64', 'linux/amd64'].includes(await platform()))
    throw new Error('This delivery configuration requires the Intel Linux Docker host.');
  await runDocker([...compose, 'config', '--quiet'], env);
  await runDocker([...compose, 'pull'], env);
  await runDocker([...compose, 'up', '--detach', '--wait', '--wait-timeout', '120'], env);
  await (adapters.verify ?? verifyBackend)(values);
}

export async function verifyBackend(values, fetcher = fetch) {
  const address = `http://127.0.0.1:${values.LIFTORY_API_PORT}`;
  const health = await fetcher(address + '/api/health', {
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  const body = await health.json();
  if (!health.ok || body.status !== 'ok' || body.version !== values.LIFTORY_API_COMMIT)
    throw new Error('Backend readiness or release version mismatch.');
  const session = await fetcher(address + '/api/session', {
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  const profile = await session.json();
  if (!session.ok || profile.user !== null || profile.development !== false)
    throw new Error('Backend must require real user authentication.');
}

async function main() {
  const { values: args, positionals } = parseArgs({
    options: { env: { type: 'string' }, config: { type: 'string' } },
    allowPositionals: true,
  });
  const [command] = positionals;
  if (
    positionals.length !== 1 ||
    !['validate', 'up', 'status', 'stop', 'logs'].includes(command) ||
    !Object.hasOwn(ports, args.env ?? '')
  )
    throw new Error('Use backend.mjs validate|up|status|stop|logs --env dev|prod.');
  const file = resolve(args.config ?? `${homedir()}/.config/liftory/${args.env}.env`);
  const values = loadBackendConfig(file, args.env);
  if (command === 'validate') {
    console.log('Private backend configuration is valid; credentials were not printed.');
    return;
  }
  const env = { ...process.env, ...values };
  const compose = composeArgs(file, args.env);
  if (command === 'status') {
    await run([...compose, 'ps'], env);
    return;
  }
  if (command === 'logs') {
    await run([...compose, 'logs', '--tail', '100', 'api'], env);
    return;
  }
  await withBackendLock(file, async () => {
    if (command === 'stop') {
      await run([...compose, 'stop'], env);
      console.log('Only this Liftory environment stopped; its database volume was preserved.');
      return;
    }
    await applyBackend(values, file);
    console.log(`Liftory ${args.env} is ready at its expected release; API is loopback-only.`);
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error(
      'Liftory backend operation failed. Check configuration, lock, Docker and readiness.',
    );
    process.exitCode = 1;
  });
}
