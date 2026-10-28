import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  createLiftoryTunnel,
  liftoryLaunchAgent,
  managedLiftoryFunnel,
  parseTunnelArgs,
  resolveTunnelBinaries,
  tunnelPaths,
  verifyLiftoryBackend,
} from './tunnel.mjs';

const hostname = 'personal-liftory.example-tailnet.ts.net';
const devTarget = 'http://127.0.0.1:3481';
const prodTarget = 'http://127.0.0.1:3482';

function harness(t) {
  const home = realpathSync(mkdtempSync('/tmp/liftory-tunnel-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const binaryDirectory = join(home, 'bin');
  mkdirSync(binaryDirectory, { mode: 0o700 });
  for (const name of ['tailscale', 'tailscaled'])
    writeFileSync(join(binaryDirectory, name), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const paths = tunnelPaths(home);
  const calls = [];
  const state = {
    home,
    paths,
    calls,
    loaded: false,
    ready: true,
    healthy: true,
    clock: 0,
    config: null,
    status: { BackendState: 'NeedsLogin', TUN: false, Health: [], Self: {} },
    failure: null,
    dropSibling: false,
    login() {
      state.status.BackendState = 'Running';
      state.status.Self.DNSName = hostname + '.';
      delete state.status.AuthURL;
    },
  };
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === '/bin/launchctl') {
      if (args[0] === 'print') return { status: state.loaded ? 0 : 1, stdout: '' };
      if (args[0] === 'bootstrap') state.loaded = true;
      if (args[0] === 'bootout') state.loaded = false;
      return ok();
    }
    assert.equal(command, join(binaryDirectory, 'tailscale'));
    assert.deepEqual(args.slice(0, 2), ['--socket', paths.socket]);
    const argv = args.slice(2);
    if (argv[0] === 'status')
      return state.ready ? ok(JSON.stringify(state.status)) : { status: 1, stdout: '' };
    if (argv[0] === 'up') {
      state.status.AuthURL = state.authURL ?? 'https://login.tailscale.com/a/LiftoryOwnerLogin';
      return { status: 1, stdout: JSON.stringify({ AuthURL: state.status.AuthURL }), stderr: '' };
    }
    if (argv[0] === 'funnel' && argv[1] === 'status') return ok(JSON.stringify(state.config));
    const port = argv.find((arg) => arg.startsWith('--https='))?.split('=')[1];
    assert.ok(['443', '8443'].includes(port));
    if (argv[0] === 'funnel') {
      if (state.failure) return { status: 1, stdout: '', stderr: state.failure };
      if (state.dropSibling) state.config = null;
      state.config ??= { TCP: {}, Web: {}, AllowFunnel: {} };
      state.config.TCP[port] = { HTTPS: true };
      state.config.Web[`${hostname}:${port}`] = { Handlers: { '/': { Proxy: argv.at(-1) } } };
      state.config.AllowFunnel[`${hostname}:${port}`] = true;
      return ok();
    }
    if (argv[0] === 'serve') {
      assert.equal(argv.at(-1), 'off');
      delete state.config.TCP[port];
      delete state.config.Web[`${hostname}:${port}`];
      delete state.config.AllowFunnel[`${hostname}:${port}`];
      if (!Object.keys(state.config.TCP).length) state.config = null;
      return ok();
    }
    throw new Error('Unexpected test command.');
  };
  state.exec = createLiftoryTunnel({
    home,
    platform: 'darwin',
    binaryDirectory,
    run,
    now: () => state.clock,
    sleep: async (milliseconds) => {
      state.clock += milliseconds;
    },
    health: async () => {
      if (!state.healthy) throw new Error('Backend is not ready.');
    },
  });
  state.mutations = () =>
    calls.filter(
      ({ args }) => args[2] === 'serve' || (args[2] === 'funnel' && args[3] !== 'status'),
    );
  state.marker = () => JSON.parse(readFileSync(paths.marker, 'utf8'));
  return state;
}

test('the CLI accepts only fixed Liftory commands and independent state paths', () => {
  assert.equal(parseTunnelArgs([]), 'help');
  assert.equal(parseTunnelArgs(['enable-dev']), 'enable-dev');
  for (const argv of [
    ['enable'],
    ['--socket', '/elsewhere'],
    ['enable-dev', 'http://127.0.0.1:22'],
    ['login', '--auth-key=secret'],
  ])
    assert.throws(() => parseTunnelArgs(argv), /one Liftory tunnel command/);
  const paths = tunnelPaths('/Users/owner', 501);
  assert.equal(paths.socket, '/Users/owner/.local/share/liftory/tunnel/tailscaled.sock');
  assert.equal(paths.job, 'gui/501/io.personal.liftory-tunnel');
  assert.ok(!JSON.stringify(paths).includes('personal-home-server'));
});

test('install creates a fresh private userspace daemon without login or new public routes', async (t) => {
  const h = harness(t);
  assert.equal((await h.exec('status')).installed, false);
  await h.exec('install');
  assert.equal((await h.exec('status')).configurationVerified, true);
  assert.equal(h.mutations().length, 0);
  assert.ok(!h.calls.some(({ args }) => args[2] === 'up'));
  assert.equal(lstatSync(h.paths.directory).mode & 0o777, 0o700);
  assert.equal(lstatSync(h.paths.marker).mode & 0o777, 0o600);
  assert.equal(lstatSync(h.paths.plist).mode & 0o777, 0o600);
  const plist = readFileSync(h.paths.plist, 'utf8');
  assert.ok(plist.includes('--tun=userspace-networking'));
  assert.ok(plist.includes(h.paths.socket));
  assert.ok(!plist.includes('personal-home-server'));
  const bootstraps = h.calls.filter(({ args }) => args[0] === 'bootstrap').length;
  await h.exec('install');
  assert.equal(h.calls.filter(({ args }) => args[0] === 'bootstrap').length, bootstraps);
});

test('login is bounded, returns only an official owner URL and disables host networking features', async (t) => {
  const h = harness(t);
  await h.exec('install');
  const login = await h.exec('login');
  assert.equal(login.authURL, 'https://login.tailscale.com/a/LiftoryOwnerLogin');
  const up = h.calls.find(({ args }) => args[2] === 'up');
  for (const flag of [
    '--json',
    '--timeout=10s',
    '--accept-dns=false',
    '--accept-routes=false',
    '--ssh=false',
    '--hostname=personal-liftory',
  ])
    assert.ok(up.args.includes(flag));
  assert.equal(up.options.timeout, 13000);
  h.login();
  const count = h.calls.filter(({ args }) => args[2] === 'up').length;
  assert.equal((await h.exec('login')).loginRequired, false);
  assert.equal(h.calls.filter(({ args }) => args[2] === 'up').length, count);
});

test('untrusted authentication URLs never escape the explicit login response', async (t) => {
  for (const authURL of [
    'http://login.tailscale.com/a/Bad',
    'https://evil.test/a/Bad',
    'https://login.tailscale.com.evil.test/a/Bad',
    'https://secret@login.tailscale.com/a/Bad',
    'https://login.tailscale.com/a/Bad?secret=token',
  ]) {
    const h = harness(t);
    await h.exec('install');
    h.authURL = authURL;
    await assert.rejects(h.exec('login'), /browser login URL/);
  }
});

test('dev and prod public routes preserve siblings and use only the fixed loopback APIs', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.login();
  const dev = await h.exec('enable-dev');
  assert.equal(dev.publicURL, `https://${hostname}`);
  assert.equal(dev.target, devTarget);
  assert.equal(dev.publicReachabilityVerified, false);
  const originalDev = structuredClone(h.config.Web[`${hostname}:443`]);
  const prod = await h.exec('enable-prod');
  assert.equal(prod.publicURL, `https://${hostname}:8443`);
  assert.equal(prod.target, prodTarget);
  assert.deepEqual(h.config.Web[`${hostname}:443`], originalDev);
  await h.exec('disable-dev');
  const status = await h.exec('status');
  assert.equal(status.routes.dev.enabled, false);
  assert.equal(status.routes.prod.enabled, true);
  assert.equal(h.config.Web[`${hostname}:8443`].Handlers['/'].Proxy, prodTarget);
  assert.equal(h.mutations().at(-1).args.includes('--https=443'), true);
  assert.ok(!h.calls.some(({ args }) => args.includes('reset') || args.includes('logout')));
});

test('unknown ports, paths, targets, foreground entries and TCP forwarding are preserved and rejected', async (t) => {
  const changes = [
    (config) => {
      config.TCP['22'] = { TCPForward: '127.0.0.1:22' };
    },
    (config) => {
      config.Web[`${hostname}:443`].Handlers['/private'] = { Proxy: 'http://127.0.0.1:22' };
    },
    (config) => {
      config.Web[`${hostname}:443`].Handlers['/'].Proxy = 'http://127.0.0.1:5432';
    },
    (config) => {
      config.TCP['443'] = { TCPForward: '127.0.0.1:22' };
    },
    (config) => {
      config.Foreground = { foreign: {} };
    },
    (config) => {
      config.Services = { foreign: {} };
    },
  ];
  for (const change of changes) {
    const h = harness(t);
    await h.exec('install');
    h.login();
    await h.exec('enable-dev');
    change(h.config);
    const before = structuredClone(h.config);
    const mutations = h.mutations().length;
    await assert.rejects(h.exec('enable-prod'), /Unknown Liftory Funnel/);
    await assert.rejects(h.exec('disable-dev'), /Unknown Liftory Funnel/);
    assert.equal((await h.exec('status')).configurationVerified, false);
    assert.equal(h.mutations().length, mutations);
    assert.deepEqual(h.config, before);
  }
});

test('a handler cannot be adopted just because it uses a fixed Liftory port', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.login();
  h.config = {
    TCP: { 443: { HTTPS: true } },
    Web: { [`${hostname}:443`]: { Handlers: { '/': { Proxy: devTarget } } } },
    AllowFunnel: { [`${hostname}:443`]: true },
  };
  await assert.rejects(h.exec('enable-dev'), /Unknown Liftory Funnel/);
  assert.equal(h.mutations().length, 0);
});

test('failed readiness never records publication intent or mutates public ingress', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.login();
  h.healthy = false;
  await assert.rejects(h.exec('enable-dev'), /Backend is not ready/);
  assert.equal(h.marker().routes.dev, null);
  assert.equal(h.mutations().length, 0);
});

test('failed publication preserves ownership and returns only approved Funnel browser URLs', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.login();
  await h.exec('enable-dev');
  const original = structuredClone(h.config);
  h.failure = 'opaque-provider-secret https://login.tailscale.com/f/funnel?node=example';
  const result = await h.exec('enable-prod');
  assert.equal(result.approvalRequired, true);
  assert.equal(result.approvalURL, 'https://login.tailscale.com/f/funnel?node=example');
  assert.ok(!JSON.stringify(result).includes('opaque-provider-secret'));
  assert.deepEqual(h.config, original);
  assert.equal((await h.exec('status')).configurationVerified, true);
  h.failure = 'opaque-provider-secret https://evil.test/approve';
  await assert.rejects(h.exec('enable-prod'), /public HTTPS was not confirmed/);
  await h.exec('disable-dev');
  assert.equal(h.config, null);
});

test('losing a sibling route during an enable operation is not reported as success', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.login();
  await h.exec('enable-dev');
  h.dropSibling = true;
  await assert.rejects(h.exec('enable-prod'), /sibling Liftory route/);
});

test('uninstall requires disabled routes, stops only the Liftory daemon and preserves its identity', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.login();
  await h.exec('enable-dev');
  writeFileSync(h.paths.state, 'liftory-identity-sentinel', { mode: 0o600 });
  await assert.rejects(h.exec('uninstall'), /Disable both Liftory routes/);
  assert.equal(h.loaded, true);
  await h.exec('disable-dev');
  const result = await h.exec('uninstall');
  assert.equal(result.statePreserved, true);
  assert.equal(h.loaded, false);
  assert.equal(existsSync(h.paths.plist), false);
  assert.equal(readFileSync(h.paths.state, 'utf8'), 'liftory-identity-sentinel');
  assert.deepEqual(
    h.calls.filter(({ args }) => args[0] === 'bootout').map(({ args }) => args[1]),
    [h.paths.job],
  );
});

test('read-only status hides login URLs, peers and daemon private fields', async (t) => {
  const h = harness(t);
  await h.exec('install');
  h.status.AuthURL = 'https://login.tailscale.com/a/PrivateLogin';
  h.status.Peers = ['private-peer-sentinel'];
  h.status.PrivateKey = 'private-key-sentinel';
  const status = JSON.stringify(await h.exec('status'));
  for (const secret of ['PrivateLogin', 'private-peer-sentinel', 'private-key-sentinel', 'AuthURL'])
    assert.ok(!status.includes(secret));
});

test('permission changes, symlinks, hard links and unknown LaunchAgents are never adopted', async (t) => {
  const changes = [
    (h) => chmodSync(h.paths.marker, 0o644),
    (h) => linkSync(h.paths.marker, join(h.home, 'marker-link')),
    (h) => {
      rmSync(h.paths.marker);
      symlinkSync('/tmp/unrelated', h.paths.marker);
    },
    (h) => writeFileSync(h.paths.plist, '<foreign-agent/>'),
    (h) => chmodSync(h.paths.directory, 0o755),
  ];
  for (const change of changes) {
    const h = harness(t);
    await h.exec('install');
    h.login();
    change(h);
    await assert.rejects(h.exec('enable-dev'));
    assert.equal(h.mutations().length, 0);
  }
  const h = harness(t);
  mkdirSync(dirname(h.paths.directory), { recursive: true, mode: 0o700 });
  symlinkSync('/tmp', h.paths.directory);
  await assert.rejects(h.exec('install'), /private|symlinks/);
  assert.equal(h.calls.length, 0);
});

test('a stale operation lock is preserved and daemon readiness has a fixed deadline', async (t) => {
  const h = harness(t);
  await h.exec('install');
  mkdirSync(h.paths.lock, { mode: 0o700 });
  await assert.rejects(h.exec('login'), /operation lock/);
  assert.equal(existsSync(h.paths.lock), true);
  rmdir(h.paths.lock);
  const unavailable = harness(t);
  unavailable.ready = false;
  await assert.rejects(unavailable.exec('install'), /within 10 seconds/);
  assert.equal(unavailable.clock, 10000);
  assert.equal(existsSync(unavailable.paths.lock), false);
});

function rmdir(path) {
  rmSync(path, { recursive: true });
}

test('socket and renewed public certificate modes retain a private directory boundary', async (t) => {
  const h = harness(t);
  await h.exec('install');
  const certs = join(h.paths.stateDirectory, 'certs');
  mkdirSync(certs, { mode: 0o700 });
  const certificate = join(certs, `${hostname}.crt`);
  writeFileSync(certificate, 'public-certificate', { mode: 0o644 });
  chmodSync(certificate, 0o644);
  const server = createServer();
  await new Promise((done) => server.listen(h.paths.socket, done));
  try {
    chmodSync(h.paths.socket, 0o666);
    assert.equal((await h.exec('status')).configurationVerified, true);
    assert.equal(lstatSync(certificate).mode & 0o777, 0o644);
    const key = join(certs, `${hostname}.key`);
    writeFileSync(key, 'private-key-sentinel', { mode: 0o644 });
    chmodSync(key, 0o644);
    await assert.rejects(h.exec('status'), /private/);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('the LaunchAgent escapes paths and uses resolved executables from one installation', (t) => {
  const h = harness(t);
  const binaries = resolveTunnelBinaries(join(h.home, 'bin'));
  const plist = liftoryLaunchAgent(tunnelPaths('/Users/a&b', 501), binaries);
  assert.ok(plist.includes('/Users/a&amp;b/'));
  assert.ok(plist.includes(binaries.tailscaled));
  chmodSync(binaries.tailscale, 0o777);
  assert.throws(() => resolveTunnelBinaries(join(h.home, 'bin')), /public write access/);
});

test('backend exposure requires own healthy Compose API with exact loopback-only binding', async () => {
  const projectRoot = '/Users/owner/projects/personal-development/liftory';
  const actual = {
    running: true,
    health: 'healthy',
    labels: {
      'com.docker.compose.project': 'personal-liftory-dev',
      'com.docker.compose.service': 'api',
      'com.docker.compose.project.working_dir': projectRoot,
      'com.docker.compose.project.config_files': join(projectRoot, 'compose.yaml'),
    },
    ports: { '3301/tcp': [{ HostIp: '127.0.0.1', HostPort: '3481' }] },
  };
  const run = (_command, args) => ({
    status: 0,
    stdout: args[0] === 'container' ? 'a'.repeat(64) : JSON.stringify(actual),
  });
  const fetcher = async (url, options) => {
    assert.equal(url, devTarget + '/api/health');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ status: 'ok', version: 'a'.repeat(40) }));
  };
  await verifyLiftoryBackend('dev', { run, fetcher, projectRoot });
  for (const change of [
    () => {
      actual.running = false;
    },
    () => {
      actual.health = 'starting';
    },
    () => {
      actual.labels['com.docker.compose.project'] = 'foreign';
    },
    () => {
      actual.labels['com.docker.compose.project.working_dir'] = '/foreign';
    },
    () => {
      actual.ports['3301/tcp'][0].HostIp = '0.0.0.0';
    },
    () => {
      actual.ports['3301/tcp'][0].HostPort = '3482';
    },
  ]) {
    const original = structuredClone(actual);
    change();
    await assert.rejects(
      verifyLiftoryBackend('dev', { run, fetcher, projectRoot }),
      /owned loopback endpoint/,
    );
    Object.assign(actual, original);
  }
  await assert.rejects(
    verifyLiftoryBackend('dev', { run, fetcher: async () => new Response('<html>'), projectRoot }),
    /readiness check failed/,
  );
  await assert.rejects(
    verifyLiftoryBackend('dev', {
      run,
      fetcher: async () => new Response('{}', { status: 503 }),
      projectRoot,
    }),
    /readiness check failed/,
  );
});

test('raw TCP forwards and extra configuration keys cannot count as managed Liftory HTTPS', () => {
  assert.throws(
    () =>
      managedLiftoryFunnel(
        { TCP: { 443: { TCPForward: '127.0.0.1:22' } } },
        { routes: {}, previousRoutes: {} },
      ),
    /Unknown Liftory Funnel/,
  );
  assert.throws(
    () => managedLiftoryFunnel({ Foreign: {} }, { routes: {}, previousRoutes: {} }),
    /Unknown Liftory Funnel/,
  );
});
