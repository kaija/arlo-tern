import { describe, expect, it } from 'vitest';

import { migrations } from './index.js';

describe('the migration list', () => {
  const names = Object.keys(migrations);

  it('numbers the migrations in sequence from 0001', () => {
    names.forEach((name, position) => {
      expect(name).toMatch(/^\d{4}_[a-z0-9]+(_[a-z0-9]+)*$/);
      expect(Number(name.slice(0, 4))).toBe(position + 1);
    });
  });

  it('only goes forward', () => {
    for (const [name, migration] of Object.entries(migrations)) {
      expect(Object.keys(migration), name).toEqual(['up']);
    }
  });
});
