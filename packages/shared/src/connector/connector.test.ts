import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Connector } from './index.js';
import {
  assertReadOnlyConnector,
  CONNECTOR_SURFACE,
  findForbiddenCallables,
  inspectConnectorDeclaration,
  inspectConnectorInstance,
  isForbiddenName,
} from './testing/index.js';

// The read-only guard (ADR-0001). The first two describe blocks check the real interface;
// the rest prove that the guard reports what it is there to report. If a test in the first
// two fails, read testing/read-only-guard.ts before touching anything.

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));

/** The module's own files: no tests, and not the test support under testing/. */
const moduleFiles = readdirSync(moduleDirectory)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .sort();

function read(name: string): string {
  return readFileSync(`${moduleDirectory}${name}`, 'utf8');
}

const interfaceSource = read('connector.ts');

/** The real source with one piece replaced; fails when the piece is not there. */
function mutate(search: string, replacement: string): string {
  expect(interfaceSource).toContain(search);
  return interfaceSource.replace(search, replacement);
}

const DISCONNECT = 'disconnect(userId: string): Promise<DisconnectResult>;';

describe('the Connector interface', () => {
  it('has exactly the pinned members', () => {
    expect(inspectConnectorDeclaration(interfaceSource)).toEqual([]);
  });

  it('pins no member whose name is an action on the account', () => {
    expect(Object.keys(CONNECTOR_SURFACE).filter(isForbiddenName)).toEqual([]);
  });

  it('pins one data member, the platform, and only methods that start, stop or observe', () => {
    // Deliberately a second copy of the list: changing the surface means changing the
    // interface, the pin in read-only-guard.ts and this line, and explaining why in review.
    expect(Object.keys(CONNECTOR_SURFACE).sort()).toEqual([
      'cancelLink',
      'disconnect',
      'platform',
      'restore',
      'startLink',
    ]);
  });
});

describe('the connector module', () => {
  it('is made of the files this test reads', () => {
    expect(moduleFiles).toEqual(['connector.ts', 'errors.ts', 'index.ts', 'types.ts']);
  });

  it.each(moduleFiles)('declares no callable named after an account action: %s', (name) => {
    expect(findForbiddenCallables(read(name))).toEqual([]);
  });
});

describe('inspectConnectorDeclaration', () => {
  it('reports an added method that sends', () => {
    const source = mutate(
      DISCONNECT,
      `${DISCONNECT}\n  sendMessage(userId: string, text: string): Promise<void>;`,
    );
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector has a member that is not pinned: sendMessage',
    ]);
    expect(findForbiddenCallables(source)).toEqual(['sendMessage']);
  });

  it('reports an added method even when its name is harmless', () => {
    const source = mutate(DISCONNECT, `${DISCONNECT}\n  sync(userId: string): Promise<void>;`);
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector has a member that is not pinned: sync',
    ]);
  });

  it('reports an added data member, which could expose a platform client', () => {
    const source = mutate(DISCONNECT, `${DISCONNECT}\n  readonly client: unknown;`);
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector has a member that is not pinned: client',
    ]);
  });

  it('reports members inherited through extends', () => {
    const source = mutate('export interface Connector {', 'export interface Connector extends X {');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector must not extend another interface',
    ]);
  });

  it('reports a second declaration that would merge into the first', () => {
    const source = `${interfaceSource}\nexport interface Connector {\n  sync(): void;\n}\n`;
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector must be declared exactly once, as an interface',
    ]);
  });

  it('reports a Connector that is no longer an interface', () => {
    const source = mutate('export interface Connector {', 'export type Connector = {');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector must be declared exactly once, as an interface',
    ]);
  });

  it('reports a changed return type', () => {
    const source = mutate(DISCONNECT, 'disconnect(userId: string): Promise<PlatformClient>;');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'disconnect must have the type Promise<DisconnectResult>, not Promise<PlatformClient>',
    ]);
  });

  it('reports a method without a return type', () => {
    const source = mutate(DISCONNECT, 'disconnect(userId: string);');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'disconnect must have the type Promise<DisconnectResult>, not (none)',
    ]);
  });

  it('reports a data member turned into something callable', () => {
    const source = mutate(
      'readonly platform: Platform;',
      'readonly platform: (text: string) => void;',
    );
    expect(inspectConnectorDeclaration(source)).toEqual([
      'platform must have the type Platform, not (text: string) => void',
    ]);
  });

  it('reports a data member turned into a method', () => {
    const source = mutate('readonly platform: Platform;', 'platform(): Platform;');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'platform must be a property, not a method',
    ]);
  });

  it('reports a method turned into a property', () => {
    const source = mutate(DISCONNECT, 'readonly disconnect: Promise<DisconnectResult>;');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'disconnect must be a method, not a property',
    ]);
  });

  it('reports a data member that can be reassigned', () => {
    const source = mutate('readonly platform: Platform;', 'platform: Platform;');
    expect(inspectConnectorDeclaration(source)).toEqual(['platform must be readonly']);
  });

  it('reports an optional member', () => {
    const source = mutate(DISCONNECT, 'disconnect?(userId: string): Promise<DisconnectResult>;');
    expect(inspectConnectorDeclaration(source)).toEqual(['disconnect must not be optional']);
  });

  it('reports an index signature, which would allow any member', () => {
    const source = mutate(DISCONNECT, `${DISCONNECT}\n  [name: string]: unknown;`);
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector has a member that is neither a method nor a property',
    ]);
  });

  it('reports a member with a computed name', () => {
    const source = mutate(DISCONNECT, `${DISCONNECT}\n  [Symbol.iterator](): void;`);
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector has a member whose name is not a plain identifier',
    ]);
  });

  it('reports a removed member', () => {
    const source = mutate(DISCONNECT, '');
    expect(inspectConnectorDeclaration(source)).toEqual([
      'Connector lacks the pinned member disconnect',
    ]);
  });
});

describe('isForbiddenName', () => {
  it.each([
    'send',
    'sendMessage',
    'reply',
    'markAsRead',
    'read',
    'readMessages',
    'ackMessage',
    'addFriend',
    'removeFriend',
    'blockContact',
    'joinGroup',
    'createGroup',
    'updateProfile',
    'setNotifications',
    'set_status',
    'changeSettings',
  ])('refuses %s', (name) => {
    expect(isForbiddenName(name)).toBe(true);
  });

  it.each([
    'sender',
    'settings',
    'address',
    'reader',
    'marker',
    'platform',
    'startLink',
    'cancelLink',
    'restore',
    'disconnect',
    'onMessage',
    'onLinkState',
    'onConnectionState',
    'load',
    'save',
    'delete',
  ])('accepts %s', (name) => {
    expect(isForbiddenName(name)).toBe(false);
  });
});

describe('findForbiddenCallables', () => {
  it('finds callables of every form, in any interface, type or class', () => {
    const source = `
      interface Outbox { sendText(text: string): void; markRead: (id: string) => void }
      type Admin = { addFriend(id: string): void; 'setProfile': () => void };
      class Client { updateSettings(): void {} blockContact = (): void => {}; }
      function replyTo(id: string): void {}
      const joinGroup = (id: string): void => {};
      const helpers = { leaveGroup: function (): void {}, inviteAll: (): void => {} };
    `;
    expect(findForbiddenCallables(source)).toEqual([
      'sendText',
      'markRead',
      'addFriend',
      'setProfile',
      'updateSettings',
      'blockContact',
      'replyTo',
      'joinGroup',
      'leaveGroup',
      'inviteAll',
    ]);
  });

  it('ignores data, and callables with other names', () => {
    const source = `
      interface Message { sender: string; read: boolean; mark: string | undefined }
      interface Host { onMessage(event: Message): void; restore: () => void }
      const send = 'a string';
      const settings = { pin: 1 };
    `;
    expect(findForbiddenCallables(source)).toEqual([]);
  });
});

describe('inspectConnectorInstance', () => {
  const allowed = {
    platform: 'line',
    startLink: () => Promise.resolve(),
    cancelLink: () => Promise.resolve(),
    restore: () => Promise.resolve(),
    disconnect: () => Promise.resolve({ deviceLoggedOut: true }),
  } satisfies Connector;

  it('accepts an object with exactly the pinned members', () => {
    expect(inspectConnectorInstance(allowed)).toEqual([]);
    expect(() => {
      assertReadOnlyConnector(allowed);
    }).not.toThrow();
  });

  it('accepts a class that keeps everything else private', () => {
    class Implementation implements Connector {
      readonly platform = 'line';
      readonly #client = { sendMessage: (): void => undefined };

      startLink(): Promise<void> {
        return this.#idle();
      }

      cancelLink(): Promise<void> {
        return this.#idle();
      }

      restore(): Promise<void> {
        return this.#idle();
      }

      async disconnect(): Promise<{ deviceLoggedOut: boolean }> {
        await this.#idle();
        return { deviceLoggedOut: this.#client !== undefined };
      }

      #idle(): Promise<void> {
        return Promise.resolve();
      }
    }
    expect(inspectConnectorInstance(new Implementation())).toEqual([]);
  });

  it('reports an extra method', () => {
    const instance = { ...allowed, sendMessage: () => Promise.resolve() };
    expect(inspectConnectorInstance(instance)).toEqual([
      'the connector has a public member that is not pinned: sendMessage',
    ]);
    expect(() => {
      assertReadOnlyConnector(instance);
    }).toThrow(
      'Not a read-only connector:\n- the connector has a public member that is not pinned: sendMessage',
    );
  });

  it('reports an exposed platform client', () => {
    expect(inspectConnectorInstance({ ...allowed, client: {} })).toEqual([
      'the connector has a public member that is not pinned: client',
    ]);
  });

  it('reports a public method on a prototype, also one TypeScript calls private', () => {
    class Base {
      markAsRead(): void {}
    }
    class Implementation extends Base {
      readonly platform = 'line';
      startLink = allowed.startLink;
      cancelLink = allowed.cancelLink;
      restore = allowed.restore;
      disconnect = allowed.disconnect;

      private helper(): void {}

      touch(): void {
        this.helper();
      }
    }
    expect(inspectConnectorInstance(new Implementation()).sort()).toEqual([
      'the connector has a public member that is not pinned: helper',
      'the connector has a public member that is not pinned: markAsRead',
      'the connector has a public member that is not pinned: touch',
    ]);
  });

  it('reports a symbol-keyed member', () => {
    const instance = { ...allowed, [Symbol('send')]: () => undefined };
    expect(inspectConnectorInstance(instance)).toEqual([
      'the connector has a symbol-keyed member: Symbol(send)',
    ]);
  });

  it('reports a missing member and a member of the wrong kind', () => {
    const { restore, ...rest } = allowed;
    expect(restore).toBeTypeOf('function');
    expect(inspectConnectorInstance({ ...rest, platform: () => 'line' })).toEqual([
      'platform must be a property, not a method',
      'the connector lacks the pinned member restore',
    ]);
    expect(inspectConnectorInstance({ ...allowed, disconnect: 'later' })).toEqual([
      'disconnect must be a method, not a property',
    ]);
  });
});
