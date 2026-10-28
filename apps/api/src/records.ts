import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  canonicalJSON,
  serverRecordSchema,
  syncMutationSchema,
  type SyncAck,
  type ServerRecord,
} from '@liftory/contracts';
import type { Database } from './database.js';
import { receipts, records } from './schema.js';

export interface ValidationField {
  path: string;
  message: string;
}

export class RecordError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly record?: ServerRecord | null,
    readonly fields?: ValidationField[],
  ) {
    super(code);
  }
}
export function parseMutation(value: unknown) {
  const parsed = syncMutationSchema.safeParse(value);
  if (!parsed.success) {
    const fields = parsed.error.issues.slice(0, 50).map((issue) => ({
      path:
        issue.path
          .map((part) => String(part).slice(0, 60))
          .join('.')
          .slice(0, 200) || '$',
      message:
        issue.code === 'unrecognized_keys'
          ? 'Unknown fields are not allowed.'
          : issue.message.slice(0, 300),
    }));
    throw new RecordError(400, 'validation_failed', undefined, fields);
  }
  return parsed.data;
}
function serialize(row: typeof records.$inferSelect): ServerRecord {
  return serverRecordSchema.parse({
    entity: row.entity,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}
export class RecordStore {
  constructor(private readonly database: Database) {}
  async list(ownerId: string): Promise<ServerRecord[]> {
    const rows = await this.database.db
      .select()
      .from(records)
      .where(eq(records.ownerId, ownerId))
      .orderBy(records.updatedAt)
      .limit(10001);
    if (rows.length > 10000) throw new RecordError(413, 'record_limit');
    return rows.map(serialize);
  }
  async synchronize(ownerId: string, input: unknown): Promise<SyncAck> {
    const mutation = parseMutation(input);
    if (mutation.ownerId !== ownerId) throw new RecordError(403, 'owner_mismatch');
    const fingerprint = createHash('sha256').update(canonicalJSON(mutation)).digest('hex');
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`);
      const [receipt] = await tx
        .select()
        .from(receipts)
        .where(and(eq(receipts.ownerId, ownerId), eq(receipts.mutationId, mutation.mutationId)));
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new RecordError(409, 'mutation_reused');
        return receipt.response;
      }
      const [current] = await tx
        .select()
        .from(records)
        .where(and(eq(records.ownerId, ownerId), eq(records.id, mutation.entity.data.id)));
      if (current && current.kind !== mutation.entity.kind)
        throw new RecordError(409, 'record_kind_changed');
      if ((current?.version ?? 0) !== mutation.baseVersion)
        throw new RecordError(409, 'version_conflict', current ? serialize(current) : null);
      const updatedAt = new Date();
      const version = mutation.baseVersion + 1;
      if (version > 2147483647) throw new RecordError(409, 'version_limit');
      const row = {
        ownerId,
        id: mutation.entity.data.id,
        kind: mutation.entity.kind,
        entity: mutation.entity,
        version,
        updatedAt,
      };
      if (current)
        await tx
          .update(records)
          .set(row)
          .where(and(eq(records.ownerId, ownerId), eq(records.id, row.id)));
      else await tx.insert(records).values(row);
      const response: SyncAck = { mutationId: mutation.mutationId, record: serialize(row) };
      await tx
        .insert(receipts)
        .values({ ownerId, mutationId: mutation.mutationId, fingerprint, response });
      return response;
    });
  }
}
