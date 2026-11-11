import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function configuration(values) {
  const env = { ...process.env };
  const url = new URL('../next.config.ts', import.meta.url).href;
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {default:config}=await import(${JSON.stringify(url)}); console.log(JSON.stringify(await config.headers()));`,
    ],
    { env: { ...env, ...values }, encoding: 'utf8' },
  );
}

test('Next.js config defines security and cache headers', () => {
  const result = configuration({});
  assert.equal(result.status, 0, result.stderr);
  const headers = JSON.parse(result.stdout);
  assert.ok(Array.isArray(headers));
  assert.ok(headers.some((h) => h.source === '/api/:path*'));
});
