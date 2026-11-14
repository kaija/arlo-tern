const REDACTED = '[redacted]';

// Node's util.inspect and console.log call this method when it exists. Looking the symbol
// up by its registered name avoids importing a Node module here.
const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

/**
 * Holds a secret so that logging, string conversion and JSON serialisation cannot print it.
 * The value is only reachable through `reveal()`.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** Returns the secret. Call it only at the point where a client needs the value. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspectCustom](): string {
    return REDACTED;
  }
}
