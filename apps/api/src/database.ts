import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDatabase(url: string) {
  const client = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 5,
    onnotice: () => {},
  });
  return { client, db: drizzle(client, { schema }) };
}
export type Database = ReturnType<typeof createDatabase>;
