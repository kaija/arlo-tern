import type { Migration } from 'kysely/migration';

import * as initialSchema from './0001_initial_schema.js';

// Every migration, listed by hand so that the same list runs from TypeScript source (tests)
// and from the built image. Migrations run in the order of their names, so a name starts
// with a four-digit sequence number. To add one, see "Database" in CLAUDE.md.
//
// Migrations only go forward: there is no `down`. To undo a change, add a migration.
export const migrations: Readonly<Record<string, Migration>> = {
  '0001_initial_schema': initialSchema,
};
