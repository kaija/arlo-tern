import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { Secret, type DatabaseConfig, type Environment } from '../../config/index.js';
import { createDatabase, poolConfig, type DatabaseClient } from '../database.js';

// Support for tests that need a real PostgreSQL. Each test file gets a database of its own,
// created empty on the server the tests are pointed at and dropped afterwards, so a test
// never reads or changes the development database.
//
// Test code only: excluded from the build and from coverage.

/** The PostgreSQL of docker-compose.yml with its development-only defaults. */
const LOCAL_COMPOSE_SERVER = 'postgres://arlo:arlo-dev-only@127.0.0.1:5432/arlo';

/** Network failures that mean "no server is listening there", as opposed to a refusal. */
const UNREACHABLE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT']);

function parseServer(url: string): DatabaseConfig {
  const { hostname, port, username, password, pathname } = new URL(url);
  return {
    host: hostname,
    port: port === '' ? 5432 : Number(port),
    user: decodeURIComponent(username),
    password: new Secret(decodeURIComponent(password)),
    name: decodeURIComponent(pathname.slice(1)),
  };
}

function isUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // A refused connection to a host with several addresses arrives as an AggregateError.
  const errors = error instanceof AggregateError ? (error.errors as unknown[]) : [error];
  return errors.some((each) => UNREACHABLE.has(String((each as { code?: unknown }).code)));
}

/**
 * Finds the PostgreSQL server the database tests run on: `TEST_DATABASE_URL` when it is
 * set, otherwise the local Compose stack. The URL names an existing database to connect
 * to; the tests only create and drop databases of their own next to it.
 *
 * Returns `undefined` when nothing listens on the default local address, and the caller
 * skips its tests. An unreachable server is an error instead when `TEST_DATABASE_URL` is
 * set or `CI` is, so a misconfigured CI job cannot pass by skipping.
 */
export async function findTestServer(env: Environment): Promise<DatabaseConfig | undefined> {
  const explicit = env.TEST_DATABASE_URL !== undefined && env.TEST_DATABASE_URL !== '';
  const server = parseServer(explicit ? String(env.TEST_DATABASE_URL) : LOCAL_COMPOSE_SERVER);
  const mustRun = explicit || (env.CI !== undefined && env.CI !== '');

  const client = new pg.Client({ ...poolConfig(server), connectionTimeoutMillis: 3000 });
  // A connection that drops while idle must not surface as an uncaught 'error' event.
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.end();
    return server;
  } catch (error) {
    if (mustRun || !isUnreachable(error)) throw error;
    console.warn(
      `No PostgreSQL at ${server.host}:${String(server.port)}: the database tests are skipped. ` +
        'Start it with `docker compose up -d postgres`.',
    );
    return undefined;
  }
}

export interface TestDatabase {
  readonly db: DatabaseClient;
  /** Closes the pool and drops the database. */
  drop(): Promise<void>;
}

/** Creates an empty database with a random name on the server. Apply migrations yourself. */
export async function createTestDatabase(server: DatabaseConfig): Promise<TestDatabase> {
  const name = `arlo_test_${randomBytes(6).toString('hex')}`;

  const administer = async (statement: string) => {
    const client = new pg.Client(poolConfig(server));
    await client.connect();
    try {
      await client.query(statement);
    } finally {
      await client.end();
    }
  };

  await administer(`CREATE DATABASE ${name}`);
  const db = createDatabase({ ...server, name });
  return {
    db,
    async drop() {
      await db.destroy();
      await administer(`DROP DATABASE ${name} WITH (FORCE)`);
    },
  };
}
