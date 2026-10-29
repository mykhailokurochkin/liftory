import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { readApiProxyConfig } from './api-proxy.mjs';

function configuration(values) {
  const env = { ...process.env };
  delete env.VERCEL;
  delete env.API_INTERNAL_URL;
  delete env.API_DNS_FALLBACK_IPS;
  const url = new URL('../next.config.ts', import.meta.url).href;
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {default:config}=await import(${JSON.stringify(url)}); console.log(JSON.stringify(config.rewrites ? await config.rewrites() : null));`,
    ],
    { env: { ...env, ...values }, encoding: 'utf8' },
  );
}

test('Vercel refuses a missing, insecure or non-origin upstream', () => {
  for (const value of [
    undefined,
    'http://api.example.invalid',
    'https://api.example.invalid/api',
    'https://user:password@api.example.invalid',
    'https://api.example.invalid?token=test',
  ]) {
    const result = configuration({
      VERCEL: '1',
      ...(value === undefined ? {} : { API_INTERNAL_URL: value }),
    });
    assert.notEqual(result.status, 0);
  }
});

test('Vercel leaves API requests to its Node route instead of a DNS-dependent external rewrite', () => {
  const result = configuration({
    VERCEL: '1',
    API_INTERNAL_URL: 'https://liftory-api.example.invalid/',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout), null);
});

test('local development keeps its loopback fallback', () => {
  const result = configuration({});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readApiProxyConfig({}).origin.origin, 'http://127.0.0.1:3301');
});
