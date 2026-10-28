import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { migrateDatabase } from './migrate.js';
import { localUser } from './auth.js';
import { receipts, records } from './schema.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('real HTTP API boundaries', () => {
  let runtime: Awaited<ReturnType<typeof createApp>>;
  let origin: string;
  const ids = {
    record: randomUUID(),
    mutation: randomUUID(),
    largeRecord: randomUUID(),
    largeMutation: randomUUID(),
  };
  const applicationOrigin = 'http://localhost:3300';
  beforeAll(async () => {
    await migrateDatabase(process.env.TEST_DATABASE_URL!);
    const config = readConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      APP_ORIGIN: applicationOrigin,
      LIFTORY_DEV_AUTH: 'true',
      BETTER_AUTH_SECRET: 'test-only-secret-that-is-long-enough',
      APP_VERSION: 'test-api',
    });
    runtime = await createApp(config);
    await runtime.app.listen(0, '127.0.0.1');
    origin = 'http://127.0.0.1:' + (runtime.app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    if (!runtime) return;
    await runtime.database.db
      .delete(records)
      .where(
        and(eq(records.ownerId, localUser.id), inArray(records.id, [ids.record, ids.largeRecord])),
      );
    await runtime.database.db
      .delete(receipts)
      .where(
        and(
          eq(receipts.ownerId, localUser.id),
          inArray(receipts.mutationId, [ids.mutation, ids.largeMutation]),
        ),
      );
    await runtime.close();
  });
  it('reports database readiness, version and explicit local identity', async () => {
    const response = await fetch(origin + '/api/health');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', version: 'test-api' });
    expect(await (await fetch(origin + '/api/session')).json()).toMatchObject({
      development: true,
      user: { id: localUser.id },
    });
  });
  it('requires origin, owner binding and valid payload', async () => {
    const mutation = {
      ownerId: localUser.id,
      mutationId: ids.mutation,
      baseVersion: 0,
      entity: {
        kind: 'exercise',
        data: {
          id: ids.record,
          name: 'HTTP exercise',
          equipment: 'bodyweight',
          muscleGroup: '',
          notes: '',
          archived: false,
        },
      },
    };
    const post = (body: unknown, requestOrigin = applicationOrigin) =>
      fetch(origin + '/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
        body: JSON.stringify(body),
      });
    expect((await post(mutation, 'https://untrusted.example')).status).toBe(403);
    expect((await post({ ...mutation, ownerId: 'other-account' })).status).toBe(403);
    const invalid = await post({
      ...mutation,
      entity: { ...mutation.entity, data: { ...mutation.entity.data, name: '' } },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: 'validation_failed',
      fields: expect.arrayContaining([{ path: 'entity.data.name', message: expect.any(String) }]),
    });
    const response = await post(mutation);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      mutationId: ids.mutation,
      record: { version: 1 },
    });
    expect((await fetch(origin + '/api/records')).status).toBe(403);
    expect(
      (await fetch(origin + '/api/records', { headers: { 'X-Liftory-Owner': 'other-account' } }))
        .status,
    ).toBe(403);
    const list = await fetch(origin + '/api/records', {
      headers: { 'X-Liftory-Owner': localUser.id },
    });
    expect(list.status).toBe(200);
    expect(
      (await list.json()).records.some(
        (record: { entity: { data: { id: string } } }) => record.entity.data.id === ids.record,
      ),
    ).toBe(true);
  });
  it('accepts the largest supported workout snapshot above the previous 256 KiB cap', async () => {
    const mutation = {
      ownerId: localUser.id,
      mutationId: ids.largeMutation,
      baseVersion: 0,
      entity: {
        kind: 'workout',
        data: {
          id: ids.largeRecord,
          title: 'Large workout',
          status: 'active',
          startedAt: new Date().toISOString(),
          finishedAt: null,
          notes: 'n'.repeat(2000),
          exercises: Array.from({ length: 50 }, () => ({
            id: randomUUID(),
            exerciseId: randomUUID(),
            name: 'Exercise '.repeat(11),
            equipment: 'machine',
            sets: Array.from({ length: 50 }, () => ({
              id: randomUUID(),
              weightKg: 1999.123456789,
              reps: 1000,
              completed: false,
            })),
          })),
        },
      },
    };
    const body = JSON.stringify(mutation);
    expect(Buffer.byteLength(body)).toBeGreaterThan(256 * 1024);
    expect(Buffer.byteLength(body)).toBeLessThan(1024 * 1024);
    const response = await fetch(origin + '/api/sync', {
      method: 'POST',
      headers: { Origin: applicationOrigin, 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      mutationId: ids.largeMutation,
      record: { version: 1 },
    });
  });
  it('rejects JSON above the bounded 1 MiB cap', async () => {
    const response = await fetch(origin + '/api/sync', {
      method: 'POST',
      headers: { Origin: applicationOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: 'payload_too_large' });
  });
  it('rejects malformed JSON without exposing an exception or environment', async () => {
    const response = await fetch(origin + '/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: applicationOrigin },
      body: '{invalid',
    });
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).not.toContain('stack');
    expect(body).not.toContain('postgres:');
  });
});
