#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const label = 'io.personal.liftory-tunnel';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profiles = Object.freeze({
  dev: { https: 443, port: 3481 },
  prod: { https: 8443, port: 3482 },
});
const commands = [
  'install',
  'status',
  'login',
  'enable-dev',
  'disable-dev',
  'enable-prod',
  'disable-prod',
  'uninstall',
];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) =>
  object(value) && Object.keys(value).every((key) => keys.includes(key));
const empty = (value) =>
  value === undefined || value === null || (object(value) && !Object.keys(value).length);
const blankRoutes = () => ({ dev: null, prod: null });
const target = (environment) => `http://127.0.0.1:${profiles[environment].port}`;
const dnsName = (value) => {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\.$/, '');
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2}ts\.net$/.test(name) ? name : null;
};

export function parseTunnelArgs(input) {
  if (!input.length || (input.length === 1 && ['-h', '--help'].includes(input[0]))) return 'help';
  if (input.length !== 1 || !commands.includes(input[0]))
    throw new Error('Use one Liftory tunnel command without options; see --help.');
  return input[0];
}

export function tunnelPaths(home = homedir(), uid = process.getuid()) {
  const directory = join(home, '.local/share/liftory/tunnel');
  return {
    home,
    uid,
    directory,
    stateDirectory: join(directory, 'state'),
    state: join(directory, 'state/tailscaled.state'),
    socket: join(directory, 'tailscaled.sock'),
    marker: join(directory, 'managed.json'),
    lock: join(directory, 'operation.lock'),
    agents: join(home, 'Library/LaunchAgents'),
    plist: join(home, 'Library/LaunchAgents', `${label}.plist`),
    job: `gui/${uid}/${label}`,
    domain: `gui/${uid}`,
  };
}

function present(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('A Liftory tunnel path is inaccessible.');
  }
}

function checkedPath(path, uid, type, privateMode = true) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error('A required Liftory tunnel path is unavailable.');
  }
  if (
    stat.isSymbolicLink() ||
    stat.uid !== uid ||
    (type === 'directory' && !stat.isDirectory()) ||
    (type === 'file' && (!stat.isFile() || stat.nlink !== 1)) ||
    (type === 'socket' && !stat.isSocket()) ||
    (stat.mode & (type === 'socket' ? 0 : privateMode ? 0o077 : 0o022)) !== 0
  )
    throw new Error(
      'Liftory tunnel paths must be owned, private and free of symlinks or hard links.',
    );
}

function directories(path, paths, create = false, privateLeaf = true) {
  if (!path.startsWith(`${paths.home}/`))
    throw new Error('Liftory state must be inside user home.');
  checkedPath(paths.home, paths.uid, 'directory', false);
  let current = paths.home;
  for (const part of path.slice(paths.home.length + 1).split('/')) {
    current = join(current, part);
    if (!present(current) && create) mkdirSync(current, { mode: 0o700 });
    checkedPath(current, paths.uid, 'directory', current === path && privateLeaf);
  }
}

function privateTree(path, paths) {
  checkedPath(path, paths.uid, 'directory');
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    const certificate = entry.name.endsWith('.crt') ? entry.name.slice(0, -4) : null;
    if (
      path === join(paths.stateDirectory, 'certs') &&
      certificate &&
      dnsName(certificate) === certificate
    )
      checkedPath(child, paths.uid, 'file', false);
    else if (entry.isDirectory()) privateTree(child, paths);
    else checkedPath(child, paths.uid, entry.isSocket() ? 'socket' : 'file');
  }
}

function atomicWrite(path, value) {
  const temporary = join(dirname(path), `.liftory-tunnel-${randomUUID()}`);
  try {
    writeFileSync(temporary, value, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function resolveTunnelBinaries(directory) {
  const selected =
    directory ??
    ['/usr/local/opt/tailscale/bin', '/opt/homebrew/opt/tailscale/bin'].find((candidate) =>
      ['tailscale', 'tailscaled'].every((name) => existsSync(join(candidate, name))),
    );
  if (!selected) throw new Error('The installed Homebrew Tailscale binaries are required.');
  const binaries = Object.fromEntries(
    ['tailscale', 'tailscaled'].map((name) => {
      const path = realpathSync(join(selected, name));
      const stat = lstatSync(path);
      if (!stat.isFile() || (stat.mode & 0o022) !== 0 || (stat.mode & 0o111) === 0)
        throw new Error(
          'Tailscale binaries must be regular executables without public write access.',
        );
      return [name, path];
    }),
  );
  if (dirname(binaries.tailscale) !== dirname(binaries.tailscaled))
    throw new Error('Tailscale binaries must belong to the same installation.');
  return { ...binaries, directory: dirname(binaries.tailscale) };
}

const xml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character],
  );

export function liftoryLaunchAgent(paths, binaries) {
  const args = [
    binaries.tailscaled,
    '--tun=userspace-networking',
    `--statedir=${paths.stateDirectory}`,
    `--state=${paths.state}`,
    `--socket=${paths.socket}`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join('')}</array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`;
}

function browserURL(value, authentication = false) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !(
        authentication ? ['login.tailscale.com'] : ['login.tailscale.com', 'console.tailscale.com']
      ).includes(url.hostname) ||
      (authentication && (!/^\/a\/[a-zA-Z0-9]+$/.test(url.pathname) || url.search))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function managedLiftoryFunnel(config, marker) {
  const summary = { dev: { enabled: false }, prod: { enabled: false } };
  if (config === null) return summary;
  if (!keysAre(config, ['TCP', 'Web', 'AllowFunnel', 'Foreground', 'Services']))
    throw new Error('Unknown Liftory Funnel configuration; preserve it for inspection.');
  if (['TCP', 'Web', 'AllowFunnel', 'Foreground', 'Services'].every((key) => empty(config[key])))
    return summary;
  if (!empty(config.Foreground) || !empty(config.Services))
    throw new Error('Unknown Liftory Funnel configuration; preserve it for inspection.');
  const ports = [],
    hostPorts = [];
  for (const environment of Object.keys(profiles)) {
    const port = String(profiles[environment].https);
    const tcp = config.TCP?.[port];
    const intents = [marker.routes?.[environment], marker.previousRoutes?.[environment]].filter(
      Boolean,
    );
    const hostPort = Object.keys(config.Web ?? {}).find((key) => key.endsWith(`:${port}`));
    const allowed = Object.keys(config.AllowFunnel ?? {}).find((key) => key.endsWith(`:${port}`));
    if (!tcp && !hostPort && !allowed) continue;
    const intent = intents.find((candidate) => hostPort === `${candidate.hostname}:${port}`);
    const web = config.Web?.[hostPort];
    const handler = web?.Handlers?.['/'];
    if (
      !intent ||
      !keysAre(tcp, ['HTTPS']) ||
      tcp.HTTPS !== true ||
      !keysAre(web, ['Handlers']) ||
      !keysAre(web.Handlers, ['/']) ||
      !keysAre(handler, ['Proxy']) ||
      handler.Proxy !== intent.target ||
      (allowed !== undefined &&
        (allowed !== hostPort || typeof config.AllowFunnel[allowed] !== 'boolean'))
    )
      throw new Error('Unknown Liftory Funnel configuration; preserve it for inspection.');
    ports.push(port);
    hostPorts.push(hostPort);
    const enabled = config.AllowFunnel?.[hostPort] === true;
    summary[environment] = {
      enabled,
      hostname: intent.hostname,
      target: intent.target,
      ...(enabled
        ? { publicURL: `https://${intent.hostname}${port === '443' ? '' : ':' + port}` }
        : {}),
    };
  }
  if (
    (!empty(config.TCP) && !keysAre(config.TCP, ports)) ||
    (!empty(config.Web) && !keysAre(config.Web, hostPorts)) ||
    (!empty(config.AllowFunnel) && !keysAre(config.AllowFunnel, hostPorts))
  )
    throw new Error('Unknown Liftory Funnel configuration; preserve it for inspection.');
  return summary;
}

function preserveSibling(before, after, environment) {
  const sibling = environment === 'dev' ? 'prod' : 'dev';
  if (JSON.stringify(before[sibling]) !== JSON.stringify(after[sibling]))
    throw new Error(
      'A sibling Liftory route changed unexpectedly; inspect the preserved ownership record.',
    );
}

export function runTunnelCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    timeout: 5000,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    maxBuffer: 256 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

export async function verifyLiftoryBackend(
  environment,
  { run = runTunnelCommand, fetcher = fetch, projectRoot = root } = {},
) {
  const project = `personal-liftory-${environment}`;
  const listing = run('docker', [
    'container',
    'ls',
    '--all',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--filter',
    'label=com.docker.compose.service=api',
  ]);
  const id = listing.stdout?.trim();
  if (listing.status !== 0 || !/^[a-f0-9]{12,64}$/.test(id ?? ''))
    throw new Error('Expected exactly one owned Liftory API container before exposing it.');
  const inspection = run('docker', [
    'inspect',
    '--format',
    '{"running":{{json .State.Running}},"health":{{json .State.Health.Status}},"labels":{{json .Config.Labels}},"ports":{{json .HostConfig.PortBindings}}}',
    id,
  ]);
  let actual;
  try {
    actual = JSON.parse(inspection.stdout);
  } catch {
    /* Fixed failure below. */
  }
  const bindings = actual?.ports?.['3301/tcp'];
  if (
    inspection.status !== 0 ||
    actual?.running !== true ||
    actual?.health !== 'healthy' ||
    actual.labels?.['com.docker.compose.project'] !== project ||
    actual.labels?.['com.docker.compose.service'] !== 'api' ||
    actual.labels?.['com.docker.compose.project.working_dir'] !== projectRoot ||
    actual.labels?.['com.docker.compose.project.config_files'] !==
      join(projectRoot, 'compose.yaml') ||
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    bindings[0].HostPort !== String(profiles[environment].port)
  )
    throw new Error('The running Liftory API does not match the owned loopback endpoint.');
  try {
    const response = await fetcher(target(environment) + '/api/health', {
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
      cache: 'no-store',
    });
    const body = await response.json();
    if (
      response.status === 200 &&
      body.status === 'ok' &&
      typeof body.version === 'string' &&
      /^[A-Za-z0-9._-]{1,80}$/.test(body.version)
    )
      return;
  } catch {
    /* Fixed failure below. */
  }
  throw new Error('The Liftory API readiness check failed; ingress was not changed.');
}

export function createLiftoryTunnel({
  home = homedir(),
  uid = process.getuid(),
  platform = process.platform,
  binaryDirectory,
  run = runTunnelCommand,
  health = verifyLiftoryBackend,
  now = Date.now,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  projectRoot = root,
} = {}) {
  const paths = tunnelPaths(home, uid);
  const binaries = () => resolveTunnelBinaries(binaryDirectory);
  const invoke = (command, args, options) => {
    try {
      return run(command, args, options);
    } catch {
      return { status: 1, stdout: '', stderr: '' };
    }
  };
  const success = (result) => !result.error && result.status === 0;
  const ts = (args, timeout = 5000) =>
    invoke(binaries().tailscale, ['--socket', paths.socket, ...args], { timeout });
  const loaded = () => success(invoke('/bin/launchctl', ['print', paths.job]));
  const parse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('The Liftory daemon returned unreadable status.');
    }
  };
  const writeMarker = (marker) => atomicWrite(paths.marker, JSON.stringify(marker, null, 2) + '\n');
  const readMarker = () => {
    checkedPath(paths.marker, uid, 'file');
    const marker = parse(readFileSync(paths.marker, 'utf8'));
    const routesValid = (routes) =>
      keysAre(routes, ['dev', 'prod']) &&
      ['dev', 'prod'].every((environment) => {
        const intent = routes[environment];
        return (
          intent === null ||
          (keysAre(intent, ['hostname', 'target']) &&
            typeof intent.hostname === 'string' &&
            dnsName(intent.hostname) === intent.hostname &&
            intent.target === target(environment))
        );
      });
    if (
      !keysAre(marker, [
        'schemaVersion',
        'label',
        'uid',
        'binaryDirectory',
        'routes',
        'previousRoutes',
      ]) ||
      marker.schemaVersion !== 1 ||
      marker.label !== label ||
      marker.uid !== uid ||
      marker.binaryDirectory !== binaries().directory ||
      !routesValid(marker.routes) ||
      !routesValid(marker.previousRoutes)
    )
      throw new Error(
        'The Liftory tunnel ownership record is invalid; preserve it for inspection.',
      );
    return marker;
  };
  const validateFiles = () => {
    directories(paths.directory, paths);
    privateTree(paths.directory, paths);
    directories(paths.agents, paths, false, false);
    const marker = readMarker();
    if (present(paths.plist)) {
      checkedPath(paths.plist, uid, 'file');
      if (readFileSync(paths.plist, 'utf8') !== liftoryLaunchAgent(paths, binaries()))
        throw new Error('The Liftory tunnel LaunchAgent differs from its owned configuration.');
    }
    return marker;
  };
  const readStatus = (timeout = 5000) => {
    const result = ts(['status', '--json'], timeout);
    if (result.error) throw new Error('The Liftory daemon status request failed or timed out.');
    const status = parse(result.stdout);
    if (
      !object(status) ||
      !['NoState', 'NeedsLogin', 'NeedsMachineAuth', 'Stopped', 'Starting', 'Running'].includes(
        status.BackendState,
      ) ||
      status.TUN !== false
    )
      throw new Error('Expected the dedicated Liftory userspace daemon.');
    return status;
  };
  const ready = async () => {
    const deadline = now() + 10000;
    while (now() < deadline) {
      try {
        return readStatus(Math.min(1500, Math.max(1, deadline - now())));
      } catch {
        await sleep(200);
      }
    }
    throw new Error('The dedicated Liftory daemon did not become ready within 10 seconds.');
  };
  const funnel = (marker) => {
    const result = ts(['funnel', 'status', '--json']);
    if (!success(result))
      throw new Error('Cannot inspect the dedicated Liftory Funnel configuration.');
    return managedLiftoryFunnel(parse(result.stdout), marker);
  };

  return async (command) => {
    if (command === 'help') return usage;
    if (!commands.includes(command)) throw new Error('Unknown Liftory tunnel command.');
    if (platform !== 'darwin' || uid === 0)
      throw new Error('Run Liftory tunnel commands as the Mac login user, without sudo.');
    if (Buffer.byteLength(paths.socket) > 100)
      throw new Error('The private Liftory socket path is too long for macOS.');
    if (!present(paths.marker) && command === 'status')
      return { installed: false, daemonReady: false, configurationVerified: false };
    if (!present(paths.marker) && command !== 'install')
      throw new Error('Install the dedicated Liftory tunnel first.');
    if (command === 'status') {
      const marker = validateFiles();
      const installed = present(paths.plist);
      if (!loaded()) return { installed, daemonReady: false, configurationVerified: false };
      let status;
      try {
        status = readStatus();
      } catch {
        return { installed, daemonReady: false, configurationVerified: false };
      }
      const summary = {
        installed,
        daemonReady: true,
        backendState: status.BackendState,
        hostname: dnsName(status.Self?.DNSName),
        healthWarnings: status.Health?.length ?? 0,
      };
      try {
        return { ...summary, routes: funnel(marker), configurationVerified: true };
      } catch {
        return { ...summary, configurationVerified: false };
      }
    }
    directories(paths.directory, paths, command === 'install');
    try {
      mkdirSync(paths.lock, { mode: 0o700 });
    } catch {
      throw new Error(
        'A Liftory tunnel operation or interrupted operation lock exists; inspect it before removal.',
      );
    }
    try {
      if (command === 'install') {
        directories(paths.agents, paths, true, false);
        const owned = present(paths.marker);
        if (
          !owned &&
          (loaded() ||
            present(paths.plist) ||
            readdirSync(paths.directory).some((entry) => entry !== 'operation.lock'))
        )
          throw new Error(
            'Existing Liftory tunnel files or LaunchAgent are unowned; refusing to adopt them.',
          );
        const marker = owned
          ? validateFiles()
          : {
              schemaVersion: 1,
              label,
              uid,
              binaryDirectory: binaries().directory,
              routes: blankRoutes(),
              previousRoutes: blankRoutes(),
            };
        directories(paths.stateDirectory, paths, true);
        if (!owned) writeMarker(marker);
        if (!present(paths.plist)) atomicWrite(paths.plist, liftoryLaunchAgent(paths, binaries()));
        if (
          !loaded() &&
          !success(invoke('/bin/launchctl', ['bootstrap', paths.domain, paths.plist]))
        )
          throw new Error(
            'Cannot start the Liftory user LaunchAgent; inspect the logged-in Mac session.',
          );
        const status = await ready();
        validateFiles();
        return { installed: true, daemonReady: true, backendState: status.BackendState };
      }
      const marker = validateFiles();
      if (command === 'uninstall') {
        if (
          Object.values(marker.routes).some(Boolean) ||
          Object.values(marker.previousRoutes).some(Boolean)
        )
          throw new Error('Disable both Liftory routes before uninstalling the daemon.');
        if (loaded()) {
          if (Object.values(funnel(marker)).some((route) => route.target))
            throw new Error('Disable both Liftory routes before uninstalling the daemon.');
          if (!success(invoke('/bin/launchctl', ['bootout', paths.job])))
            throw new Error('Cannot stop the owned Liftory LaunchAgent.');
        }
        rmSync(paths.plist, { force: true });
        return { installed: false, daemonReady: false, statePreserved: true };
      }
      if (!loaded()) throw new Error('The Liftory daemon is stopped; run install to resume it.');
      const status = await ready();
      if (command === 'login') {
        if (status.BackendState === 'Running')
          return { backendState: 'Running', loginRequired: false };
        const existing = browserURL(status.AuthURL, true);
        if (existing)
          return { backendState: status.BackendState, loginRequired: true, authURL: existing };
        const result = ts(
          [
            'up',
            '--json',
            '--timeout=10s',
            '--accept-dns=false',
            '--accept-routes=false',
            '--ssh=false',
            '--hostname=personal-liftory',
          ],
          13000,
        );
        const after = readStatus();
        if (after.BackendState === 'Running')
          return { backendState: 'Running', loginRequired: false };
        const candidates =
          `${result.stdout ?? ''}\n${result.stderr ?? ''}`.match(/https:\/\/[^\s<>"']+/g) ?? [];
        const authURL =
          browserURL(after.AuthURL, true) ??
          candidates.map((value) => browserURL(value, true)).find(Boolean);
        if (authURL) return { backendState: after.BackendState, loginRequired: true, authURL };
        if (after.BackendState === 'NeedsMachineAuth')
          return {
            backendState: after.BackendState,
            deviceApprovalRequired: true,
            approvalURL: 'https://console.tailscale.com/admin/machines',
          };
        throw new Error('A Liftory browser login URL is not available yet; inspect status.');
      }
      const environment = command.endsWith('-dev') ? 'dev' : 'prod';
      const port = String(profiles[environment].https);
      const before = funnel(marker);
      if (command.startsWith('disable-')) {
        if (before[environment].target) {
          if (!success(ts(['serve', '--bg', `--https=${port}`, '--set-path=/', 'off'])))
            throw new Error('Cannot disable the owned Liftory HTTPS handler.');
          const after = funnel(marker);
          preserveSibling(before, after, environment);
          if (after[environment].target)
            throw new Error('The Liftory HTTPS handler is still configured.');
        }
        marker.routes[environment] = null;
        marker.previousRoutes[environment] = null;
        writeMarker(marker);
        return { environment, enabled: false };
      }
      if (status.BackendState !== 'Running')
        throw new Error('Complete the dedicated Liftory browser login before publishing an API.');
      const name = dnsName(status.Self?.DNSName);
      if (!name) throw new Error('The Liftory daemon has no valid tailnet DNS hostname.');
      await health(environment, { run: invoke, projectRoot });
      marker.previousRoutes[environment] =
        [marker.routes[environment], marker.previousRoutes[environment]].find(
          (intent) =>
            intent?.target === before[environment].target &&
            intent?.hostname === before[environment].hostname,
        ) ?? null;
      marker.routes[environment] = { hostname: name, target: target(environment) };
      writeMarker(marker);
      const result = ts(
        ['funnel', '--bg', '--yes', `--https=${port}`, '--set-path=/', target(environment)],
        20000,
      );
      const after = funnel(marker);
      preserveSibling(before, after, environment);
      if (
        !after[environment].enabled ||
        after[environment].hostname !== name ||
        after[environment].target !== target(environment)
      ) {
        const candidates =
          `${result.stdout ?? ''}\n${result.stderr ?? ''}`.match(/https:\/\/[^\s<>"']+/g) ?? [];
        const approvalURL = candidates.map((value) => browserURL(value)).find(Boolean);
        if (approvalURL)
          return { environment, ...after[environment], approvalRequired: true, approvalURL };
        throw new Error('Liftory public HTTPS was not confirmed; inspect tunnel status.');
      }
      marker.previousRoutes[environment] = null;
      writeMarker(marker);
      return {
        environment,
        ...after[environment],
        configurationVerified: true,
        publicReachabilityVerified: false,
      };
    } finally {
      rmdirSync(paths.lock);
    }
  };
}

export const usage = `Usage: node scripts/tunnel.mjs COMMAND
Commands: install, status, login, enable-dev, disable-dev, enable-prod, disable-prod, uninstall
Owns only io.personal.liftory-tunnel and ~/.local/share/liftory/tunnel/.
Uses a fresh Tailscale node/identity; never adopts home-server's socket or state.
dev: HTTPS 443 -> verified Liftory API 127.0.0.1:3481; prod: HTTPS 8443 -> 127.0.0.1:3482.
install never logs in or publishes a new route. login returns an owner browser URL.
Each route is changed independently; unknown configuration is preserved and rejected.
uninstall requires both routes disabled and preserves private identity state.
See docs/tunnel.md for approvals, scope and external verification.
`;

export async function main(args) {
  try {
    const result = await createLiftoryTunnel()(parseTunnelArgs(args));
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    return 0;
  } catch {
    console.error(
      'Liftory tunnel operation failed. Inspect owned paths, status, login, lock and backend readiness.',
    );
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  process.exitCode = await main(process.argv.slice(2));
