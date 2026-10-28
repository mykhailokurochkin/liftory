import { afterEach, describe, expect, test, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  canonicalJSON,
  type AuthUser,
  type RecordEntity,
  type ServerRecord,
  type SyncAck,
  type SyncMutation,
} from '@liftory/contracts';
import {
  createSyncEngine,
  openOfflineStore,
  OfflineStorageError,
  StaleRevisionError,
  type OfflineStore,
} from './index';

const ownerA: AuthUser = { id: 'owner-a', name: 'Owner A', email: 'a@example.com' };
const ownerB: AuthUser = { id: 'owner-b', name: 'Owner B', email: 'b@example.com' };
const instant = '2026-10-27T12:00:00.000Z';
const exercise = (name = 'Bench press', id: string = crypto.randomUUID()): RecordEntity => ({
  kind: 'exercise',
  data: { id, name, equipment: 'barbell', muscleGroup: 'Chest', notes: '', archived: false },
});
const workout = (title = 'Workout', id: string = crypto.randomUUID()): RecordEntity => ({
  kind: 'workout',
  data: {
    id,
    title,
    status: 'active',
    startedAt: instant,
    finishedAt: null,
    notes: '',
    exercises: [],
  },
});
const remote = (entity: RecordEntity, version = 1): ServerRecord => ({
  entity,
  version,
  updatedAt: instant,
});
const stores: OfflineStore[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  stores.splice(0).forEach((store) => store.close());
});
async function database(factory = new IDBFactory(), name: string = crypto.randomUUID()) {
  const store = await openOfflineStore({ indexedDB: factory, name });
  stores.push(store);
  return store;
}
function server(initialUser: AuthUser | null = ownerA) {
  let user = initialUser;
  let loseResponse = false;
  let swapBeforePost: AuthUser | null = null;
  const rows = new Map<string, Map<string, ServerRecord>>();
  const receipts = new Map<string, { body: string; ack: SyncAck }>();
  const sent: SyncMutation[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetch: typeof globalThis.fetch = async (url, options) => {
    if (url === '/api/session') return json({ user });
    if (url === '/api/records') {
      if (!user || new Headers(options?.headers).get('X-Liftory-Owner') !== user.id)
        return json({}, 403);
      return json({ records: [...(rows.get(user.id)?.values() ?? [])] });
    }
    if (url !== '/api/sync') throw Error('Unexpected URL');
    if (swapBeforePost) {
      user = swapBeforePost;
      swapBeforePost = null;
    }
    const mutation = JSON.parse(String(options?.body)) as SyncMutation;
    sent.push(mutation);
    if (!user) return json({}, 401);
    if (mutation.ownerId !== user.id) return json({}, 403);
    const receiptKey = user.id + '/' + mutation.mutationId;
    const previousReceipt = receipts.get(receiptKey);
    if (previousReceipt) {
      if (previousReceipt.body !== canonicalJSON(mutation))
        return json({ code: 'mutation_reuse' }, 409);
      return json(previousReceipt.ack);
    }
    const records = rows.get(user.id) ?? new Map<string, ServerRecord>();
    rows.set(user.id, records);
    const key = mutation.entity.kind + '/' + mutation.entity.data.id;
    const previous = records.get(key);
    if ((previous?.version ?? 0) !== mutation.baseVersion)
      return json({ code: 'version_conflict', record: previous }, 409);
    const record = remote(mutation.entity, mutation.baseVersion + 1);
    const ack = { mutationId: mutation.mutationId, record };
    records.set(key, record);
    receipts.set(receiptKey, { body: canonicalJSON(mutation), ack });
    if (loseResponse) {
      loseResponse = false;
      throw new TypeError('Connection closed after commit');
    }
    return json(ack);
  };
  return {
    fetch,
    rows,
    sent,
    receipts,
    loseNextResponse() {
      loseResponse = true;
    },
    setUser(next: AuthUser | null) {
      user = next;
    },
    swapCookieBeforeNextPost(next: AuthUser) {
      swapBeforePost = next;
    },
  };
}

describe('durable owner-scoped drafts', () => {
  test('reload retains identity, draft and the same immutable queued mutation', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const first = await database(factory, name);
    await first.rememberUser(ownerA);
    const entity = exercise();
    const saved = await first.save(ownerA.id, entity);
    first.close();
    const reopened = await database(factory, name);
    expect(await reopened.readRememberedUser()).toEqual(ownerA);
    expect(await reopened.get(ownerA.id, entity.kind, entity.data.id)).toEqual(saved);
    expect(saved.pending?.mutation.ownerId).toBe(ownerA.id);
    expect(saved.pending?.mutation.entity).toEqual(entity);
    await reopened.forgetUser();
    expect(await reopened.readRememberedUser()).toBeNull();
    expect(await reopened.list(ownerA.id)).toHaveLength(1);
  });

  test('same record ID is partitioned by owner and a stale view cannot overwrite a new edit', async () => {
    const db = await database();
    const entity = exercise();
    const original = await db.save(ownerA.id, entity);
    await db.save(ownerB.id, exercise('Other owner', entity.data.id));
    const changed = exercise('Newer name', entity.data.id);
    await db.save(ownerA.id, changed, original.localRevision);
    await expect(db.save(ownerA.id, entity, original.localRevision)).rejects.toBeInstanceOf(
      StaleRevisionError,
    );
    expect((await db.list(ownerA.id))[0].entity).toEqual(changed);
    expect((await db.list(ownerB.id))[0].entity).not.toEqual(changed);
  });

  test('quota failure never reports success or changes the draft/outbox', async () => {
    const db = await database();
    const entity = exercise();
    const before = await db.save(ownerA.id, entity);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('No space', 'QuotaExceededError');
    });
    await expect(
      db.save(ownerA.id, exercise('Changed', entity.data.id), before.localRevision),
    ).rejects.toBeInstanceOf(OfflineStorageError);
    expect(await db.get(ownerA.id, entity.kind, entity.data.id)).toEqual(before);
  });

  test('an asynchronous transaction abort rolls back both draft and pending snapshot', async () => {
    const db = await database();
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const result = originalPut.call(this, value, key);
      this.transaction.abort();
      return result;
    });
    await expect(db.save(ownerA.id, exercise())).rejects.toBeInstanceOf(OfflineStorageError);
    expect(await db.list(ownerA.id)).toEqual([]);
  });
});

describe('immutable snapshot synchronization', () => {
  test('lost ACK retries the exact command and does not duplicate the server version', async () => {
    const db = await database();
    const entity = workout();
    const draft = await db.save(ownerA.id, entity);
    const api = server();
    api.loseNextResponse();
    const engine = createSyncEngine({ store: db, ownerId: ownerA.id, fetch: api.fetch });
    expect((await engine.sync()).status).toBe('offline');
    expect((await db.get(ownerA.id, entity.kind, entity.data.id))?.pending).toEqual(draft.pending);
    expect((await engine.sync()).status).toBe('idle');
    expect(api.sent).toHaveLength(2);
    expect(api.sent[0]).toEqual(api.sent[1]);
    expect(api.receipts.size).toBe(1);
    expect((await db.get(ownerA.id, entity.kind, entity.data.id))?.serverVersion).toBe(1);
    expect((await db.list(ownerA.id))[0].pending).toBeNull();
  });

  test('edits made during a request survive ACK and are sent as a new snapshot', async () => {
    const db = await database();
    const entity = exercise();
    const initial = await db.save(ownerA.id, entity);
    const api = server();
    let edited = false;
    const fetch: typeof globalThis.fetch = async (url, options) => {
      if (url === '/api/sync' && !edited) {
        edited = true;
        await db.save(
          ownerA.id,
          exercise('Edited while sending', entity.data.id),
          initial.localRevision,
        );
      }
      return api.fetch(url, options);
    };
    const state = await createSyncEngine({ store: db, ownerId: ownerA.id, fetch }).sync();
    expect(state.status).toBe('idle');
    expect(api.sent).toHaveLength(2);
    expect(api.sent[0].entity).toEqual(entity);
    expect(api.sent[1].entity).toEqual(exercise('Edited while sending', entity.data.id));
    expect(api.sent[1].mutationId).not.toBe(api.sent[0].mutationId);
    expect(api.sent[1].baseVersion).toBe(1);
    expect((await db.list(ownerA.id))[0]).toMatchObject({
      serverVersion: 2,
      localRevision: 2,
      pending: null,
    });
    const stale = await db.acknowledge(ownerA.id, {
      mutationId: api.sent[0].mutationId,
      record: remote(entity),
    });
    expect(stale).toBeNull();
    expect((await db.list(ownerA.id))[0].entity).toEqual(api.sent[1].entity);
  });

  test('two tabs can replay one command safely and CAS prevents stale editing', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const tabA = await database(factory, name);
    const tabB = await database(factory, name);
    const saved = await tabA.save(ownerA.id, exercise());
    const api = server();
    await Promise.all([
      createSyncEngine({ store: tabA, ownerId: ownerA.id, fetch: api.fetch }).sync(),
      createSyncEngine({ store: tabB, ownerId: ownerA.id, fetch: api.fetch }).sync(),
    ]);
    expect(api.receipts.size).toBe(1);
    const current = (await tabA.list(ownerA.id))[0];
    expect(current.pending).toBeNull();
    expect(current.serverVersion).toBe(1);
    await tabA.save(ownerA.id, exercise('Tab A edited', saved.id), current.localRevision);
    await expect(
      tabB.save(ownerA.id, exercise('Stale Tab B', saved.id), current.localRevision),
    ).rejects.toBeInstanceOf(StaleRevisionError);
  });

  test('pull updates clean records but preserves dirty drafts and unresolved conflicts', async () => {
    const db = await database();
    const dirty = exercise('Local dirty');
    const clean = exercise('Remote original');
    await db.save(ownerA.id, dirty);
    await db.applyRemote(ownerA.id, [remote(clean)]);
    await db.applyRemote(ownerA.id, [
      remote(exercise('Must not replace draft', dirty.data.id), 8),
      remote(exercise('Remote updated', clean.data.id), 2),
    ]);
    expect((await db.get(ownerA.id, dirty.kind, dirty.data.id))?.entity).toEqual(dirty);
    expect((await db.get(ownerA.id, clean.kind, clean.data.id))?.entity).toEqual(
      exercise('Remote updated', clean.data.id),
    );
    const mutation = (await db.get(ownerA.id, dirty.kind, dirty.data.id))!.pending!.mutation;
    await db.markConflict(
      ownerA.id,
      mutation.mutationId,
      remote(exercise('Conflict', dirty.data.id), 9),
    );
    await db.applyRemote(ownerA.id, [
      remote(exercise('Still must not replace', dirty.data.id), 10),
    ]);
    expect((await db.get(ownerA.id, dirty.kind, dirty.data.id))?.entity).toEqual(dirty);
    expect((await db.get(ownerA.id, dirty.kind, dirty.data.id))?.conflict?.version).toBe(9);
  });

  test('401 retains the outbox and matching reauthentication resumes it', async () => {
    const db = await database();
    await db.save(ownerA.id, exercise());
    const api = server();
    let expire = true;
    const fetch: typeof globalThis.fetch = async (url, options) => {
      if (url === '/api/sync' && expire) return new Response('{}', { status: 401 });
      return api.fetch(url, options);
    };
    const engine = createSyncEngine({ store: db, ownerId: ownerA.id, fetch });
    expect((await engine.sync()).status).toBe('auth_required');
    expect((await db.list(ownerA.id))[0].pending).not.toBeNull();
    expire = false;
    expect((await engine.sync()).status).toBe('idle');
    expect(api.receipts.size).toBe(1);
  });

  test('different current account blocks POST before transmission', async () => {
    const db = await database();
    const original = await db.save(ownerA.id, exercise());
    const api = server(ownerB);
    expect(
      (await createSyncEngine({ store: db, ownerId: ownerA.id, fetch: api.fetch }).sync()).status,
    ).toBe('auth_required');
    expect(api.sent).toEqual([]);
    expect(await db.get(ownerA.id, original.kind, original.id)).toEqual(original);
    expect(await db.list(ownerB.id)).toEqual([]);
  });

  test('account changed after preflight is bound by mutation owner and cannot receive the old draft', async () => {
    const db = await database();
    await db.save(ownerA.id, exercise());
    const api = server();
    api.swapCookieBeforeNextPost(ownerB);
    expect(
      (await createSyncEngine({ store: db, ownerId: ownerA.id, fetch: api.fetch }).sync()).status,
    ).toBe('auth_required');
    expect(api.rows.get(ownerB.id)).toBeUndefined();
    expect((await db.list(ownerA.id))[0].pending).not.toBeNull();
  });

  test('account changed before pull cannot import another owner records', async () => {
    const db = await database();
    const api = server();
    api.rows.set(ownerB.id, new Map([['exercise/b', remote(exercise('Private B'))]]));
    const fetch: typeof globalThis.fetch = async (url, options) => {
      if (url === '/api/records') api.setUser(ownerB);
      return api.fetch(url, options);
    };
    expect((await createSyncEngine({ store: db, ownerId: ownerA.id, fetch }).sync()).status).toBe(
      'auth_required',
    );
    expect(await db.list(ownerA.id)).toEqual([]);
  });

  test('a 409 preserves the local candidate; server selection resolves it explicitly', async () => {
    const db = await database();
    const entity = workout('Local title');
    const api = server();
    const remoteEntity = workout('Server title', entity.data.id);
    api.rows.set(ownerA.id, new Map([['workout/' + entity.data.id, remote(remoteEntity, 3)]]));
    await db.save(ownerA.id, entity);
    const state = await createSyncEngine({
      store: db,
      ownerId: ownerA.id,
      fetch: api.fetch,
    }).sync();
    expect(state.status).toBe('conflict');
    expect((await db.list(ownerA.id))[0]).toMatchObject({
      entity,
      conflict: remote(remoteEntity, 3),
    });
    await db.resolveConflict(ownerA.id, entity.kind, entity.data.id, 'server');
    expect((await db.list(ownerA.id))[0]).toMatchObject({
      entity: remoteEntity,
      serverVersion: 3,
      pending: null,
      conflict: null,
    });
  });

  test('copy resolution keeps the server original and queues the local candidate under a new ID', async () => {
    const db = await database();
    const entity = workout('Local title');
    const local = await db.save(ownerA.id, entity);
    const serverEntity = workout('Server title', entity.data.id);
    await db.markConflict(ownerA.id, local.pending!.mutation.mutationId, remote(serverEntity, 5));
    const copy = await db.resolveConflict(ownerA.id, entity.kind, entity.data.id, 'copy');
    expect(copy.id).not.toBe(entity.data.id);
    expect(copy.entity.kind === 'workout' && copy.entity.data.title).toBe('Local title (copy)');
    expect(copy.pending?.mutation.baseVersion).toBe(0);
    expect(copy.pending?.mutation.ownerId).toBe(ownerA.id);
    expect((await db.get(ownerA.id, entity.kind, entity.data.id))?.entity).toEqual(serverEntity);
    expect(await db.list(ownerA.id)).toHaveLength(2);
  });

  test('malformed ACK leaves the exact pending command available for retry', async () => {
    const db = await database();
    const saved = await db.save(ownerA.id, exercise());
    const api = server();
    const fetch: typeof globalThis.fetch = async (url, options) => {
      if (url === '/api/sync')
        return new Response(
          JSON.stringify({
            mutationId: saved.pending!.mutation.mutationId,
            record: remote(exercise('Wrong ID')),
          }),
        );
      return api.fetch(url, options);
    };
    expect((await createSyncEngine({ store: db, ownerId: ownerA.id, fetch }).sync()).status).toBe(
      'error',
    );
    expect((await db.list(ownerA.id))[0].pending).toEqual(saved.pending);
  });
});

describe('foreground lifecycle', () => {
  test('a fresh sync after stop waits for the old request and then resumes the same queue', async () => {
    const db = await database();
    await db.save(ownerA.id, exercise());
    const api = server();
    let release: (() => void) | undefined;
    let held = true;
    const fetch: typeof globalThis.fetch = async (url, options) => {
      if (url === '/api/sync' && held) {
        held = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return api.fetch(url, options);
    };
    const engine = createSyncEngine({ store: db, ownerId: ownerA.id, fetch });
    const old = engine.sync();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    engine.stop();
    const fresh = engine.sync();
    release!();
    await old;
    expect((await fresh).status).toBe('idle');
    expect((await db.list(ownerA.id))[0].pending).toBeNull();
    expect(api.receipts.size).toBe(1);
  });

  test('stopping during a response leaves a retryable receipt instead of applying a late ACK', async () => {
    const db = await database();
    const saved = await db.save(ownerA.id, exercise());
    const api = server();
    let release: (() => void) | undefined;
    let held = true;
    const fetch: typeof globalThis.fetch = async (url, options) => {
      if (url === '/api/sync' && held) {
        held = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return api.fetch(url, options);
    };
    const engine = createSyncEngine({ store: db, ownerId: ownerA.id, fetch });
    const running = engine.sync();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    engine.stop();
    release!();
    await running;
    expect((await db.list(ownerA.id))[0].pending).toEqual(saved.pending);
    expect((await engine.sync()).status).toBe('idle');
    expect(api.sent[0]).toEqual(api.sent[1]);
    expect(api.receipts.size).toBe(1);
  });

  test('online events retry foreground edits and cleanup removes event handlers', async () => {
    const db = await database();
    const api = server();
    const fakeWindow = new EventTarget();
    const fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    const engine = createSyncEngine({ store: db, ownerId: ownerA.id, fetch: api.fetch });
    try {
      const initial = await db.save(ownerA.id, exercise());
      const cleanup = engine.start();
      await vi.waitFor(() =>
        expect(engine.getState()).toMatchObject({ status: 'idle', pending: 0 }),
      );
      await db.save(ownerA.id, exercise('Online retry', initial.id), initial.localRevision);
      fakeWindow.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(api.sent).toHaveLength(2));
      await vi.waitFor(() =>
        expect(engine.getState()).toMatchObject({ status: 'idle', pending: 0 }),
      );
      cleanup();
      await db.save(ownerA.id, exercise('After cleanup', initial.id), initial.localRevision + 1);
      fakeWindow.dispatchEvent(new Event('online'));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(api.sent).toHaveLength(2);
    } finally {
      engine.stop();
      vi.unstubAllGlobals();
    }
  });
});
