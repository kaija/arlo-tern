import { ConfigError, loadDatabaseConfig } from '../config/index.js';
import { createDatabase } from './database.js';
import { MigrationError, migrateToLatest } from './migrate.js';

// The migration command: applies every pending migration to the configured database, then
// exits. Run it before the services start; they do not migrate on their own.
//
//   node packages/shared/dist/db/migrate-main.js
//
// It reads DATABASE_* from the environment and nothing else. Exit code 0 means the schema is
// up to date, 1 that it is not.
function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), service: 'migrate', event, ...fields }),
  );
}

/** A database error's own fields. Never the statement that failed, and never a parameter. */
function describe(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: 'unknown error' };
  const code = (error as { code?: unknown }).code;
  return { message: error.message, ...(typeof code === 'string' ? { code } : {}) };
}

async function main(): Promise<number> {
  let config;
  try {
    config = loadDatabaseConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    log('config_invalid', { issues: error.issues });
    return 1;
  }

  const db = createDatabase(config);
  try {
    const applied = await migrateToLatest(db);
    log('migrations_applied', { applied });
    return 0;
  } catch (error) {
    if (!(error instanceof MigrationError)) throw error;
    log('migrations_failed', { migration: error.migration, error: describe(error.cause) });
    return 1;
  } finally {
    await db.destroy();
  }
}

process.exitCode = await main();
