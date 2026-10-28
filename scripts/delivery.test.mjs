import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseEnv } from 'node:util';
import { withBackendLock } from './backend.mjs';
import {
  atomicPrivateWrite,
  baselineDecision,
  deliveryPaths,
  deliveryStatus,
  deliveryTick,
  enableDelivery,
  pauseDelivery,
  recordDeliveryError,
  replaceReleaseConfig,
  repository,
  validateCandidate,
} from './delivery-core.mjs';
import { buildDeliveryPlist, installDeliveryAgent } from './deploy-host.mjs';
import { liveDeliveryAdapter } from './delivery.mjs';

const oldCommit = 'a'.repeat(40);
const newCommit = 'b'.repeat(40);
const image = (digest) => `ghcr.io/mykhailokurochkin/liftory-api@sha256:${digest.repeat(64)}`;

function source() {
  const shared = {
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    status: 'completed',
    conclusion: 'success',
  };
  return {
    candidate: {
      schema: 1,
      repository,
      branch: 'develop',
      commit: newCommit,
      platform: 'linux/amd64',
      image: image('e'),
      verifiedRunId: '123',
    },
    release: {
      ...shared,
      id: 456,
      event: 'workflow_run',
      name: 'Release backend',
      path: '.github/workflows/release.yml',
      workflow_id: 20,
      head_sha: oldCommit,
      head_branch: 'main',
    },
    ci: {
      ...shared,
      id: 123,
      event: 'push',
      name: 'CI',
      path: '.github/workflows/ci.yml',
      workflow_id: 10,
      head_sha: newCommit,
      head_branch: 'develop',
    },
    releaseWorkflowId: 20,
    ciWorkflowId: 10,
  };
}

function discovery(sources) {
  const requests = [];
  const downloads = [];
  const adapter = liveDeliveryAdapter(
    {},
    {
      request: async (path) => {
        requests.push(path);
        if (path === 'actions/workflows/release.yml')
          return { id: 20, path: '.github/workflows/release.yml' };
        if (path === 'actions/workflows/ci.yml')
          return { id: 10, path: '.github/workflows/ci.yml' };
        if (
          path ===
          'actions/workflows/release.yml/runs?event=workflow_run&status=success&per_page=10'
        )
          return { workflow_runs: sources.map((item) => item.release) };
        for (const item of sources) {
          if (path === `actions/runs/${item.release.id}/artifacts?per_page=100`)
            return {
              artifacts: [
                { id: item.release.id, name: `liftory-backend-${newCommit}`, expired: false },
              ],
            };
          if (path === `actions/runs/${item.ci.id}`) return item.ci;
        }
        throw new Error('Unexpected GitHub API fixture request.');
      },
      loadArtifact: async (_paths, artifact) => {
        downloads.push(artifact.id);
        const item = sources.find((item) => item.release.id === artifact.id);
        assert.ok(item, 'download must belong to a listed release');
        return item.candidate;
      },
    },
  );
  return { adapter, requests, downloads };
}

function mainSource() {
  const item = source();
  item.candidate.branch = 'main';
  item.candidate.verifiedRunId = '124';
  item.release.id = 457;
  item.ci.id = 124;
  item.ci.head_branch = 'main';
  return item;
}

function config() {
  return {
    LIFTORY_ENV: 'dev',
    LIFTORY_API_PORT: '3481',
    LIFTORY_API_IMAGE: image('d'),
    LIFTORY_API_COMMIT: oldCommit,
    LIFTORY_DB_NAME: 'liftory_dev',
    LIFTORY_DB_USER: 'liftory_dev',
    LIFTORY_DB_PASSWORD: 'c'.repeat(32),
    LIFTORY_DATABASE_URL: `postgresql://liftory_dev:${'c'.repeat(32)}@db:5432/liftory_dev`,
    LIFTORY_PUBLIC_ORIGIN: 'https://liftory-dev.example.invalid',
    BETTER_AUTH_SECRET: 'f'.repeat(48),
    GOOGLE_CLIENT_ID: 'placeholder-client.example.invalid',
    GOOGLE_CLIENT_SECRET: 'placeholder-private-secret',
    ALLOWED_EMAILS: 'owner@example.invalid',
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'liftory-delivery-test-'));
  const paths = deliveryPaths(directory);
  mkdirSync(join(directory, '.config/liftory'), { recursive: true, mode: 0o700 });
  const text =
    Object.entries(config())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';
  writeFileSync(paths.config, text, { mode: 0o600 });
  const runtime = {
    current: { id: 'old-container', image: image('d'), running: true, health: 'healthy' },
    applies: 0,
  };
  const adapter = {
    inspect: async () => runtime.current && { ...runtime.current },
    verify: async () => {},
    branchHead: async () => newCommit,
    candidate: async () => source(),
    apply: async (values) => {
      runtime.applies++;
      assert.ok(existsSync(paths.config + '.lock'), 'mutation must retain the shared backend lock');
      runtime.current = {
        id: 'new-container',
        image: values.LIFTORY_API_IMAGE,
        running: true,
        health: 'healthy',
      };
    },
  };
  return {
    paths,
    text,
    adapter,
    runtime,
    clean: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('candidate binds trusted release workflow to successful push CI at current develop SHA', () => {
  const valid = source();
  assert.equal(validateCandidate(valid.candidate, valid, newCommit).image, image('e'));
  for (const patch of [
    { repository: 'foreign/repo' },
    { branch: 'main' },
    { commit: oldCommit },
    { platform: 'linux/arm64' },
    { image: 'ghcr.io/mykhailokurochkin/liftory-api:latest' },
    { verifiedRunId: '999' },
    { unexpected: true },
  ])
    assert.throws(() => validateCandidate({ ...valid.candidate, ...patch }, valid, newCommit));
  for (const change of [
    (item) => {
      item.ci.event = 'pull_request';
    },
    (item) => {
      item.ci.conclusion = 'failure';
    },
    (item) => {
      item.ci.head_repository = { full_name: 'fork/liftory' };
    },
    (item) => {
      item.ci.head_sha = oldCommit;
    },
    (item) => {
      item.ci.workflow_id = 99;
    },
    (item) => {
      item.release.path = '.github/workflows/other.yml';
    },
    (item) => {
      item.release.conclusion = 'cancelled';
    },
  ]) {
    const invalid = source();
    change(invalid);
    assert.throws(() => validateCandidate(invalid.candidate, invalid, newCommit));
  }
});

test('live discovery skips a newer main artifact at the same SHA and finds develop provenance', async () => {
  const main = mainSource();
  const develop = source();
  const f = discovery([main, develop]);
  const selected = await f.adapter.candidate(newCommit);
  assert.deepEqual(f.downloads, [main.release.id, develop.release.id]);
  assert.equal(selected.release.id, develop.release.id);
  assert.equal(selected.ci.id, develop.ci.id);
  assert.equal(validateCandidate(selected.candidate, selected, newCommit).branch, 'develop');
  assert.ok(!f.requests.includes(`actions/runs/${main.ci.id}`));
});

test('live discovery reports no verified dev release when only a matching main artifact exists', async () => {
  const main = mainSource();
  const f = discovery([main]);
  assert.equal(await f.adapter.candidate(newCommit), null);
  assert.deepEqual(f.downloads, [main.release.id]);
});

test('live discovery preserves strict CI provenance and rejects unexpected artifact branches', async () => {
  for (const alter of [
    (item) => {
      item.ci.head_branch = 'main';
    },
    (item) => {
      item.ci.event = 'pull_request';
    },
    (item) => {
      item.candidate.branch = 'unexpected';
    },
  ]) {
    const item = source();
    alter(item);
    const selected = await discovery([item]).adapter.candidate(newCommit);
    assert.throws(() => validateCandidate(selected.candidate, selected, newCommit));
  }
  const malformed = source();
  malformed.candidate.verifiedRunId = '../other';
  await assert.rejects(
    discovery([malformed]).adapter.candidate(newCommit),
    /Invalid verified run ID/,
  );
});

test('config replacement changes only image and commit and rejects duplicate or injected fields', () => {
  const f = fixture();
  try {
    const updated = replaceReleaseConfig(f.text, source().candidate);
    assert.equal(updated, f.text.replace(image('d'), image('e')).replace(oldCommit, newCommit));
    assert.equal(parseEnv(updated).GOOGLE_CLIENT_SECRET, config().GOOGLE_CLIENT_SECRET);
    assert.throws(() =>
      replaceReleaseConfig(f.text + `LIFTORY_API_IMAGE=${image('d')}\n`, source().candidate),
    );
    assert.throws(() =>
      replaceReleaseConfig(f.text, {
        ...source().candidate,
        image: image('e') + '\nINJECTED=true',
      }),
    );
  } finally {
    f.clean();
  }
});

test('baseline respects pause, manual stop, container replacement and config changes', () => {
  const control = { enabled: true, generation: 'one' };
  const state = {
    baseline: { generation: 'one', containerId: 'id', image: 'image', configHash: 'hash' },
  };
  const current = { id: 'id', image: 'image', running: true, health: 'healthy' };
  assert.equal(baselineDecision(control, state, current, 'hash'), 'ready');
  assert.equal(baselineDecision({ ...control, enabled: false }, state, current, 'hash'), 'paused');
  assert.equal(baselineDecision(control, state, null, 'hash'), 'stopped_or_unhealthy');
  assert.equal(
    baselineDecision(control, state, { ...current, running: false }, 'hash'),
    'stopped_or_unhealthy',
  );
  assert.equal(
    baselineDecision(control, state, { ...current, id: 'manual-new' }, 'hash'),
    'manual_change',
  );
  assert.equal(baselineDecision(control, state, current, 'changed'), 'manual_change');
  assert.equal(
    baselineDecision(control, { ...state, inFlight: {} }, current, 'hash'),
    'unknown_previous_operation',
  );
});

test('disabled controller never consults GitHub or mutates containers', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await deliveryTick(f.paths, {}), { status: 'paused' });
    assert.equal(f.runtime.applies, 0);
    assert.equal(deliveryStatus(f.paths).enabled, false);
  } finally {
    f.clean();
  }
});

test('verified candidate updates private dev config and healthy baseline once', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    assert.deepEqual(await deliveryTick(f.paths, f.adapter), { status: 'applied' });
    assert.equal(f.runtime.applies, 1);
    assert.equal(parseEnv(readFileSync(f.paths.config, 'utf8')).LIFTORY_API_COMMIT, newCommit);
    assert.equal(statSync(f.paths.config).mode & 0o077, 0);
    assert.equal(deliveryStatus(f.paths).commit, newCommit);
    assert.equal(deliveryStatus(f.paths).attempts, 0);
    assert.deepEqual(await deliveryTick(f.paths, f.adapter), { status: 'already_current' });
    assert.equal(f.runtime.applies, 1);
  } finally {
    f.clean();
  }
});

test('pause during preparation and manual stop before mutation are respected', async () => {
  for (const mode of ['pause', 'stop']) {
    const f = fixture();
    try {
      await enableDelivery(f.paths, f.adapter);
      f.adapter.candidate = async () => {
        if (mode === 'pause') pauseDelivery(f.paths);
        else f.runtime.current.running = false;
        return source();
      };
      const result = await deliveryTick(f.paths, f.adapter);
      assert.equal(
        result.status,
        mode === 'pause' ? 'paused_before_apply' : 'stopped_or_unhealthy',
      );
      assert.equal(f.runtime.applies, 0);
      assert.equal(readFileSync(f.paths.config, 'utf8'), f.text);
    } finally {
      f.clean();
    }
  }
});

test('branch movement after download rejects the stale candidate', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    let reads = 0;
    f.adapter.branchHead = async () => (++reads === 1 ? newCommit : oldCommit);
    assert.deepEqual(await deliveryTick(f.paths, f.adapter), { status: 'stale_release' });
    assert.equal(f.runtime.applies, 0);
    assert.equal(readFileSync(f.paths.config, 'utf8'), f.text);
  } finally {
    f.clean();
  }
});

test('safe preflight failures have backoff and stop after three attempts', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    let calls = 0;
    f.adapter.candidate = async () => {
      calls++;
      throw new Error('synthetic network failure');
    };
    assert.equal((await deliveryTick(f.paths, f.adapter, 0)).status, 'preflight_failed');
    assert.equal((await deliveryTick(f.paths, f.adapter, 1)).status, 'retry_later');
    assert.equal((await deliveryTick(f.paths, f.adapter, 60000)).status, 'preflight_failed');
    assert.equal((await deliveryTick(f.paths, f.adapter, 180000)).status, 'preflight_failed');
    assert.equal((await deliveryTick(f.paths, f.adapter, 500000)).status, 'attempts_exhausted');
    assert.equal(calls, 3);
    assert.equal(f.runtime.applies, 0);
  } finally {
    f.clean();
  }
});

test('failed branch discovery honors backoff before another inspection or GitHub request', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    let heads = 0;
    let inspections = 0;
    f.adapter.inspect = async () => {
      inspections++;
      return { ...f.runtime.current };
    };
    f.adapter.branchHead = async () => {
      heads++;
      throw new Error('synthetic GitHub outage');
    };
    assert.equal((await deliveryTick(f.paths, f.adapter, 0)).status, 'preflight_failed');
    assert.equal((await deliveryTick(f.paths, f.adapter, 1)).status, 'retry_later');
    assert.equal(heads, 1);
    assert.equal(inspections, 1);
    assert.equal((await deliveryTick(f.paths, f.adapter, 60000)).status, 'preflight_failed');
    assert.equal((await deliveryTick(f.paths, f.adapter, 60001)).status, 'retry_later');
    assert.equal(heads, 2);
    assert.equal(inspections, 2);
    assert.equal((await deliveryTick(f.paths, f.adapter, 180000)).status, 'preflight_failed');
    assert.equal((await deliveryTick(f.paths, f.adapter, 500000)).status, 'attempts_exhausted');
    assert.equal(heads, 3);
    assert.equal(inspections, 3);
    assert.equal(f.runtime.applies, 0);
  } finally {
    f.clean();
  }
});

test('unvalidated branch response preserves retry budget; validated movement permits a new release', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    f.adapter.candidate = async () => {
      throw new Error('synthetic artifact outage');
    };
    assert.equal((await deliveryTick(f.paths, f.adapter, 0)).status, 'preflight_failed');
    f.adapter.branchHead = async () => 'invalid-head';
    assert.equal((await deliveryTick(f.paths, f.adapter, 60000)).status, 'preflight_failed');
    const state = JSON.parse(readFileSync(f.paths.state, 'utf8'));
    assert.equal(state.attempts.commit, newCommit);
    assert.equal(state.attempts.count, 2);
    assert.equal((await deliveryTick(f.paths, f.adapter, 60001)).status, 'retry_later');
    const moved = 'c'.repeat(40);
    f.adapter.branchHead = async () => moved;
    f.adapter.candidate = async () => {
      const item = source();
      item.candidate.commit = moved;
      item.ci.head_sha = moved;
      return item;
    };
    assert.equal((await deliveryTick(f.paths, f.adapter, 180000)).status, 'applied');
    assert.equal(deliveryStatus(f.paths).commit, moved);
    assert.equal(deliveryStatus(f.paths).attempts, 0);
  } finally {
    f.clean();
  }
});

test('unknown mutation is persisted and never automatically retried', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    f.adapter.apply = async () => {
      f.runtime.applies++;
      throw new Error('synthetic interruption');
    };
    assert.equal((await deliveryTick(f.paths, f.adapter)).status, 'unknown_operation');
    assert.equal(deliveryStatus(f.paths).unknownOperation, true);
    assert.equal((await deliveryTick(f.paths, f.adapter)).status, 'unknown_previous_operation');
    assert.equal(f.runtime.applies, 1);
    await assert.rejects(enableDelivery(f.paths, f.adapter));
    f.runtime.current = {
      ...f.runtime.current,
      image: image('e'),
      id: 'reconciled',
      health: 'healthy',
    };
    await enableDelivery(f.paths, f.adapter);
    assert.equal(deliveryStatus(f.paths).unknownOperation, false);
  } finally {
    f.clean();
  }
});

test('delivery and backend operation locks serialize mutations', async () => {
  const f = fixture();
  try {
    await enableDelivery(f.paths, f.adapter);
    mkdirSync(f.paths.lock, { mode: 0o700 });
    assert.deepEqual(await deliveryTick(f.paths, f.adapter), { status: 'locked' });
    rmSync(f.paths.lock, { recursive: true });
    await withBackendLock(f.paths.config, async () => {
      assert.equal((await deliveryTick(f.paths, f.adapter)).status, 'preflight_failed');
      assert.equal(f.runtime.applies, 0);
    });
    assert.equal(existsSync(f.paths.config + '.lock'), false);
    atomicPrivateWrite(f.paths.config, f.text + '# manual edit\n');
    assert.equal((await deliveryTick(f.paths, f.adapter)).status, 'manual_change');
  } finally {
    f.clean();
  }
});

test('LaunchAgent runs fixed dev-only controller without shell or credentials', () => {
  const plist = buildDeliveryPlist({
    node: '/private/tools/node',
    project: '/Users/test/A&B/liftory',
    base: '/Users/test',
  });
  assert.ok(plist.includes('io.personal.liftory.delivery-dev'));
  assert.ok(plist.includes('/Users/test/A&amp;B/liftory/scripts/delivery.mjs'));
  assert.ok(plist.includes('<integer>60</integer>'));
  assert.ok(plist.includes('<string>tick</string>'));
  assert.ok(!plist.includes('sh -c'));
  assert.ok(!plist.includes('GOOGLE_CLIENT_SECRET'));
  assert.ok(!plist.includes('prod'));
  assert.equal(plist.match(/<string>\/dev\/null<\/string>/g)?.length, 2);
});

test('background failures keep only the latest bounded private error summary', () => {
  const f = fixture();
  try {
    recordDeliveryError(f.paths, 100);
    recordDeliveryError(f.paths, 200);
    assert.deepEqual(deliveryStatus(f.paths).lastError, {
      schema: 1,
      code: 'controller_failed',
      at: 200,
    });
    assert.ok(statSync(f.paths.error).size < 200);
    assert.equal(statSync(f.paths.error).mode & 0o077, 0);
  } finally {
    f.clean();
  }
});

test('installer refuses an unknown loaded job before writing or bootstrapping a plist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liftory-agent-install-'));
  const file = join(directory, 'LaunchAgents/io.personal.liftory.delivery-dev.plist');
  const content = buildDeliveryPlist({
    node: '/private/tools/node',
    project: '/Users/test/liftory',
    base: '/Users/test',
  });
  let bootstraps = 0;
  try {
    assert.throws(() =>
      installDeliveryAgent({
        file,
        content,
        isLoaded: () => true,
        bootstrap: () => {
          bootstraps++;
        },
      }),
    );
    assert.equal(existsSync(file), false);
    assert.equal(bootstraps, 0);
    installDeliveryAgent({
      file,
      content,
      isLoaded: () => false,
      bootstrap: () => {
        bootstraps++;
      },
    });
    assert.equal(readFileSync(file, 'utf8'), content);
    assert.equal(statSync(file).mode & 0o077, 0);
    assert.equal(bootstraps, 1);
    installDeliveryAgent({
      file,
      content,
      isLoaded: () => true,
      bootstrap: () => {
        bootstraps++;
      },
    });
    assert.equal(bootstraps, 1);
    writeFileSync(file, 'foreign agent', { mode: 0o600 });
    assert.throws(() =>
      installDeliveryAgent({
        file,
        content,
        isLoaded: () => true,
        bootstrap: () => {
          bootstraps++;
        },
      }),
    );
    assert.equal(readFileSync(file, 'utf8'), 'foreign agent');
    assert.equal(bootstraps, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
