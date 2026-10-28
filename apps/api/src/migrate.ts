import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

export async function migrateDatabase(url: string) {
  const client = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    const migration = await readFile(
      new URL('../migrations/0001-initial.sql', import.meta.url),
      'utf8',
    );
    const checksum = createHash('sha256').update(migration).digest('hex');
    await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('gym-schema-migrations'))`;
      await tx`CREATE TABLE IF NOT EXISTS gym_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
      const [applied] = await tx`SELECT checksum FROM gym_migration WHERE name = '0001-initial'`;
      if (applied) {
        if (applied.checksum !== checksum)
          throw new Error('An applied migration differs from source.');
        return;
      }
      await tx.unsafe(migration);
      await tx`INSERT INTO gym_migration (name, checksum) VALUES ('0001-initial', ${checksum})`;
    });
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (!process.env.DATABASE_URL) throw new Error('Missing database configuration.');
    await migrateDatabase(process.env.DATABASE_URL);
    console.log('Liftory database migrations are current.');
  } catch {
    console.error(
      'Liftory migration failed; inspect configuration and database readiness. No credentials were logged.',
    );
    process.exitCode = 1;
  }
}
