import type { Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';

import { migrations as allMigrations } from './migrations/index.js';

/**
 * Thrown when a migration fails. Pending migrations run in one transaction, so a failure
 * leaves the database as it was before the call.
 */
export class MigrationError extends Error {
  /** The migration that failed, when the failure belongs to one. */
  readonly migration: string | undefined;

  constructor(migration: string | undefined, cause: unknown) {
    super(
      migration === undefined ? 'Migrations could not be run' : `Migration ${migration} failed`,
      { cause },
    );
    this.name = 'MigrationError';
    this.migration = migration;
  }
}

/**
 * Applies every migration that the database does not have yet and returns their names in
 * the order they ran; an empty list means the schema was already up to date.
 *
 * Safe to call from several processes at once: a lock row makes them take turns. The
 * bookkeeping lives in the tables `kysely_migration` and `kysely_migration_lock`.
 */
export async function migrateToLatest<Schema>(
  db: Kysely<Schema>,
  migrations: Readonly<Record<string, Migration>> = allMigrations,
): Promise<string[]> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve({ ...migrations }) },
  });
  const { error, results = [] } = await migrator.migrateToLatest();
  if (error !== undefined) {
    const failed = results.find((result) => result.status === 'Error');
    throw new MigrationError(failed?.migrationName, error);
  }
  return results.map((result) => result.migrationName);
}
