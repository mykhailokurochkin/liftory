import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not set.');
  process.exit(1);
}

console.log('Connecting to Neon database...');
const client = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  ssl: 'require',
  onnotice: () => {},
});

try {
  const migration = await readFile(
    new URL('../../api/migrations/0001-initial.sql', import.meta.url),
    'utf8',
  );
  const checksum = createHash('sha256').update(migration).digest('hex');

  await client.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('gym-schema-migrations'))`;
    await tx`CREATE TABLE IF NOT EXISTS gym_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const [applied] = await tx`SELECT checksum FROM gym_migration WHERE name = '0001-initial'`;
    if (applied) {
      console.log('Migration 0001-initial has already been applied.');
      return;
    }
    console.log('Applying 0001-initial schema to Neon...');
    await tx.unsafe(migration);
    await tx`INSERT INTO gym_migration (name, checksum) VALUES ('0001-initial', ${checksum})`;
    console.log('Successfully applied 0001-initial migration!');
  });
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  await client.end();
}
