import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function configuration(values) {
  const env = { ...process.env };
  delete env.VERCEL;
  delete env.API_INTERNAL_URL;
  const url = new URL('../next.config.ts', import.meta.url).href;
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {default:config}=await import(${JSON.stringify(url)}); console.log(JSON.stringify(await config.rewrites()));`,
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

test('Vercel proxies only relative API routes to the explicitly selected HTTPS API', () => {
  const result = configuration({
    VERCEL: '1',
    API_INTERNAL_URL: 'https://liftory-api.example.invalid/',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    { source: '/api/:path*', destination: 'https://liftory-api.example.invalid/api/:path*' },
  ]);
});

test('local development keeps its loopback fallback', () => {
  const result = configuration({});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout)[0].destination, 'http://127.0.0.1:3301/api/:path*');
});
