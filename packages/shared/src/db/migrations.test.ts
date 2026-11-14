import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AnyColumn } from './columns.js';
import { createDatabase, type DatabaseClient } from './database.js';
import { MigrationError, migrateToLatest } from './migrate.js';
import { migrations } from './migrations/index.js';
import { GLOBAL_TABLES, tables, type TableName } from './schema.js';
import { createTestDatabase, findTestServer, type TestDatabase } from './testing/test-database.js';

// Applies every migration to an empty PostgreSQL database and checks the result against
// design §4.2. It needs a real server: see "Database" in CLAUDE.md for where it comes from.

const server = await findTestServer(process.env);

const tableNames = Object.keys(tables) as TableName[];
const globalTables: readonly TableName[] = GLOBAL_TABLES;
const descriptors: Record<string, Record<string, AnyColumn>> = tables;

/** The foreign key on `user_id` of the two tables whose rows outlive their user. */
const USER_REFERENCE_EXCEPTIONS: Partial<Record<TableName, string>> = {
  // ADR-0022 leaves open what happens to consent records at account deletion.
  consent_records: 'users.id NO ACTION',
  // The budget count must survive the user (ADR-0024).
  whatsapp_outbound_log: 'users.id SET NULL',
};

/** Every foreign key other than `user_id`: columns, then the target and its delete action. */
const REFERENCES: Record<string, string> = {
  'consent_records.type,version': 'consent_documents.type,version NO ACTION',
  'messages.conversation_id': 'conversations.id CASCADE',
  'pipeline_windows.conversation_id': 'conversations.id CASCADE',
  'tasks.source_conversation_id': 'conversations.id SET NULL',
  'tasks.source_message_id': 'messages.id SET NULL',
  'tasks.trip_id': 'trips.id SET NULL',
  'task_proposals.task_id': 'tasks.id CASCADE',
  'task_proposals.source_conversation_id': 'conversations.id SET NULL',
  'task_proposals.source_message_id': 'messages.id SET NULL',
  'task_changes.task_id': 'tasks.id CASCADE',
  'reminders.task_id': 'tasks.id CASCADE',
  'scam_alerts.conversation_id': 'conversations.id NO ACTION',
  'scam_alerts.source_message_id': 'messages.id SET NULL',
  'itinerary_items.trip_id': 'trips.id CASCADE',
  'trip_changes.trip_id': 'trips.id CASCADE',
  'agent_messages.conversation_id': 'agent_conversations.id CASCADE',
  'agent_runs.conversation_id': 'agent_conversations.id CASCADE',
};

/** Primary keys that are not `(id)`, and every unique constraint. */
const KEYS: Partial<Record<TableName, string[]>> = {
  users: ['PRIMARY KEY (id)', 'UNIQUE (google_sub)'],
  invites: ['PRIMARY KEY (email)'],
  consent_documents: ['PRIMARY KEY (type, version)'],
  refresh_tokens: ['PRIMARY KEY (token_hash)'],
  devices: ['PRIMARY KEY (user_id, device_id)'],
  user_settings: ['PRIMARY KEY (user_id)'],
  line_connections: ['PRIMARY KEY (user_id)'],
  conversations: ['PRIMARY KEY (id)', 'UNIQUE (user_id, platform, external_id)'],
  messages: ['PRIMARY KEY (id)', 'UNIQUE (conversation_id, external_id)'],
  oa_bindings: ['PRIMARY KEY (user_id, platform)', 'UNIQUE (platform, external_user_id)'],
  oa_binding_codes: ['PRIMARY KEY (code_hash)'],
};

/**
 * The text and JSON columns of the tables that hold derived data. None of them may hold
 * message text (ADR-0004): adding a column here needs the same care.
 */
const DERIVED_DATA_CONTENT_COLUMNS: Partial<Record<TableName, string[]>> = {
  tasks: ['category', 'source', 'status', 'title'],
  task_proposals: ['kind', 'proposed', 'status'],
  scam_alerts: ['category', 'feedback', 'level', 'reason', 'status'],
  memory_entries: ['content', 'source_channel'],
  notifications: ['ref_type', 'title', 'type'],
};

interface ConstraintRow {
  table: string;
  kind: string;
  definition: string;
}

async function constraints(db: DatabaseClient, kinds: string[]): Promise<ConstraintRow[]> {
  const result = await sql<ConstraintRow>`
    SELECT c.conrelid::regclass::text AS "table", c.contype::text AS kind,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype::text = ANY(${kinds})
    ORDER BY 1, 3`.execute(db);
  return result.rows.filter((row) => (tableNames as string[]).includes(row.table));
}

interface IndexRow {
  table: string;
  name: string;
  columns: string[];
  unique: boolean;
  predicate: string | null;
}

async function indexes(db: DatabaseClient): Promise<IndexRow[]> {
  const result = await sql<IndexRow>`
    SELECT i.indrelid::regclass::text AS "table", i.indexrelid::regclass::text AS name,
           ARRAY(
             SELECT a.attname::text
             FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
             ORDER BY k.ord
           ) AS columns,
           i.indisunique AS "unique", pg_get_expr(i.indpred, i.indrelid) AS predicate
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY 1, 2`.execute(db);
  return result.rows;
}

interface ColumnRow {
  table: string;
  column: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
}

async function columns(db: DatabaseClient): Promise<ColumnRow[]> {
  const result = await sql<ColumnRow>`
    SELECT table_name::text AS "table", column_name::text AS "column", data_type::text AS type,
           is_nullable = 'YES' AS nullable, column_default IS NOT NULL AS "hasDefault"
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`.execute(db);
  return result.rows;
}

/** Everything the migrations define, for comparing the schema before and after a re-run. */
async function schemaSnapshot(db: DatabaseClient): Promise<unknown> {
  const applied = await sql`SELECT name, timestamp FROM kysely_migration ORDER BY name`.execute(db);
  return {
    columns: await columns(db),
    constraints: await constraints(db, ['p', 'u', 'f', 'c']),
    indexes: await indexes(db),
    applied: applied.rows,
  };
}

describe.skipIf(server === undefined)('the migrations on an empty database', () => {
  let database: TestDatabase;
  let db: DatabaseClient;
  let applied: string[];

  beforeAll(async () => {
    if (server === undefined) throw new Error('unreachable: the suite is skipped');
    database = await createTestDatabase(server);
    db = database.db;
    applied = await migrateToLatest(db);
  });

  afterAll(async () => {
    await database.drop();
  });

  it('apply in order, all of them', () => {
    expect(applied).toEqual(Object.keys(migrations).toSorted());
  });

  it('change nothing when they are applied again', async () => {
    const before = await schemaSnapshot(db);
    expect(await migrateToLatest(db)).toEqual([]);
    expect(await schemaSnapshot(db)).toEqual(before);
  });

  it('create exactly the tables of design §4.2, plus the migration bookkeeping', async () => {
    const result = await sql<{ name: string }>`
      SELECT table_name::text AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`.execute(db);
    expect(result.rows.map((row) => row.name).toSorted()).toEqual(
      [...tableNames, 'kysely_migration', 'kysely_migration_lock'].toSorted(),
    );
    expect(tableNames).toHaveLength(28);
  });

  it('create no schema, extension or role of their own', async () => {
    const schemas = await sql<{ name: string }>`
      SELECT nspname::text AS name FROM pg_namespace
      WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'`.execute(db);
    expect(schemas.rows.map((row) => row.name)).toEqual(['public']);

    const extensions = await sql<{ name: string }>`
      SELECT extname::text AS name FROM pg_extension`.execute(db);
    expect(extensions.rows.map((row) => row.name)).toEqual(['plpgsql']);
  });

  it('give every table the columns that schema.ts describes', async () => {
    const actual: Record<string, Record<string, AnyColumn>> = {};
    for (const row of await columns(db)) {
      if (!(tableNames as string[]).includes(row.table)) continue;
      (actual[row.table] ??= {})[row.column] = {
        type: row.type as AnyColumn['type'],
        nullable: row.nullable,
        hasDefault: row.hasDefault,
      };
    }
    const described = Object.fromEntries(
      Object.entries(descriptors).map(([table, tableColumns]) => [
        table,
        Object.fromEntries(
          Object.entries(tableColumns).map(([name, { type, nullable, hasDefault }]) => [
            name,
            { type, nullable, hasDefault },
          ]),
        ),
      ]),
    );
    expect(actual).toEqual(described);
  });

  it('limit each enumerated column to the values schema.ts lists', async () => {
    const checks = await constraints(db, ['c']);
    for (const [table, tableColumns] of Object.entries(descriptors)) {
      for (const [name, { oneOf }] of Object.entries(tableColumns)) {
        if (oneOf === undefined) continue;
        // e.g. CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])))
        const check = checks.find(
          (row) => row.table === table && row.definition.startsWith(`CHECK ((${name} = `),
        );
        expect(check, `${table}.${name}`).toBeDefined();
        const allowed = [...(check?.definition ?? '').matchAll(/'([^']*)'::text/g)].map(
          (match) => match[1],
        );
        expect(allowed.toSorted(), `${table}.${name}`).toEqual(oneOf.toSorted());
      }
    }
  });

  it('give every business table a user_id that refers to the user', async () => {
    const foreignKeys = await constraints(db, ['f']);
    for (const table of tableNames) {
      const reference = foreignKeys.find(
        (row) => row.table === table && row.definition.startsWith('FOREIGN KEY (user_id) '),
      );
      if (table === 'users' || globalTables.includes(table)) {
        expect(descriptors[table], table).not.toHaveProperty('user_id');
        expect(reference, table).toBeUndefined();
      } else {
        expect(descriptors[table], table).toHaveProperty('user_id');
        expect(reference, table).toBeDefined();
      }
    }
  });

  it('define exactly the foreign keys of the design, with their delete behaviour', async () => {
    const actual: Record<string, string> = {};
    for (const row of await constraints(db, ['f'])) {
      const match = /^FOREIGN KEY \((.+)\) REFERENCES (\w+)\((.+?)\)(?: ON DELETE (.+))?$/.exec(
        row.definition,
      );
      if (match === null) throw new Error(`unexpected foreign key: ${row.definition}`);
      const [, from = '', target = '', to = '', action = 'NO ACTION'] = match;
      actual[`${row.table}.${from.replaceAll(' ', '')}`] =
        `${target}.${to.replaceAll(' ', '')} ${action}`;
    }

    const expected: Record<string, string> = { ...REFERENCES };
    for (const table of tableNames) {
      if (table === 'users' || globalTables.includes(table)) continue;
      expected[`${table}.user_id`] = USER_REFERENCE_EXCEPTIONS[table] ?? 'users.id CASCADE';
    }
    expect(actual).toEqual(expected);
  });

  it('define exactly the primary keys and unique constraints of the design', async () => {
    const actual: Record<string, string[]> = {};
    for (const row of await constraints(db, ['p', 'u'])) {
      (actual[row.table] ??= []).push(row.definition);
    }
    const expected = Object.fromEntries(
      tableNames.map((table) => [table, KEYS[table] ?? ['PRIMARY KEY (id)']]),
    );
    expect(actual).toEqual(expected);
  });

  it('have no unique index beyond the keys, except one unprocessed window', async () => {
    const keyCount = (await constraints(db, ['p', 'u'])).length;
    const unique = (await indexes(db)).filter(
      (index) => index.unique && (tableNames as string[]).includes(index.table),
    );
    expect(unique.filter((index) => index.predicate !== null)).toEqual([
      {
        table: 'pipeline_windows',
        name: 'pipeline_windows_one_unprocessed_per_conversation',
        columns: ['conversation_id'],
        unique: true,
        predicate: '(processed_at IS NULL)',
      },
    ]);
    expect(unique.filter((index) => index.predicate === null)).toHaveLength(keyCount);
  });

  it('index every foreign key, so a delete never scans the referring table', async () => {
    const all = (await indexes(db)).filter((index) => index.predicate === null);
    for (const row of await constraints(db, ['f'])) {
      const referring = (/^FOREIGN KEY \((.+?)\)/.exec(row.definition)?.[1] ?? '').split(', ');
      const covered = all.some(
        (index) =>
          index.table === row.table &&
          referring.every((column, position) => index.columns[position] === column),
      );
      expect(covered, `${row.table}: ${row.definition}`).toBe(true);
    }
  });

  it('keep message text out of derived data', async () => {
    const actual: Record<string, string[]> = {};
    for (const row of await columns(db)) {
      if (!(row.table in DERIVED_DATA_CONTENT_COLUMNS)) continue;
      if (row.type === 'text' || row.type === 'jsonb') (actual[row.table] ??= []).push(row.column);
    }
    for (const list of Object.values(actual)) list.sort();
    expect(actual).toEqual(DERIVED_DATA_CONTENT_COLUMNS);
  });

  describe('with a user who has a conversation and a message', () => {
    let userId: string;
    let conversationId: string;
    let messageId: string;
    let subject = 0;

    async function addUser(): Promise<string> {
      subject += 1;
      const user = await db
        .insertInto('users')
        .values({
          google_sub: `test-sub-${String(subject)}`,
          email: `user-${String(subject)}@example.test`,
          display_name: 'Test User',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return user.id;
    }

    async function addMessage(externalId: string): Promise<string> {
      const message = await db
        .insertInto('messages')
        .values({
          user_id: userId,
          conversation_id: conversationId,
          external_id: externalId,
          sender_external_id: 'test-sender',
          sender_name: 'Sender',
          direction: 'incoming',
          content_type: 'text',
          text: 'a test message',
          sent_at: new Date('2026-11-14T01:00:00Z'),
          received_at: new Date('2026-11-14T01:00:01Z'),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return message.id;
    }

    async function addTask(sourceMessageId: string | null): Promise<string> {
      const task = await db
        .insertInto('tasks')
        .values({
          user_id: userId,
          title: 'Pay the electricity bill',
          date: '2026-03-01',
          time: '09:30',
          all_day: false,
          category: 'payment',
          status: 'active',
          source: 'pipeline',
          confidence: 0.9,
          user_modified: false,
          source_conversation_id: sourceMessageId === null ? null : conversationId,
          source_message_id: sourceMessageId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return task.id;
    }

    beforeAll(async () => {
      userId = await addUser();
      const conversation = await db
        .insertInto('conversations')
        .values({
          user_id: userId,
          platform: 'line',
          external_id: 'test-chat',
          type: 'direct',
          name: 'Test Chat',
          first_seen_at: new Date('2026-11-14T00:00:00Z'),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      conversationId = conversation.id;
      messageId = await addMessage('test-message-1');
    });

    it('generates identifiers and creation times', async () => {
      const user = await db
        .selectFrom('users')
        .select(['id', 'created_at'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(user.id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
      expect(user.created_at).toBeInstanceOf(Date);
    });

    it('reads a date as the day that was written, and a time without a zone', async () => {
      const taskId = await addTask(null);
      const task = await db
        .selectFrom('tasks')
        .select(['date', 'time', 'confidence'])
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow();
      expect(task).toEqual({ date: '2026-03-01', time: '09:30:00', confidence: 0.9 });
    });

    it('rejects a second copy of a message in the same conversation', async () => {
      await expect(addMessage('test-message-1')).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects a value outside an enumerated set', async () => {
      const insert = sql`
        INSERT INTO reminders (user_id, task_id, remind_at, status, origin, user_modified)
        VALUES (${userId}, ${await addTask(null)}, now(), 'snoozed', 'ai', false)`.execute(db);
      await expect(insert).rejects.toMatchObject({ code: '23514' });
    });

    it('allows one unprocessed window per conversation at a time', async () => {
      const window = {
        user_id: userId,
        conversation_id: conversationId,
        status: 'test',
        first_message_at: new Date('2026-11-14T01:00:00Z'),
        last_message_at: new Date('2026-11-14T01:00:00Z'),
        message_count: 1,
      };
      const first = await db
        .insertInto('pipeline_windows')
        .values(window)
        .returning('id')
        .executeTakeFirstOrThrow();
      await expect(
        db.insertInto('pipeline_windows').values(window).execute(),
      ).rejects.toMatchObject({ code: '23505' });

      await db
        .updateTable('pipeline_windows')
        .set({ processed_at: new Date('2026-11-14T01:05:00Z') })
        .where('id', '=', first.id)
        .execute();
      await db.insertInto('pipeline_windows').values(window).execute();
    });

    it('requires a target task for a proposal that updates or cancels', async () => {
      const proposal = {
        user_id: userId,
        proposed: { title: 'Pay the water bill' },
        confidence: 0.5,
        status: 'pending',
      } as const;
      await db
        .insertInto('task_proposals')
        .values({ ...proposal, kind: 'create' })
        .execute();
      await expect(
        db
          .insertInto('task_proposals')
          .values({ ...proposal, kind: 'cancel' })
          .execute(),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('empties the source reference when the source message is deleted', async () => {
      const sourceId = await addMessage('test-message-source');
      const taskId = await addTask(sourceId);
      const proposal = await db
        .insertInto('task_proposals')
        .values({
          user_id: userId,
          kind: 'update',
          task_id: taskId,
          proposed: { date: '2026-03-02' },
          confidence: 0.4,
          status: 'pending',
          source_conversation_id: conversationId,
          source_message_id: sourceId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const alert = await db
        .insertInto('scam_alerts')
        .values({
          user_id: userId,
          conversation_id: conversationId,
          category: 'phishing_link',
          confidence: 0.95,
          level: 'high',
          reason: 'Asks for a card number through an unfamiliar link.',
          status: 'open',
          source_message_id: sourceId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db.deleteFrom('messages').where('id', '=', sourceId).execute();

      const task = await db
        .selectFrom('tasks')
        .select(['title', 'source_message_id', 'source_conversation_id'])
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow();
      expect(task).toEqual({
        title: 'Pay the electricity bill',
        source_message_id: null,
        source_conversation_id: conversationId,
      });
      const remainingProposal = await db
        .selectFrom('task_proposals')
        .select(['task_id', 'source_message_id'])
        .where('id', '=', proposal.id)
        .executeTakeFirstOrThrow();
      expect(remainingProposal).toEqual({ task_id: taskId, source_message_id: null });
      const remainingAlert = await db
        .selectFrom('scam_alerts')
        .select(['reason', 'source_message_id'])
        .where('id', '=', alert.id)
        .executeTakeFirstOrThrow();
      expect(remainingAlert).toEqual({
        reason: 'Asks for a card number through an unfamiliar link.',
        source_message_id: null,
      });
    });

    it('keeps a task and detaches it when its trip is deleted', async () => {
      const trip = await db
        .insertInto('trips')
        .values({
          user_id: userId,
          name: 'Kyoto',
          destination: 'Kyoto',
          start_date: '2026-12-01',
          end_date: '2026-12-05',
          time_zone: 'Asia/Tokyo',
          status: 'planning',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const taskId = await addTask(null);
      await db.updateTable('tasks').set({ trip_id: trip.id }).where('id', '=', taskId).execute();
      await db
        .insertInto('itinerary_items')
        .values({
          user_id: userId,
          trip_id: trip.id,
          date: '2026-12-02',
          start_time: '10:00',
          type: 'attraction',
          title: 'Fushimi Inari',
          position: 0,
        })
        .execute();

      await db.deleteFrom('trips').where('id', '=', trip.id).execute();

      const task = await db
        .selectFrom('tasks')
        .select('trip_id')
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow();
      expect(task.trip_id).toBeNull();
      const items = await db
        .selectFrom('itinerary_items')
        .select('id')
        .where('trip_id', '=', trip.id)
        .execute();
      expect(items).toEqual([]);
    });

    it('refuses to delete a conversation that still has an alert', async () => {
      const alerts = await db
        .selectFrom('scam_alerts')
        .select('id')
        .where('conversation_id', '=', conversationId)
        .execute();
      expect(alerts.length).toBeGreaterThan(0);
      await expect(
        db.deleteFrom('conversations').where('id', '=', conversationId).execute(),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('deletes the user with everything that belongs to them, but keeps the send log', async () => {
      await db
        .insertInto('whatsapp_outbound_log')
        .values({ user_id: userId, kind: 'test', sent_at: new Date('2026-11-14T02:00:00Z') })
        .execute();
      expect(messageId).toBeDefined();

      await db.deleteFrom('users').where('id', '=', userId).execute();

      for (const table of tableNames) {
        if (table === 'users' || globalTables.includes(table)) continue;
        const rows = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM ${sql.table(table)}
          WHERE user_id = ${userId}`.execute(db);
        expect(rows.rows[0]?.count, table).toBe(0);
      }
      const log = await db.selectFrom('whatsapp_outbound_log').select('user_id').execute();
      expect(log).toEqual([{ user_id: null }]);
    });

    it('refuses to delete a user who has consent records', async () => {
      const consenting = await addUser();
      await db
        .insertInto('consent_documents')
        .values({
          type: 'terms_and_privacy',
          version: '1',
          title: 'Terms',
          url: 'https://example.test/terms',
          published_at: new Date('2026-11-01T00:00:00Z'),
        })
        .execute();
      await db
        .insertInto('consent_records')
        .values({
          user_id: consenting,
          type: 'terms_and_privacy',
          version: '1',
          accepted_at: new Date('2026-11-14T00:00:00Z'),
        })
        .execute();
      await expect(
        db.deleteFrom('users').where('id', '=', consenting).execute(),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('a migration that fails', () => {
    it('is reported by name and leaves nothing behind', async () => {
      const broken = {
        ...migrations,
        '9998_half_done': {
          async up(migrating: Parameters<(typeof migrations)[string]['up']>[0]) {
            await sql`CREATE TABLE half_done (id integer)`.execute(migrating);
            await sql`SELECT * FROM a_table_that_does_not_exist`.execute(migrating);
          },
        },
      };
      const failure = await migrateToLatest(db, broken).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(MigrationError);
      expect(failure).toMatchObject({ migration: '9998_half_done' });
      expect((failure as MigrationError).cause).toMatchObject({ code: '42P01' });

      const leftover = await sql`SELECT to_regclass('half_done') AS name`.execute(db);
      expect(leftover.rows).toEqual([{ name: null }]);
      expect(await migrateToLatest(db)).toEqual([]);
    });
  });
});

describe.skipIf(server === undefined)('migrateToLatest', () => {
  it('reports a database it cannot reach without naming a migration', async () => {
    if (server === undefined) throw new Error('unreachable: the suite is skipped');
    const missing = createDatabase({ ...server, name: 'arlo_test_database_that_does_not_exist' });
    try {
      const failure = await migrateToLatest(missing).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(MigrationError);
      expect(failure).toMatchObject({ migration: undefined });
    } finally {
      await missing.destroy();
    }
  });
});
