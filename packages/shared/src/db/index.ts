// Database access of the two backend services, exported as `@arlo-tern/shared/db`.
// Backend only, like `@arlo-tern/shared/config`: the mobile app must not import this path,
// and the package's root entry must not re-export it.
export type { JsonObject } from './columns.js';
export { createDatabase, poolConfig, type DatabaseClient } from './database.js';
export { MigrationError, migrateToLatest } from './migrate.js';
export { GLOBAL_TABLES, tables, type Database, type TableName } from './schema.js';
