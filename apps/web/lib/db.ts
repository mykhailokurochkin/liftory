import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  sqlClient?: postgres.Sql;
};

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/liftory_local';

export const sqlClient =
  globalForDb.sqlClient ??
  postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: connectionString.includes('sslmode=require') ? 'require' : undefined,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sqlClient = sqlClient;
}

export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
