import { describe, expect, it } from 'vitest';

import { MemorySessionStore } from './index.js';

describe('MemorySessionStore', () => {
  it('starts empty', async () => {
    const store = new MemorySessionStore();
    expect(await store.load('user-1')).toBeUndefined();
    expect(store.has('user-1')).toBe(false);
    expect(store.get('user-1')).toBeUndefined();
  });

  it('starts with the given states', async () => {
    const store = new MemorySessionStore({ 'user-1': { token: 'fake' } });
    expect(await store.load('user-1')).toEqual({ token: 'fake' });
    expect(store.has('user-2')).toBe(false);
  });

  it('saves, replaces and deletes a state per user', async () => {
    const store = new MemorySessionStore();
    await store.save('user-1', { serial: 1 });
    await store.save('user-2', { serial: 7 });
    await store.save('user-1', { serial: 2 });
    expect(store.get('user-1')).toEqual({ serial: 2 });

    await store.delete('user-1');
    await store.delete('user-1');
    expect(await store.load('user-1')).toBeUndefined();
    expect(await store.load('user-2')).toEqual({ serial: 7 });
  });
});
