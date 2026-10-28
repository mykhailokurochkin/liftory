import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('browser harness refuses a normal database when no test database is configured', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liftory-e2e-config-'));
  try {
    const env = { ...process.env, DATABASE_URL: 'postgres://ordinary-db.example.invalid/liftory' };
    delete env.TEST_DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./e2e-server.mjs', import.meta.url))],
      { cwd: directory, env, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Browser tests require TEST_DATABASE_URL/);
    assert.doesNotMatch(result.stdout, /migrat/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
