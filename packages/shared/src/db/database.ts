import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { DatabaseConfig } from '../config/index.js';
import type { Database } from './schema.js';

/** A connection pool with the query builder on top. Call `destroy()` to close the pool. */
export type DatabaseClient = Kysely<Database>;

/**
 * node-postgres turns a `date` into a JavaScript Date at local midnight, which shifts the
 * day in any time zone east of UTC once it is serialised. A date column has no time zone
 * (a task's date is read in the user's zone, an itinerary item's in the trip's), so it is
 * read as the `YYYY-MM-DD` string PostgreSQL sends.
 */
function typeParsers(): pg.TypeOverrides {
  const types = new pg.TypeOverrides();
  types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);
  return types;
}

/** The node-postgres pool settings for a loaded database configuration. */
export function poolConfig(config: DatabaseConfig): pg.PoolConfig {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    // A function, so the password is not a plain property of an object that could be logged.
    password: () => config.password.reveal(),
    database: config.name,
    types: typeParsers(),
  };
}

/** Opens a pool on the configured database. Connections are made on first use. */
export function createDatabase(config: DatabaseConfig): DatabaseClient {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool(poolConfig(config)) }),
  });
}
