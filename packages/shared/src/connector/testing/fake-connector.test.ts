import { describe, expect, it } from 'vitest';

import {
  ConnectorError,
  type ConnectionStateEvent,
  type Connector,
  type ConnectorHost,
  type LinkStateEvent,
  type MessageReceivedEvent,
  type SessionState,
  type SessionStore,
} from '../index.js';
import {
  assertReadOnlyConnector,
  createFakeConnector,
  FakeConnectorUsageError,
  MemorySessionStore,
  type FakeConnector,
} from './index.js';

const USER = 'user-1';
const OTHER_USER = 'user-2';
const LINK = 'link-1';

type Reported =
  | { readonly on: 'link'; readonly event: LinkStateEvent }
  | { readonly on: 'connection'; readonly event: ConnectionStateEvent }
  | { readonly on: 'message'; readonly event: MessageReceivedEvent };

interface Setup {
  readonly fake: FakeConnector;
  readonly connector: Connector;
  readonly sessions: MemorySessionStore;
  /** Everything the fake reported to the host, in order. */
  readonly reported: Reported[];
}

function setup(overrides: Partial<ConnectorHost> = {}, stored?: Record<string, SessionState>) {
  const sessions = new MemorySessionStore(stored);
  const reported: Reported[] = [];
  const fake = createFakeConnector();
  const connector = fake.create({
    sessions,
    onLinkState: (event) => void reported.push({ on: 'link', event }),
    onConnectionState: (event) => void reported.push({ on: 'connection', event }),
    onMessage: (event) => void reported.push({ on: 'message', event }),
    ...overrides,
  });
  return { fake, connector, sessions, reported } satisfies Setup;
}

/** A user who went through a link flow and is connected; the reports so far are dropped. */
async function linked(overrides: Partial<ConnectorHost> = {}): Promise<Setup> {
  const context = setup(overrides);
  await context.connector.startLink({ userId: USER, linkSessionId: LINK });
  await context.fake.completeLink(LINK);
  context.reported.length = 0;
  return context;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the promise did not reject');
}

async function connectorErrorCode(promise: Promise<unknown>): Promise<string> {
  const error = await rejection(promise);
  if (!(error instanceof ConnectorError)) throw new Error('not a ConnectorError');
  return error.code;
}

/** A store whose `save` settles only when the test says so. */
function slowStore(): {
  store: SessionStore;
  inner: MemorySessionStore;
  finishSave(): void;
} {
  const inner = new MemorySessionStore();
  let release: (() => void) | undefined;
  const store: SessionStore = {
    load: (userId) => inner.load(userId),
    delete: (userId) => inner.delete(userId),
    async save(userId, state) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await inner.save(userId, state);
    },
  };
  return {
    store,
    inner,
    finishSave() {
      if (release === undefined) throw new Error('save was not called');
      release();
    },
  };
}

describe('createFakeConnector', () => {
  it('hands out a connector with nothing beyond the read-only surface', () => {
    const { connector } = setup();
    assertReadOnlyConnector(connector);
    expect(connector.platform).toBe('line');
  });

  it('can be created once', () => {
    const { fake, sessions } = setup();
    expect(() =>
      fake.create({
        sessions,
        onLinkState: () => undefined,
        onConnectionState: () => undefined,
        onMessage: () => undefined,
      }),
    ).toThrow(FakeConnectorUsageError);
  });

  it('refuses every control before create', async () => {
    const fake = createFakeConnector();
    const attempts = [
      fake.presentQrCode(LINK),
      fake.presentVerificationCode(LINK),
      fake.completeLink(LINK),
      fake.failLink(LINK),
      fake.expireLink(LINK),
      fake.dropConnection(USER),
      fake.recoverConnection(USER),
      fake.invalidateSession(USER),
      fake.refreshSession(USER),
      fake.deliverMessage(USER),
    ];
    for (const attempt of attempts) {
      const error = await rejection(attempt);
      expect(error).toBeInstanceOf(FakeConnectorUsageError);
      expect((error as Error).message).toBe('create() has not been called yet');
    }
    expect(fake.linkStatus(LINK)).toBeUndefined();
    expect(fake.connectionState(USER)).toBeUndefined();
  });

  it('behaves the same way every time', async () => {
    async function run(): Promise<unknown> {
      const { fake, connector, reported, sessions } = setup();
      await connector.startLink({ userId: USER, linkSessionId: LINK });
      await fake.presentQrCode(LINK);
      await fake.presentVerificationCode(LINK);
      await fake.completeLink(LINK);
      await fake.deliverMessage(USER);
      await fake.deliverMessage(USER, { content: { type: 'image' } });
      await fake.refreshSession(USER);
      return { reported, session: sessions.get(USER) };
    }
    expect(await run()).toEqual(await run());
  });
});

describe('a link flow', () => {
  it('starts as pending and reports nothing by itself', async () => {
    const { fake, connector, reported } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    expect(fake.linkStatus(LINK)).toBe('pending');
    expect(reported).toEqual([]);
  });

  it('reports the QR code and the verification code, with made-up or given values', async () => {
    const { fake, connector, reported } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });

    await fake.presentQrCode(LINK);
    expect(fake.linkStatus(LINK)).toBe('awaiting_scan');
    await fake.presentVerificationCode(LINK);
    expect(fake.linkStatus(LINK)).toBe('awaiting_verification');
    await fake.presentQrCode(LINK, 'given-qr');
    await fake.presentVerificationCode(LINK, '424242');

    const base = { userId: USER, linkSessionId: LINK };
    expect(reported).toEqual([
      { on: 'link', event: { ...base, status: 'awaiting_scan', qrPayload: 'fake-qr-1' } },
      {
        on: 'link',
        event: { ...base, status: 'awaiting_verification', verificationCode: '000002' },
      },
      { on: 'link', event: { ...base, status: 'awaiting_scan', qrPayload: 'given-qr' } },
      {
        on: 'link',
        event: { ...base, status: 'awaiting_verification', verificationCode: '424242' },
      },
    ]);
  });

  it('enforces no order: the verification code may come first, or nothing at all', async () => {
    const { fake, connector, reported } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.presentVerificationCode(LINK);
    await fake.presentQrCode(LINK);
    await fake.completeLink(LINK);
    const base = { userId: USER, linkSessionId: LINK };
    expect(reported).toEqual([
      {
        on: 'link',
        event: { ...base, status: 'awaiting_verification', verificationCode: '000001' },
      },
      { on: 'link', event: { ...base, status: 'awaiting_scan', qrPayload: 'fake-qr-2' } },
      { on: 'link', event: { ...base, status: 'completed' } },
      { on: 'connection', event: { userId: USER, state: 'connected' } },
    ]);

    await connector.startLink({ userId: OTHER_USER, linkSessionId: 'link-2' });
    await fake.completeLink('link-2');
    expect(fake.linkStatus('link-2')).toBe('completed');
  });

  it('saves the session before it reports completed, then reports the connection', async () => {
    const savedWhenReported: boolean[] = [];
    const context = setup({
      onLinkState: (event) => {
        if (event.status === 'completed') savedWhenReported.push(context.sessions.has(USER));
        context.reported.push({ on: 'link', event });
      },
    });
    const { fake, connector, reported, sessions } = context;
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.completeLink(LINK);

    expect(savedWhenReported).toEqual([true]);
    expect(sessions.get(USER)).toEqual({ fake: true, serial: 1 });
    expect(reported).toEqual([
      { on: 'link', event: { userId: USER, linkSessionId: LINK, status: 'completed' } },
      { on: 'connection', event: { userId: USER, state: 'connected' } },
    ]);
    expect(fake.linkStatus(LINK)).toBe('completed');
    expect(fake.connectionState(USER)).toBe('connected');
  });

  it('fails instead when the store refuses the session', async () => {
    const sessions = new MemorySessionStore();
    const { fake, connector, reported } = setup({
      sessions: {
        load: (userId) => sessions.load(userId),
        delete: (userId) => sessions.delete(userId),
        save: () => Promise.reject(new Error('store refused')),
      },
    });
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.completeLink(LINK);

    expect(reported).toEqual([
      {
        on: 'link',
        event: { userId: USER, linkSessionId: LINK, status: 'failed', reason: 'error' },
      },
    ]);
    expect(fake.linkStatus(LINK)).toBe('failed');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(sessions.has(USER)).toBe(false);
  });

  it('can fail, with the reason rejected unless another is given', async () => {
    const { fake, connector, reported, sessions } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.failLink(LINK);
    await connector.startLink({ userId: USER, linkSessionId: 'link-2' });
    await fake.failLink('link-2', 'error');

    expect(reported.map(({ event }) => event)).toEqual([
      { userId: USER, linkSessionId: LINK, status: 'failed', reason: 'rejected' },
      { userId: USER, linkSessionId: 'link-2', status: 'failed', reason: 'error' },
    ]);
    expect(fake.linkStatus(LINK)).toBe('failed');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(sessions.has(USER)).toBe(false);
  });

  it('can expire', async () => {
    const { fake, connector, reported } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.presentQrCode(LINK);
    reported.length = 0;
    await fake.expireLink(LINK);

    expect(reported).toEqual([
      { on: 'link', event: { userId: USER, linkSessionId: LINK, status: 'expired' } },
    ]);
    expect(fake.linkStatus(LINK)).toBe('expired');
    expect(fake.connectionState(USER)).toBeUndefined();
  });

  it('cannot be moved once it is over, or when it never started', async () => {
    const { fake, connector } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.expireLink(LINK);

    for (const attempt of [
      fake.presentQrCode(LINK),
      fake.presentVerificationCode(LINK),
      fake.completeLink(LINK),
      fake.failLink(LINK),
      fake.expireLink(LINK),
    ]) {
      const error = await rejection(attempt);
      expect(error).toBeInstanceOf(FakeConnectorUsageError);
      expect((error as Error).message).toBe('the link flow is already expired');
    }
    const unknown = await rejection(fake.completeLink('never-started'));
    expect(unknown).toBeInstanceOf(FakeConnectorUsageError);
  });

  it('is refused while the user has another flow that has not ended', async () => {
    const { fake, connector } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    expect(
      await connectorErrorCode(connector.startLink({ userId: USER, linkSessionId: 'link-2' })),
    ).toBe('link_in_progress');
    expect(fake.linkStatus('link-2')).toBeUndefined();

    // Another user is not affected, and the first user can start again once the flow ended.
    await connector.startLink({ userId: OTHER_USER, linkSessionId: 'link-3' });
    await fake.expireLink(LINK);
    await connector.startLink({ userId: USER, linkSessionId: 'link-4' });
    expect(fake.linkStatus('link-4')).toBe('pending');
  });

  it('is refused while the user has a live connection', async () => {
    const { fake, connector } = await linked();
    expect(
      await connectorErrorCode(connector.startLink({ userId: USER, linkSessionId: 'link-2' })),
    ).toBe('already_connected');
    await fake.dropConnection(USER);
    expect(
      await connectorErrorCode(connector.startLink({ userId: USER, linkSessionId: 'link-2' })),
    ).toBe('already_connected');
  });

  it('needs an identifier that was not used before', async () => {
    const { fake, connector } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.failLink(LINK);
    const error = await rejection(connector.startLink({ userId: USER, linkSessionId: LINK }));
    expect(error).toBeInstanceOf(FakeConnectorUsageError);
  });
});

describe('cancelLink', () => {
  it('ends the flow without a report', async () => {
    const { fake, connector, reported } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.presentQrCode(LINK);
    reported.length = 0;

    await connector.cancelLink(LINK);
    expect(fake.linkStatus(LINK)).toBe('cancelled');
    expect(reported).toEqual([]);
    expect(await rejection(fake.completeLink(LINK))).toBeInstanceOf(FakeConnectorUsageError);
  });

  it('leaves an unknown flow and a finished flow alone', async () => {
    const { fake, connector, reported, sessions } = await linked();
    await connector.cancelLink('never-started');
    await connector.cancelLink(LINK);

    expect(fake.linkStatus('never-started')).toBeUndefined();
    expect(fake.linkStatus(LINK)).toBe('completed');
    expect(fake.connectionState(USER)).toBe('connected');
    expect(sessions.has(USER)).toBe(true);
    expect(reported).toEqual([]);
  });

  it('wins over a completion that is still saving the session', async () => {
    const slow = slowStore();
    const { fake, connector, reported } = setup({ sessions: slow.store });
    await connector.startLink({ userId: USER, linkSessionId: LINK });

    const completing = fake.completeLink(LINK);
    await connector.cancelLink(LINK);
    slow.finishSave();
    await completing;

    expect(fake.linkStatus(LINK)).toBe('cancelled');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(slow.inner.has(USER)).toBe(false);
    expect(reported).toEqual([]);
  });

  it('wins over a completion whose save then fails', async () => {
    let fail: ((reason: Error) => void) | undefined;
    const { fake, connector, reported } = setup({
      sessions: {
        load: () => Promise.resolve(undefined),
        delete: () => Promise.reject(new Error('delete must not be called')),
        save: () =>
          new Promise<void>((_, reject) => {
            fail = reject;
          }),
      },
    });
    await connector.startLink({ userId: USER, linkSessionId: LINK });

    const completing = fake.completeLink(LINK);
    await connector.cancelLink(LINK);
    fail?.(new Error('store refused'));
    await completing;

    expect(fake.linkStatus(LINK)).toBe('cancelled');
    expect(reported).toEqual([]);
  });
});

describe('restore', () => {
  it('connects from the stored session', async () => {
    const { fake, connector, reported } = setup({}, { [USER]: { anything: 'stored' } });
    await connector.restore(USER);

    expect(reported).toEqual([{ on: 'connection', event: { userId: USER, state: 'connected' } }]);
    expect(fake.connectionState(USER)).toBe('connected');
  });

  it('is refused when nothing is stored', async () => {
    const { fake, connector, reported } = setup();
    expect(await connectorErrorCode(connector.restore(USER))).toBe('no_stored_session');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(reported).toEqual([]);
  });

  it('reports expired when the platform no longer accepts the session', async () => {
    const { fake, connector, reported, sessions } = setup({}, { [USER]: { anything: 'stored' } });
    await fake.invalidateSession(USER);
    expect(reported).toEqual([]);

    await connector.restore(USER);
    expect(reported).toEqual([{ on: 'connection', event: { userId: USER, state: 'expired' } }]);
    expect(fake.connectionState(USER)).toBeUndefined();
    // What happens to the stale session is up to the caller.
    expect(sessions.has(USER)).toBe(true);
  });

  it('is refused for a live connection and during a link flow', async () => {
    const { fake, connector } = await linked();
    expect(await connectorErrorCode(connector.restore(USER))).toBe('already_connected');

    await connector.startLink({ userId: OTHER_USER, linkSessionId: 'link-2' });
    expect(await connectorErrorCode(connector.restore(OTHER_USER))).toBe('link_in_progress');
    expect(fake.connectionState(OTHER_USER)).toBeUndefined();
  });
});

describe('restore while something else happens to the user', () => {
  /** A store with a session for USER whose first `load` settles when the test says so. */
  function slowLoad(): { store: SessionStore; inner: MemorySessionStore; finishLoad(): void } {
    const inner = new MemorySessionStore({ [USER]: { anything: 'stored' } });
    let release: (() => void) | undefined;
    const store: SessionStore = {
      save: (userId, state) => inner.save(userId, state),
      delete: (userId) => inner.delete(userId),
      async load(userId) {
        const state = await inner.load(userId);
        if (release === undefined) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return state;
      },
    };
    return {
      store,
      inner,
      finishLoad() {
        if (release === undefined) throw new Error('load was not called');
        release();
      },
    };
  }

  it('holds nothing when the user was disconnected meanwhile', async () => {
    const slow = slowLoad();
    const { fake, connector, reported } = setup({ sessions: slow.store });

    const restoring = connector.restore(USER);
    const settled = connectorErrorCode(restoring);
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: true });
    slow.finishLoad();

    expect(await settled).toBe('no_stored_session');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(slow.inner.has(USER)).toBe(false);
    expect(reported).toEqual([]);
  });

  it('is refused when a link flow started meanwhile', async () => {
    const slow = slowLoad();
    const { fake, connector, reported } = setup({ sessions: slow.store });

    const settled = connectorErrorCode(connector.restore(USER));
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    slow.finishLoad();

    expect(await settled).toBe('link_in_progress');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(reported).toEqual([]);
  });

  it('is refused when another restore connected the user meanwhile', async () => {
    const slow = slowLoad();
    const { fake, connector, reported } = setup({ sessions: slow.store });

    const first = connectorErrorCode(connector.restore(USER));
    await connector.restore(USER);
    slow.finishLoad();

    expect(await first).toBe('already_connected');
    expect(fake.connectionState(USER)).toBe('connected');
    expect(reported).toEqual([{ on: 'connection', event: { userId: USER, state: 'connected' } }]);
  });
});

describe('a connection', () => {
  it('goes down and comes back', async () => {
    const { fake, reported } = await linked();
    await fake.dropConnection(USER);
    expect(fake.connectionState(USER)).toBe('reconnecting');
    await fake.recoverConnection(USER);
    expect(fake.connectionState(USER)).toBe('connected');

    expect(reported).toEqual([
      { on: 'connection', event: { userId: USER, state: 'reconnecting' } },
      { on: 'connection', event: { userId: USER, state: 'connected' } },
    ]);
  });

  it('can only go down when connected and only come back when reconnecting', async () => {
    const { fake } = await linked();
    const up = await rejection(fake.recoverConnection(USER));
    expect(up).toBeInstanceOf(FakeConnectorUsageError);
    expect((up as Error).message).toBe(
      "the user's connection must be reconnecting, but it is connected",
    );

    await fake.dropConnection(USER);
    expect(await rejection(fake.dropConnection(USER))).toBeInstanceOf(FakeConnectorUsageError);

    const absent = await rejection(fake.dropConnection(OTHER_USER));
    expect((absent as Error).message).toBe(
      "the user's connection must be connected, but it is absent",
    );
  });

  it('expires when the session is invalidated, and can then be linked again', async () => {
    const { fake, connector, reported, sessions } = await linked();
    await fake.invalidateSession(USER);

    expect(reported).toEqual([{ on: 'connection', event: { userId: USER, state: 'expired' } }]);
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(sessions.has(USER)).toBe(true);
    expect(await rejection(fake.deliverMessage(USER))).toBeInstanceOf(FakeConnectorUsageError);

    await connector.startLink({ userId: USER, linkSessionId: 'link-2' });
    await fake.completeLink('link-2');
    expect(fake.connectionState(USER)).toBe('connected');
    // The new session is valid: a restore after a restart would connect, not expire.
    expect((await connector.disconnect(USER)).deviceLoggedOut).toBe(true);
  });

  it('expires from reconnecting as well', async () => {
    const { fake, reported } = await linked();
    await fake.dropConnection(USER);
    await fake.invalidateSession(USER);
    expect(reported.at(-1)).toEqual({
      on: 'connection',
      event: { userId: USER, state: 'expired' },
    });
  });

  it('saves a new session when the session is refreshed', async () => {
    const { fake, sessions } = await linked();
    const before = sessions.get(USER);
    await fake.refreshSession(USER);
    expect(sessions.get(USER)).not.toEqual(before);
    expect(sessions.get(USER)).toEqual({ fake: true, serial: 2 });
  });

  it('passes on a store that refuses the refreshed session', async () => {
    const context = setup();
    const { fake, connector } = context;
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await fake.completeLink(LINK);
    context.sessions.save = () => Promise.reject(new Error('not the owner'));

    const error = await rejection(fake.refreshSession(USER));
    expect((error as Error).message).toBe('not the owner');
    expect(fake.connectionState(USER)).toBe('connected');
  });

  it('has no session to refresh without a connection', async () => {
    const { fake } = setup();
    expect(await rejection(fake.refreshSession(USER))).toBeInstanceOf(FakeConnectorUsageError);
  });
});

describe('deliverMessage', () => {
  it('reports a text message with made-up values and returns the event', async () => {
    const { fake, reported } = await linked();
    const event = await fake.deliverMessage(USER);

    expect(event).toEqual({
      userId: USER,
      conversation: { externalId: 'fake-conversation', type: 'direct', name: 'Fake conversation' },
      message: {
        externalId: 'fake-message-2',
        sender: { externalId: 'fake-sender', name: 'Fake sender' },
        direction: 'incoming',
        sentAt: new Date('2026-01-01T00:00:02.000Z'),
        content: { type: 'text', text: 'fake message 2' },
      },
    });
    expect(reported).toEqual([{ on: 'message', event }]);
  });

  it('gives each message its own identifier and a later time', async () => {
    const { fake } = await linked();
    const first = await fake.deliverMessage(USER);
    const second = await fake.deliverMessage(USER);
    expect(second.message.externalId).not.toBe(first.message.externalId);
    expect(second.message.sentAt.getTime()).toBeGreaterThan(first.message.sentAt.getTime());
  });

  it('takes overrides for every part', async () => {
    const { fake } = await linked();
    const sentAt = new Date('2026-11-14T09:30:00.000Z');
    const event = await fake.deliverMessage(USER, {
      conversation: { externalId: 'group-7', type: 'group', name: '家族群組' },
      externalId: 'message-99',
      sender: { name: '媽媽' },
      direction: 'outgoing',
      sentAt,
      content: { type: 'text', text: '明天下午三點記得繳電費' },
    });

    expect(event.conversation).toEqual({ externalId: 'group-7', type: 'group', name: '家族群組' });
    expect(event.message).toEqual({
      externalId: 'message-99',
      sender: { externalId: 'fake-sender', name: '媽媽' },
      direction: 'outgoing',
      sentAt,
      content: { type: 'text', text: '明天下午三點記得繳電費' },
    });
  });

  it('reports a message that is not text with its type and nothing else', async () => {
    const { fake } = await linked();
    const event = await fake.deliverMessage(USER, {
      conversation: { type: 'official_account' },
      content: { type: 'image' },
    });
    expect(event.conversation.type).toBe('official_account');
    expect(event.message.content).toStrictEqual({ type: 'image' });
  });

  it('delivers a duplicate when asked to', async () => {
    const { fake, reported } = await linked();
    const first = await fake.deliverMessage(USER);
    await fake.deliverMessage(USER, {
      externalId: first.message.externalId,
      sentAt: first.message.sentAt,
      content: first.message.content,
    });
    expect(reported).toHaveLength(2);
    expect(reported[1]?.event).toEqual(first);
  });

  it('resolves only after the host has handled the message', async () => {
    const handled: string[] = [];
    const { fake } = await linked({
      onMessage: async (event) => {
        await Promise.resolve();
        await Promise.resolve();
        handled.push(event.message.externalId);
      },
    });
    const event = await fake.deliverMessage(USER);
    expect(handled).toEqual([event.message.externalId]);
  });

  it('rejects with the error of a host callback that fails', async () => {
    const { fake } = await linked({
      onMessage: () => Promise.reject(new Error('insert failed')),
    });
    const error = await rejection(fake.deliverMessage(USER));
    expect((error as Error).message).toBe('insert failed');
  });

  it('needs a connected connection, and never quotes the message in its refusal', async () => {
    const { fake, reported } = await linked();
    await fake.dropConnection(USER);
    reported.length = 0;

    const text = 'a body that must stay out of errors';
    const error = await rejection(fake.deliverMessage(USER, { content: { type: 'text', text } }));
    expect(error).toBeInstanceOf(FakeConnectorUsageError);
    expect((error as Error).message).not.toContain(text);
    expect(await rejection(fake.deliverMessage(OTHER_USER))).toBeInstanceOf(
      FakeConnectorUsageError,
    );
    expect(reported).toEqual([]);
  });
});

describe('disconnect', () => {
  it('ends a live connection, logs the device out and deletes the session', async () => {
    const { fake, connector, reported, sessions } = await linked();
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: true });

    expect(fake.connectionState(USER)).toBeUndefined();
    expect(sessions.has(USER)).toBe(false);
    expect(reported).toEqual([]);
    expect(await rejection(fake.deliverMessage(USER))).toBeInstanceOf(FakeConnectorUsageError);
    expect(await connectorErrorCode(connector.restore(USER))).toBe('no_stored_session');
  });

  it('works on a session that was never restored', async () => {
    const { connector, sessions } = setup({}, { [USER]: { anything: 'stored' } });
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: true });
    expect(sessions.has(USER)).toBe(false);
  });

  it('works when there is nothing, and says no device was logged out', async () => {
    const { connector } = setup();
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: false });
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: false });
  });

  it('deletes an invalidated session, which the platform cannot log out', async () => {
    const { fake, connector, sessions } = await linked();
    await fake.invalidateSession(USER);
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: false });
    expect(sessions.has(USER)).toBe(false);
  });

  it('deletes the session even when the platform does not confirm the logout', async () => {
    const { fake, connector, sessions } = await linked();
    fake.refuseLogout(USER);
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: false });
    expect(sessions.has(USER)).toBe(false);
    expect(fake.connectionState(USER)).toBeUndefined();

    // The refusal was for one disconnect only.
    await connector.startLink({ userId: USER, linkSessionId: 'link-2' });
    await fake.completeLink('link-2');
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: true });
  });

  it('ends a link flow of the user without a report', async () => {
    const { fake, connector, reported } = setup();
    await connector.startLink({ userId: USER, linkSessionId: LINK });
    await connector.startLink({ userId: OTHER_USER, linkSessionId: 'link-2' });
    await connector.disconnect(USER);

    expect(fake.linkStatus(LINK)).toBe('cancelled');
    expect(fake.linkStatus('link-2')).toBe('pending');
    expect(reported).toEqual([]);
  });

  it('rejects when the session cannot be deleted, and can be called again', async () => {
    const context = await linked();
    const { fake, connector, sessions } = context;
    const remove = sessions.delete.bind(sessions);
    sessions.delete = () => Promise.reject(new Error('database down'));

    const error = await rejection(connector.disconnect(USER));
    expect((error as Error).message).toBe('database down');
    expect(fake.connectionState(USER)).toBeUndefined();
    expect(sessions.has(USER)).toBe(true);

    sessions.delete = remove;
    expect(await connector.disconnect(USER)).toEqual({ deviceLoggedOut: true });
    expect(sessions.has(USER)).toBe(false);
  });
});
