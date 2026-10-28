import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function prepareServiceWorker(projectRoot = root, appVersion = process.env.APP_VERSION) {
  const hash = createHash('sha256');
  function include(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolute = join(path, entry.name);
      if (entry.isDirectory()) include(absolute);
      else if (entry.isFile() && relative(projectRoot, absolute) !== 'public/sw.js') {
        hash.update(relative(projectRoot, absolute));
        hash.update(readFileSync(absolute));
      }
    }
  }
  for (const directory of ['app', 'public', 'pwa', 'scripts'])
    include(join(projectRoot, directory));
  for (const directory of ['../../packages/contracts/src', '../../packages/offline/src'])
    include(resolve(projectRoot, directory));
  for (const file of ['next.config.ts', 'package.json'])
    hash.update(readFileSync(join(projectRoot, file)));
  const lockfile = resolve(projectRoot, '../../pnpm-lock.yaml');
  try {
    hash.update(readFileSync(lockfile));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const revision =
    typeof appVersion === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(appVersion)
      ? appVersion
      : 'local';
  const version = revision + '-' + hash.digest('hex').slice(0, 24);
  const template = readFileSync(join(projectRoot, 'pwa/sw.template.js'), 'utf8');
  if (!template.includes('__LIFTORY_SHELL_VERSION__'))
    throw new Error('Service worker version marker is missing.');
  const file = join(projectRoot, 'public/sw.js');
  const temporary = file + '.tmp';
  try {
    writeFileSync(temporary, template.replaceAll('__LIFTORY_SHELL_VERSION__', version));
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return version;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const version = prepareServiceWorker();
  if (!process.argv.includes('--prepare-only')) {
    const require = createRequire(import.meta.url);
    const child = spawn(
      process.execPath,
      [require.resolve('next/dist/bin/next'), 'build', ...process.argv.slice(2)],
      {
        stdio: 'inherit',
        env: { ...process.env, NEXT_PUBLIC_LIFTORY_BUILD: version },
      },
    );
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.once('error', () => {
      process.exitCode = 1;
    });
    child.once('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  }
}
