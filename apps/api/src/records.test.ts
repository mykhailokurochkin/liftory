import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { SyncMutation } from '@liftory/contracts';
import { createDatabase, type Database } from './database.js';
import { migrateDatabase } from './migrate.js';
import { RecordStore, parseMutation } from './records.js';
import { records, receipts, user } from './schema.js';

const mutation = (ownerId: string, patch: Partial<SyncMutation> = {}): SyncMutation => ({
  ownerId,
  mutationId: randomUUID(),
  baseVersion: 0,
  entity: {
    kind: 'exercise',
    data: {
      id: randomUUID(),
      name: 'Leg press',
      equipment: 'machine',
      muscleGroup: 'legs',
      notes: '',
      archived: false,
    },
  },
  ...patch,
});
it('rejects malformed data and owner mismatch before database operations', async () => {
  expect(() => parseMutation({})).toThrow('validation_failed');
  const store = new RecordStore({} as Database);
  await expect(store.synchronize('owner-a', mutation('owner-b'))).rejects.toMatchObject({
    status: 403,
    code: 'owner_mismatch',
  });
});

it('returns bounded field errors without echoing supplied values or unknown keys', () => {
  const input = mutation('owner-a');
  if (input.entity.kind !== 'exercise') throw new Error('Invalid fixture.');
  input.entity.data.name = '';
  const invalid = { ...input, secretInputField: 'do-not-echo-this-value' };
  let error: unknown;
  try {
    parseMutation(invalid);
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({
    code: 'validation_failed',
    fields: expect.arrayContaining([{ path: 'entity.data.name', message: expect.any(String) }]),
  });
  expect(JSON.stringify(error)).not.toContain('do-not-echo-this-value');
  expect(JSON.stringify(error)).not.toContain('secretInputField');
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'real PostgreSQL synchronization transactions',
  () => {
    let database: Database;
    let store: RecordStore;
    const ownerA = 'test-' + randomUUID(),
      ownerB = 'test-' + randomUUID();
    beforeAll(async () => {
      await migrateDatabase(process.env.TEST_DATABASE_URL!);
      await migrateDatabase(process.env.TEST_DATABASE_URL!);
      database = createDatabase(process.env.TEST_DATABASE_URL!);
      store = new RecordStore(database);
      await database.db.insert(user).values([
        { id: ownerA, name: 'A', email: ownerA + '@example.test', emailVerified: true },
        { id: ownerB, name: 'B', email: ownerB + '@example.test', emailVerified: true },
      ]);
    });
    afterAll(async () => {
      if (!database) return;
      await database.db.delete(user).where(eq(user.id, ownerA));
      await database.db.delete(user).where(eq(user.id, ownerB));
      await database.client.end();
    });
    it('replays a lost response without duplicating or overwriting newer data', async () => {
      const first = mutation(ownerA);
      const firstAck = await store.synchronize(ownerA, first);
      const second = {
        ...first,
        mutationId: randomUUID(),
        baseVersion: 1,
        entity: { ...first.entity, data: { ...first.entity.data, name: 'Updated press' } },
      } as SyncMutation;
      const secondAck = await store.synchronize(ownerA, second);
      expect(secondAck.record.version).toBe(2);
      expect(await store.synchronize(ownerA, first)).toEqual(firstAck);
      const listed = await store.list(ownerA);
      expect(listed.find((record) => record.entity.data.id === first.entity.data.id)).toEqual(
        secondAck.record,
      );
      const saved = await database.db
        .select()
        .from(receipts)
        .where(and(eq(receipts.ownerId, ownerA), eq(receipts.mutationId, first.mutationId)));
      expect(saved).toHaveLength(1);
    });
    it('rejects reusing a mutation ID for a different payload', async () => {
      const first = mutation(ownerA);
      await store.synchronize(ownerA, first);
      await expect(store.synchronize(ownerA, { ...first, baseVersion: 1 })).rejects.toMatchObject({
        status: 409,
        code: 'mutation_reused',
      });
    });
    it('serializes concurrent writers and returns the current record on conflict', async () => {
      const first = mutation(ownerA);
      await store.synchronize(ownerA, first);
      const next = { ...first, mutationId: randomUUID(), baseVersion: 1 };
      const outcomes = await Promise.allSettled([
        store.synchronize(ownerA, next),
        store.synchronize(ownerA, { ...next, mutationId: randomUUID() }),
      ]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const conflict = outcomes.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(conflict.reason).toMatchObject({
        status: 409,
        code: 'version_conflict',
        record: { version: 2 },
      });
    });
    it('isolates rows and receipts by authenticated owner even for the same UUIDs', async () => {
      const shared = mutation(ownerA);
      const a = await store.synchronize(ownerA, shared);
      expect(
        (await store.list(ownerB)).some(
          (record) => record.entity.data.id === shared.entity.data.id,
        ),
      ).toBe(false);
      await expect(
        store.synchronize(ownerB, { ...shared, ownerId: ownerB, baseVersion: 1 }),
      ).rejects.toMatchObject({ status: 409, record: null });
      const b = await store.synchronize(ownerB, { ...shared, ownerId: ownerB });
      expect(b.record.version).toBe(1);
      expect(a.mutationId).toBe(b.mutationId);
      expect(await store.synchronize(ownerA, shared)).toEqual(a);
    });
    it('refuses changing a record kind and protects the database version range', async () => {
      const first = mutation(ownerA);
      await store.synchronize(ownerA, first);
      await expect(
        store.synchronize(ownerA, {
          ownerId: ownerA,
          mutationId: randomUUID(),
          baseVersion: 1,
          entity: {
            kind: 'template',
            data: { id: first.entity.data.id, name: 'Wrong kind', exercises: [], archived: false },
          },
        }),
      ).rejects.toMatchObject({ code: 'record_kind_changed' });
      await database.db
        .update(records)
        .set({ version: 2147483647 })
        .where(and(eq(records.ownerId, ownerA), eq(records.id, first.entity.data.id)));
      await expect(
        store.synchronize(ownerA, { ...first, mutationId: randomUUID(), baseVersion: 2147483647 }),
      ).rejects.toMatchObject({ code: 'version_limit' });
    });
  },
);
