import { describe, expect, it } from 'vitest';

import { nullable, oneOf, text, timestamptz, uuid, withDefault } from './columns.js';
import { GLOBAL_TABLES, tables } from './schema.js';

describe('column descriptors', () => {
  it('describe a required column with no default', () => {
    expect(text()).toEqual({ type: 'text', nullable: false, hasDefault: false });
  });

  it('record that a column accepts NULL or has a default', () => {
    expect(nullable(timestamptz())).toMatchObject({ nullable: true, hasDefault: false });
    expect(withDefault(uuid())).toMatchObject({ nullable: false, hasDefault: true });
  });

  it('keep the allowed values of an enumerated column', () => {
    expect(nullable(oneOf('include', 'exclude'))).toEqual({
      type: 'text',
      nullable: true,
      hasDefault: false,
      oneOf: ['include', 'exclude'],
    });
  });
});

describe('the schema', () => {
  it('names tables and columns in snake case', () => {
    for (const [table, columns] of Object.entries(tables)) {
      for (const name of [table, ...Object.keys(columns)]) {
        expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      }
    }
  });

  it('gives every table a user_id, except users itself and the tables without user data', () => {
    const withoutUser = Object.entries(tables)
      .filter(([, columns]) => !('user_id' in columns))
      .map(([table]) => table);
    expect(withoutUser.toSorted()).toEqual(['users', ...GLOBAL_TABLES].toSorted());
  });
});
