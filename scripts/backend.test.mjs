import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyBackend,
  loadBackendConfig,
  validateBackendConfig,
  verifyBackend,
  withBackendLock,
} from './backend.mjs';

function config(environment = 'dev') {
  return {
    LIFTORY_ENV: environment,
    LIFTORY_API_PORT: environment === 'dev' ? '3481' : '3482',
    LIFTORY_API_IMAGE: 'ghcr.io/mykhailokurochkin/liftory-api@sha256:' + 'a'.repeat(64),
    LIFTORY_API_COMMIT: 'b'.repeat(40),
    LIFTORY_DB_NAME: `liftory_${environment}`,
    LIFTORY_DB_USER: `liftory_${environment}`,
    LIFTORY_DB_PASSWORD: 'c'.repeat(32),
    LIFTORY_DATABASE_URL: `postgresql://liftory_${environment}:${'c'.repeat(32)}@db:5432/liftory_${environment}`,
    LIFTORY_PUBLIC_ORIGIN: `https://liftory-${environment}.example.invalid`,
    BETTER_AUTH_SECRET: 'd'.repeat(48),
    GOOGLE_CLIENT_ID: 'test-client.example.invalid',
    GOOGLE_CLIENT_SECRET: 'test-placeholder-secret',
    ALLOWED_EMAILS: 'owner@example.invalid',
  };
}

test('dev and prod use separate database names and loopback ports', () => {
  assert.equal(validateBackendConfig(config('dev'), 'dev').LIFTORY_API_PORT, '3481');
  assert.equal(validateBackendConfig(config('prod'), 'prod').LIFTORY_DB_NAME, 'liftory_prod');
  assert.throws(() => validateBackendConfig(config('dev'), 'prod'));
  assert.throws(() => validateBackendConfig({ ...config(), LIFTORY_API_PORT: '3482' }, 'dev'));
  assert.throws(() =>
    validateBackendConfig({ ...config(), LIFTORY_DB_NAME: 'liftory_prod' }, 'dev'),
  );
});

test('delivery requires an immutable expected registry image and commit', () => {
  for (const LIFTORY_API_IMAGE of [
    'ghcr.io/mykhailokurochkin/liftory-api:latest',
    'ghcr.io/another-owner/liftory-api@sha256:' + 'a'.repeat(64),
    'ghcr.io/mykhailokurochkin/liftory-api@sha256:bad',
  ])
    assert.throws(() => validateBackendConfig({ ...config(), LIFTORY_API_IMAGE }, 'dev'));
  assert.throws(() => validateBackendConfig({ ...config(), LIFTORY_API_COMMIT: 'main' }, 'dev'));
});

test('database credentials must match the private environment database', () => {
  for (const LIFTORY_DATABASE_URL of [
    config().LIFTORY_DATABASE_URL.replace('@db:', '@public.example.invalid:'),
    config().LIFTORY_DATABASE_URL.replace('/liftory_dev', '/liftory_prod'),
    config().LIFTORY_DATABASE_URL + '?options=unexpected',
    'not-a-url',
  ])
    assert.throws(() => validateBackendConfig({ ...config(), LIFTORY_DATABASE_URL }, 'dev'));
});

test('public deployment requires exact HTTPS frontend origin and OAuth configuration', () => {
  for (const LIFTORY_PUBLIC_ORIGIN of [
    'http://liftory-dev.example.invalid',
    'https://liftory-dev.example.invalid/path',
    'https://liftory-dev.example.invalid/',
    'https://user:password@liftory-dev.example.invalid',
  ])
    assert.throws(() => validateBackendConfig({ ...config(), LIFTORY_PUBLIC_ORIGIN }, 'dev'));
  assert.throws(() => validateBackendConfig({ ...config(), GOOGLE_CLIENT_SECRET: '' }, 'dev'));
  assert.throws(() => validateBackendConfig({ ...config(), BETTER_AUTH_SECRET: 'short' }, 'dev'));
});

test('private dotenv configuration rejects public permissions and symlinks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liftory-backend-config-'));
  try {
    const file = join(directory, 'dev.env');
    writeFileSync(
      file,
      Object.entries(config())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
      {
        mode: 0o600,
      },
    );
    assert.equal(loadBackendConfig(file, 'dev').LIFTORY_ENV, 'dev');
    chmodSync(file, 0o644);
    assert.throws(() => loadBackendConfig(file, 'dev'));
    chmodSync(file, 0o600);
    const link = join(directory, 'link.env');
    symlinkSync(file, link);
    assert.throws(() => loadBackendConfig(link, 'dev'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('readiness verifies exact release and absence of a development identity', async () => {
  const values = config();
  const fake = (health, session) => async (url) => {
    assert.ok(url.startsWith('http://127.0.0.1:3481/api/'));
    return Response.json(url.endsWith('/health') ? health : session);
  };
  await verifyBackend(
    values,
    fake({ status: 'ok', version: values.LIFTORY_API_COMMIT }, { user: null, development: false }),
  );
  await assert.rejects(
    verifyBackend(
      values,
      fake({ status: 'ok', version: 'old' }, { user: null, development: false }),
    ),
  );
  await assert.rejects(
    verifyBackend(
      values,
      fake(
        { status: 'ok', version: values.LIFTORY_API_COMMIT },
        { user: { id: 'dev' }, development: true },
      ),
    ),
  );
});

test('shared backend lock releases after failure and rejects simultaneous operations', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'liftory-backend-lock-'));
  const file = join(directory, 'dev.env');
  try {
    await withBackendLock(file, async () => {
      await assert.rejects(withBackendLock(file, async () => {}));
    });
    await assert.rejects(
      withBackendLock(file, async () => {
        throw new Error('synthetic failure');
      }),
    );
    await withBackendLock(file, async () => {});
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('backend core validates native platform before side effects and verifies after Compose', async () => {
  const calls = [];
  const adapters = {
    freeBytes: async () => 20 * 1024 ** 3,
    platform: async () => 'linux/amd64',
    runDocker: async (args) => {
      calls.push(args);
    },
    verify: async () => {
      calls.push('verified');
    },
  };
  await applyBackend(config(), '/private/dev.env', adapters);
  assert.equal(calls.length, 4);
  assert.ok(calls[0].includes('--quiet'));
  assert.equal(calls[1].at(-1), 'pull');
  assert.ok(calls[2].includes('--wait'));
  assert.equal(calls[3], 'verified');
  calls.length = 0;
  await assert.rejects(
    applyBackend(config(), '/private/dev.env', {
      ...adapters,
      platform: async () => 'linux/arm64',
    }),
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    applyBackend(config(), '/private/dev.env', { ...adapters, freeBytes: async () => 1024 }),
  );
  assert.equal(calls.length, 0);
});

test('public registration must be explicit and keeps Google required', () => {
  const values = { ...config(), REGISTRATION_MODE: 'public', ALLOWED_EMAILS: '' };
  assert.equal(validateBackendConfig(values, 'dev').REGISTRATION_MODE, 'public');
  for (const patch of [
    { REGISTRATION_MODE: undefined },
    { REGISTRATION_MODE: 'allowlist' },
    { REGISTRATION_MODE: '' },
    { REGISTRATION_MODE: 'invalid' },
    { GOOGLE_CLIENT_SECRET: '' },
    { ALLOWED_EMAILS: 'invalid' },
  ])
    assert.throws(() => validateBackendConfig({ ...values, ...patch }, 'dev'));
  assert.throws(() => validateBackendConfig({ ...config(), ALLOWED_EMAILS: ' , ' }, 'dev'));
});
