import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  deliveryPaths,
  deliveryStatus,
  initializeDelivery,
  pauseDelivery,
} from './delivery-core.mjs';

const label = 'io.personal.liftory.delivery-dev';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export function buildDeliveryPlist({ node, project, base }) {
  const path = [
    dirname(node),
    join(base, '.docker/bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(join(project, 'scripts/delivery.mjs'))}</string><string>tick</string></array>
<key>WorkingDirectory</key><string>${xml(project)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string></dict>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>60</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`;
}

function loaded(domain) {
  try {
    execFileSync('/bin/launchctl', ['print', `${domain}/${label}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function assertExpectedAgent(file, content) {
  if (!existsSync(file)) return;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || readFileSync(file, 'utf8') !== content)
    throw new Error('Refusing to change an unrecognized LaunchAgent.');
}

export function installDeliveryAgent({ file, content, isLoaded, bootstrap }) {
  const existingJob = isLoaded();
  if (existingJob && !existsSync(file))
    throw new Error('Refusing to adopt a loaded job without its recognized LaunchAgent file.');
  assertExpectedAgent(file, content);
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
  if (!existingJob) bootstrap(file);
}

async function main() {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (
    process.platform !== 'darwin' ||
    !process.getuid ||
    positionals.length !== 1 ||
    !['install', 'status', 'uninstall'].includes(positionals[0])
  )
    throw new Error(
      'Use deploy-host.mjs install|status|uninstall in the Pro desktop user session.',
    );
  const base = homedir();
  const paths = deliveryPaths(base);
  initializeDelivery(paths);
  const domain = `gui/${process.getuid()}`;
  const agentDirectory = join(base, 'Library/LaunchAgents');
  const file = join(agentDirectory, `${label}.plist`);
  const content = buildDeliveryPlist({ node: process.execPath, project: root, base });
  assertExpectedAgent(file, content);
  if (loaded(domain) && !existsSync(file))
    throw new Error('Refusing to manage a loaded job without its recognized LaunchAgent file.');
  const [action] = positionals;
  if (action === 'install') {
    installDeliveryAgent({
      file,
      content,
      isLoaded: () => loaded(domain),
      bootstrap: (path) =>
        execFileSync('/bin/launchctl', ['bootstrap', domain, path], { stdio: 'ignore' }),
    });
  } else if (action === 'uninstall') {
    pauseDelivery(paths);
    if (existsSync(paths.lock))
      throw new Error('An operation is active; retry uninstall after it completes.');
    if (loaded(domain))
      execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' });
    if (existsSync(file)) unlinkSync(file);
  }
  console.log(
    JSON.stringify({
      event: 'liftory_delivery_host',
      installed: loaded(domain),
      ...deliveryStatus(paths),
    }),
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        event: 'liftory_delivery_host_failed',
        message: 'Check the recognized LaunchAgent, GUI session and active operation lock.',
      }),
    );
    process.exitCode = 1;
  });
}
