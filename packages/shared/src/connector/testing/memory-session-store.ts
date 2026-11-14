import type { SessionState, SessionStore } from '../connector.js';

/**
 * A `SessionStore` that keeps the states in memory, for tests that do not need the
 * database. `get` and `has` look inside without going through a promise.
 */
export class MemorySessionStore implements SessionStore {
  readonly #states = new Map<string, SessionState>();

  /** Starts with the given states, keyed by user. */
  constructor(initial: Readonly<Record<string, SessionState>> = {}) {
    for (const [userId, state] of Object.entries(initial)) this.#states.set(userId, state);
  }

  load(userId: string): Promise<SessionState | undefined> {
    return Promise.resolve(this.#states.get(userId));
  }

  save(userId: string, state: SessionState): Promise<void> {
    this.#states.set(userId, state);
    return Promise.resolve();
  }

  delete(userId: string): Promise<void> {
    this.#states.delete(userId);
    return Promise.resolve();
  }

  get(userId: string): SessionState | undefined {
    return this.#states.get(userId);
  }

  has(userId: string): boolean {
    return this.#states.has(userId);
  }
}
