import {
  authUserSchema,
  canonicalJSON,
  recordDataSchema,
  serverRecordSchema,
  syncAckSchema,
  type AuthUser,
  type RecordEntity,
  type RecordKind,
  type ServerRecord,
  type SyncAck,
  type SyncMutation,
} from '@liftory/contracts';

export interface PendingSnapshot {
  mutation: SyncMutation;
  includedRevision: number;
}

export interface LocalRecord {
  ownerId: string;
  kind: RecordKind;
  id: string;
  entity: RecordEntity;
  localRevision: number;
  serverVersion: number;
  pending: PendingSnapshot | null;
  conflict: ServerRecord | null;
  updatedAt: string;
}

export class OfflineStorageError extends Error {
  constructor(options?: ErrorOptions) {
    super('Local data could not be committed. Keep this screen open and retry.', options);
    this.name = 'OfflineStorageError';
  }
}

export class StaleRevisionError extends Error {
  constructor() {
    super('This record changed in another view. Reload it before editing.');
    this.name = 'StaleRevisionError';
  }
}

export class SyncProtocolError extends Error {
  constructor() {
    super('The server returned an unexpected synchronization response.');
    this.name = 'SyncProtocolError';
  }
}

export interface OfflineStore {
  rememberUser(user: AuthUser): Promise<void>;
  readRememberedUser(): Promise<AuthUser | null>;
  forgetUser(): Promise<void>;
  list(ownerId: string, kind?: RecordKind): Promise<LocalRecord[]>;
  get(ownerId: string, kind: RecordKind, id: string): Promise<LocalRecord | null>;
  save(ownerId: string, entity: RecordEntity, expectedRevision?: number): Promise<LocalRecord>;
  acknowledge(ownerId: string, ack: SyncAck): Promise<LocalRecord | null>;
  markConflict(ownerId: string, mutationId: string, record: ServerRecord): Promise<void>;
  applyRemote(ownerId: string, records: ServerRecord[]): Promise<void>;
  resolveConflict(
    ownerId: string,
    kind: RecordKind,
    id: string,
    strategy: 'server' | 'copy',
  ): Promise<LocalRecord>;
  close(): void;
}

const owner = (value: string) => {
  if (typeof value !== 'string' || !value.length || value.length > 200)
    throw new TypeError('A verified account ID is required.');
  return value;
};
const sameEntity = (a: RecordEntity, b: RecordEntity) => canonicalJSON(a) === canonicalJSON(b);
const sameKey = (a: RecordEntity, b: RecordEntity) => a.kind === b.kind && a.data.id === b.data.id;
const stamp = () => new Date().toISOString();
function pending(record: LocalRecord): PendingSnapshot {
  return {
    mutation: {
      ownerId: record.ownerId,
      mutationId: crypto.randomUUID(),
      baseVersion: record.serverVersion,
      entity: record.entity,
    },
    includedRevision: record.localRevision,
  };
}
function imported(ownerId: string, record: ServerRecord, revision = 1): LocalRecord {
  return {
    ownerId,
    kind: record.entity.kind,
    id: record.entity.data.id,
    entity: record.entity,
    localRevision: revision,
    serverVersion: record.version,
    pending: null,
    conflict: null,
    updatedAt: record.updatedAt,
  };
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new OfflineStorageError());
  });
}

export async function openOfflineStore({
  // Keep existing drafts and outbox entries across the Liftory rename.
  name = 'gym-offline-v1',
  indexedDB = globalThis.indexedDB,
}: { name?: string; indexedDB?: IDBFactory } = {}): Promise<OfflineStore> {
  if (!indexedDB) throw new OfflineStorageError();
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    let rejected = false;
    const fail = (cause: unknown) => {
      rejected = true;
      reject(new OfflineStorageError({ cause }));
    };
    opening.onerror = () => fail(opening.error);
    opening.onblocked = () => fail(new Error('A previous app version still holds the database.'));
    opening.onupgradeneeded = () => {
      const records = opening.result.createObjectStore('records', {
        keyPath: ['ownerId', 'kind', 'id'],
      });
      records.createIndex('owner', 'ownerId');
      opening.result.createObjectStore('metadata', { keyPath: 'key' });
    };
    opening.onsuccess = () => {
      if (rejected) opening.result.close();
      else resolve(opening.result);
    };
  }).catch((cause: unknown) => {
    throw cause instanceof OfflineStorageError ? cause : new OfflineStorageError({ cause });
  });
  database.onversionchange = () => database.close();

  async function transaction<T>(
    storeName: 'records' | 'metadata',
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    let tx: IDBTransaction;
    try {
      tx = database.transaction(storeName, mode);
    } catch (cause) {
      throw new OfflineStorageError({ cause });
    }
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new OfflineStorageError({ cause: tx.error }));
      tx.onerror = () => {};
    });
    // Register the abort handler before awaiting any request, including failures.
    const settled = committed.then(
      () => null,
      (error: unknown) => error,
    );
    try {
      const result = await operation(tx.objectStore(storeName));
      const failure = await settled;
      if (failure) throw failure;
      return result;
    } catch (cause) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await settled;
      if (
        cause instanceof StaleRevisionError ||
        cause instanceof SyncProtocolError ||
        cause instanceof TypeError
      )
        throw cause;
      throw cause instanceof OfflineStorageError ? cause : new OfflineStorageError({ cause });
    }
  }

  const all = (store: IDBObjectStore, ownerId: string) =>
    request(store.index('owner').getAll(owner(ownerId))) as Promise<LocalRecord[]>;
  const key = (ownerId: string, kind: RecordKind, id: string) => [owner(ownerId), kind, id];
  const api: OfflineStore = {
    rememberUser(user) {
      const verified = authUserSchema.parse(user);
      return transaction('metadata', 'readwrite', async (store) => {
        await request(store.put({ key: 'identity', user: verified }));
      });
    },
    readRememberedUser() {
      return transaction('metadata', 'readonly', async (store) => {
        const row = await request(store.get('identity'));
        return row ? authUserSchema.parse(row.user) : null;
      });
    },
    forgetUser() {
      return transaction('metadata', 'readwrite', async (store) => {
        await request(store.delete('identity'));
      });
    },
    list(ownerId, kind) {
      return transaction('records', 'readonly', async (store) =>
        (await all(store, ownerId)).filter((record) => kind === undefined || record.kind === kind),
      );
    },
    get(ownerId, kind, id) {
      return transaction(
        'records',
        'readonly',
        async (store) => (await request(store.get(key(ownerId, kind, id)))) ?? null,
      );
    },
    save(ownerId, entity, expectedRevision) {
      const normalized = recordDataSchema.parse(entity);
      owner(ownerId);
      return transaction('records', 'readwrite', async (store) => {
        const previous = (await request(
          store.get(key(ownerId, normalized.kind, normalized.data.id)),
        )) as LocalRecord | undefined;
        if (expectedRevision !== undefined && expectedRevision !== (previous?.localRevision ?? 0))
          throw new StaleRevisionError();
        if (previous && sameEntity(previous.entity, normalized)) return previous;
        const next: LocalRecord = {
          ownerId,
          kind: normalized.kind,
          id: normalized.data.id,
          entity: normalized,
          localRevision: (previous?.localRevision ?? 0) + 1,
          serverVersion: previous?.serverVersion ?? 0,
          pending: previous?.pending ?? null,
          conflict: previous?.conflict ?? null,
          updatedAt: stamp(),
        };
        if (!next.pending && !next.conflict) next.pending = pending(next);
        await request(store.put(next));
        return next;
      });
    },
    acknowledge(ownerId, input) {
      const ack = syncAckSchema.parse(input);
      return transaction('records', 'readwrite', async (store) => {
        const current = (await all(store, ownerId)).find(
          (record) => record.pending?.mutation.mutationId === ack.mutationId,
        );
        if (!current) return null;
        const snapshot = current.pending!;
        if (
          !sameKey(snapshot.mutation.entity, ack.record.entity) ||
          !sameEntity(snapshot.mutation.entity, ack.record.entity) ||
          ack.record.version !== snapshot.mutation.baseVersion + 1
        )
          throw new SyncProtocolError();
        const next: LocalRecord = {
          ...current,
          serverVersion: ack.record.version,
          pending: null,
          conflict: null,
        };
        if (current.localRevision > snapshot.includedRevision) next.pending = pending(next);
        else next.updatedAt = ack.record.updatedAt;
        await request(store.put(next));
        return next;
      });
    },
    markConflict(ownerId, mutationId, input) {
      const remote = serverRecordSchema.parse(input);
      return transaction('records', 'readwrite', async (store) => {
        const current = (await all(store, ownerId)).find(
          (record) => record.pending?.mutation.mutationId === mutationId,
        );
        if (!current) return;
        if (!sameKey(current.entity, remote.entity)) throw new SyncProtocolError();
        await request(store.put({ ...current, conflict: remote }));
      });
    },
    applyRemote(ownerId, inputs) {
      const records = inputs.map((record) => serverRecordSchema.parse(record));
      owner(ownerId);
      return transaction('records', 'readwrite', async (store) => {
        for (const remote of records) {
          const current = (await request(
            store.get(key(ownerId, remote.entity.kind, remote.entity.data.id)),
          )) as LocalRecord | undefined;
          if (current?.pending || current?.conflict) continue;
          if (current && remote.version < current.serverVersion) continue;
          if (current && remote.version === current.serverVersion) {
            if (!sameEntity(current.entity, remote.entity)) throw new SyncProtocolError();
            continue;
          }
          await request(store.put(imported(ownerId, remote, (current?.localRevision ?? 0) + 1)));
        }
      });
    },
    resolveConflict(ownerId, kind, id, strategy) {
      if (strategy !== 'server' && strategy !== 'copy')
        throw new TypeError('Unknown conflict strategy.');
      return transaction('records', 'readwrite', async (store) => {
        const current = (await request(store.get(key(ownerId, kind, id)))) as
          LocalRecord | undefined;
        if (!current?.conflict) throw new TypeError('There is no conflict to resolve.');
        const server = imported(ownerId, current.conflict, current.localRevision + 1);
        await request(store.put(server));
        if (strategy === 'server') return server;
        const entity = structuredClone(current.entity);
        entity.data.id = crypto.randomUUID();
        if (entity.kind === 'workout')
          entity.data.title = entity.data.title.slice(0, 93) + ' (copy)';
        else entity.data.name = entity.data.name.slice(0, 93) + ' (copy)';
        const copy: LocalRecord = {
          ownerId,
          kind: entity.kind,
          id: entity.data.id,
          entity,
          localRevision: 1,
          serverVersion: 0,
          pending: null,
          conflict: null,
          updatedAt: stamp(),
        };
        copy.pending = pending(copy);
        await request(store.put(copy));
        return copy;
      });
    },
    close() {
      database.close();
    },
  };
  return api;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'auth_required' | 'conflict' | 'error';
  pending: number;
  conflicts: number;
  lastSyncedAt: string | null;
  error?: 'storage' | 'protocol' | 'server';
}
export interface SyncEngine {
  sync(): Promise<SyncState>;
  start(): () => void;
  stop(): void;
  getState(): SyncState;
}

class SyncCancelled extends Error {}

class SyncResponseError extends Error {
  constructor(public readonly status: number) {
    super('Synchronization request failed.');
  }
}

export function createSyncEngine({
  store,
  ownerId,
  fetch: transport = globalThis.fetch.bind(globalThis),
  onState = () => {},
}: {
  store: OfflineStore;
  ownerId: string;
  fetch?: typeof globalThis.fetch;
  onState?: (state: SyncState) => void;
}): SyncEngine {
  owner(ownerId);
  let state: SyncState = { status: 'idle', pending: 0, conflicts: 0, lastSyncedAt: null };
  let running: Promise<SyncState> | null = null;
  let runningEpoch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let generation = 0;
  let failures = 0;
  let activeController: AbortController | null = null;
  const emit = async (
    status: SyncState['status'],
    error?: SyncState['error'],
    epoch = generation,
  ) => {
    const records = await store.list(ownerId);
    if (epoch !== generation) return state;
    state = {
      status,
      pending: records.filter((record) => record.pending).length,
      conflicts: records.filter((record) => record.conflict).length,
      lastSyncedAt: status === 'idle' || status === 'conflict' ? stamp() : state.lastSyncedAt,
      ...(error ? { error } : {}),
    };
    try {
      onState({ ...state });
    } catch {
      /* View callbacks do not own persistence. */
    }
    return state;
  };
  const read = async (path: string, method = 'GET', body?: SyncMutation) => {
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await transport(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'X-Liftory-Owner': ownerId,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403)
        throw new SyncResponseError(response.status);
      if (!response.ok && response.status !== 409) throw new SyncResponseError(response.status);
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new SyncProtocolError();
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
  };
  const perform = async (epoch: number) => {
    const active = () => {
      if (epoch !== generation) throw new SyncCancelled();
    };
    const report = (status: SyncState['status'], error?: SyncState['error']) =>
      emit(status, error, epoch);
    try {
      await report('syncing');
      active();
      const identity = await read('/api/session');
      active();
      const result = identity.data as { user?: unknown } | null;
      const user = authUserSchema.safeParse(result?.user);
      if (!user.success || user.data.id !== ownerId) return await report('auth_required');
      for (let count = 0; count < 100; count++) {
        const records = await store.list(ownerId);
        const priority: Record<RecordKind, number> = { exercise: 0, template: 1, workout: 2 };
        const next = records
          .filter((record) => record.pending && !record.conflict)
          .sort(
            (a, b) => priority[a.kind] - priority[b.kind] || a.updatedAt.localeCompare(b.updatedAt),
          )[0];
        if (!next?.pending) break;
        active();
        const snapshot = next.pending;
        const response = await read('/api/sync', 'POST', snapshot.mutation);
        active();
        if (response.status === 409) {
          const conflict = response.data as { code?: string; record?: unknown } | null;
          if (conflict?.code !== 'version_conflict') throw new SyncProtocolError();
          const remote = serverRecordSchema.safeParse(conflict.record);
          if (!remote.success) throw new SyncProtocolError();
          await store.markConflict(ownerId, snapshot.mutation.mutationId, remote.data);
        } else {
          const ack = syncAckSchema.safeParse(response.data);
          if (!ack.success || ack.data.mutationId !== snapshot.mutation.mutationId)
            throw new SyncProtocolError();
          await store.acknowledge(ownerId, ack.data);
        }
      }
      active();
      const response = await read('/api/records');
      active();
      const payload = response.data as { records?: unknown } | null;
      if (!Array.isArray(payload?.records)) throw new SyncProtocolError();
      const records = payload.records.map((record: unknown) =>
        serverRecordSchema.safeParse(record),
      );
      if (records.some((record) => !record.success)) throw new SyncProtocolError();
      await store.applyRemote(
        ownerId,
        records.map((record) => record.data!),
      );
      failures = 0;
      const local = await store.list(ownerId);
      return await report(local.some((record) => record.conflict) ? 'conflict' : 'idle');
    } catch (error) {
      if (error instanceof SyncCancelled || epoch !== generation) return state;
      failures++;
      if (error instanceof SyncResponseError && (error.status === 401 || error.status === 403))
        return await report('auth_required');
      if (error instanceof SyncProtocolError) return await report('error', 'protocol');
      if (error instanceof OfflineStorageError) {
        state = { ...state, status: 'error', error: 'storage' };
        try {
          onState({ ...state });
        } catch {
          /* View callbacks do not own persistence. */
        }
        return state;
      }
      if (error instanceof SyncResponseError && error.status < 500 && error.status !== 429)
        return await report('error', 'server');
      return await report('offline');
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!started || state.status === 'auth_required') return;
    timer = setTimeout(
      () => {
        void tick();
      },
      failures ? Math.min(60000, 1000 * 2 ** Math.min(failures, 6)) : 30000,
    );
  };
  const sync = (): Promise<SyncState> => {
    if (running) return runningEpoch === generation ? running : running.then(() => sync());
    const currentGeneration = generation;
    runningEpoch = currentGeneration;
    running = perform(currentGeneration).finally(() => {
      running = null;
      if (generation === currentGeneration) schedule();
    });
    return running;
  };
  const tick = () => sync();
  const wake = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void tick();
  };
  const stop = () => {
    started = false;
    generation++;
    clearTimeout(timer);
    activeController?.abort();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    }
  };
  return {
    sync,
    start() {
      if (started) return stop;
      started = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('online', wake);
        window.addEventListener('focus', wake);
        document.addEventListener('visibilitychange', wake);
      }
      void tick();
      return stop;
    },
    stop,
    getState: () => ({ ...state }),
  };
}
