import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Secret } from './secret.js';

describe('Secret', () => {
  const value = 'sentinel-secret-value';
  const secret = new Secret(value);

  it('returns the value only through reveal()', () => {
    expect(secret.reveal()).toBe(value);
  });

  it('does not print the value when converted, serialised or inspected', () => {
    const printed = [
      String(secret),
      `${secret.toString()}`,
      JSON.stringify(secret),
      JSON.stringify({ nested: { secret } }),
      inspect(secret),
      inspect({ nested: { secret } }, { depth: null, showHidden: true }),
    ];
    for (const text of printed) {
      expect(text).not.toContain(value);
      expect(text).toContain('[redacted]');
    }
  });

  it('exposes no enumerable property that holds the value', () => {
    expect(Object.keys(secret)).toEqual([]);
    expect(Object.values(secret)).toEqual([]);
  });
});
