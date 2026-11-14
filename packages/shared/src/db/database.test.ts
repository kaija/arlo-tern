import { inspect } from 'node:util';

import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { Secret } from '../config/index.js';
import { createDatabase, poolConfig } from './database.js';

const config = {
  host: 'postgres.test',
  port: 6543,
  user: 'arlo',
  password: new Secret('test-database-password'),
  name: 'arlo_test',
};

describe('poolConfig', () => {
  it('maps the loaded configuration to node-postgres settings', () => {
    expect(poolConfig(config)).toMatchObject({
      host: 'postgres.test',
      port: 6543,
      user: 'arlo',
      database: 'arlo_test',
    });
  });

  it('hands the password over only when a connection asks for it', () => {
    const settings = poolConfig(config);
    expect(inspect(settings, { depth: 5 })).not.toContain('test-database-password');
    expect(JSON.stringify(settings)).not.toContain('test-database-password');
    expect(typeof settings.password === 'function' && settings.password()).toBe(
      'test-database-password',
    );
  });

  /** Parses a value the way a connection made from the pool settings would. */
  function parse(type: number, value: string): unknown {
    const parser = poolConfig(config).types?.getTypeParser(type) as (value: string) => unknown;
    return parser(value);
  }

  it('reads a date as the text PostgreSQL sends, not as a local-midnight Date', () => {
    expect(parse(pg.types.builtins.DATE, '2026-03-01')).toBe('2026-03-01');
  });

  it('leaves the other types to the node-postgres defaults', () => {
    expect(parse(pg.types.builtins.TIMESTAMPTZ, '2026-03-01 08:00:00+08')).toEqual(
      new Date('2026-03-01T00:00:00Z'),
    );
  });
});

describe('createDatabase', () => {
  it('opens no connection until a query runs', async () => {
    // The host does not exist; creating and closing the pool must still succeed.
    const db = createDatabase(config);
    await db.destroy();
  });
});
