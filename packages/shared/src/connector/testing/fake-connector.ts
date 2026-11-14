import type { Connector, ConnectorFactory, ConnectorHost, SessionState } from '../connector.js';
import { ConnectorError } from '../errors.js';
import type {
  ConnectionState,
  LinkFailureReason,
  LinkStatus,
  MessageContent,
  MessageConversation,
  MessageDirection,
  MessageReceivedEvent,
  MessageSender,
  Platform,
} from '../types.js';

// A connector with no platform behind it. A test plays the platform and the user's phone:
// it drives link flows, changes connection states and delivers messages by calling the
// controls below, and the fake reports them to the `ConnectorHost` exactly as a real
// implementation would.
//
// The code under test receives only `create`, the `ConnectorFactory`, and so only ever sees
// a `Connector`. The controls stay with the test.
//
// It is deterministic: no network, no timers, no clock and no randomness. Identifiers and
// times it makes up come from a counter.
//
// WHAT IS THE CONTRACT AND WHAT IS ONLY THE FAKE. The fake keeps the promises of
// connector.ts, with one exception: it does not put the events of a user in a queue. A
// test that awaits each control gets them one at a time and in order; a test that starts
// two controls for the same user without awaiting the first has both callbacks running at
// once. The fake also behaves in ways a real implementation may not, which are
// conveniences for tests and must not be relied on as facts about LINE:
//
// - A control resolves only after the host's callbacks for it have settled, so a test can
//   assert on the result straight away, without waiting or polling.
// - A callback that throws or rejects makes the control reject with the same error.
// - `completeLink` reports `connected` immediately after `completed`.
// - `restore` reports `connected` or `expired` before it resolves.
// - Link states can be driven in any order and any number of times, because the real order
//   is not known (SPK-01). The fake enforces none.

/** A control was used in a way that makes no sense; a mistake in the test, not a result. */
export class FakeConnectorUsageError extends Error {
  override readonly name = 'FakeConnectorUsageError';
}

/** `pending` before the first report, `cancelled` after `cancelLink` or `disconnect`. */
export type FakeLinkStatus = 'pending' | LinkStatus | 'cancelled';

/** Overrides for a delivered message; whatever is left out gets a made-up value. */
export interface FakeMessageInput {
  readonly conversation?: Partial<MessageConversation>;
  /** Give the identifier of an earlier message to deliver a duplicate. */
  readonly externalId?: string;
  readonly sender?: Partial<MessageSender>;
  readonly direction?: MessageDirection;
  readonly sentAt?: Date;
  readonly content?: MessageContent;
}

export interface FakeConnectorOptions {
  readonly platform?: Platform;
}

export interface FakeConnector {
  /** Hand this to the code under test. It can be called once: one fake is one connector. */
  readonly create: ConnectorFactory;

  // --- Link flows, by the `linkSessionId` given to `startLink` ---

  /** Reports `awaiting_scan`. */
  presentQrCode(linkSessionId: string, qrPayload?: string): Promise<void>;
  /** Reports `awaiting_verification`. */
  presentVerificationCode(linkSessionId: string, verificationCode?: string): Promise<void>;
  /**
   * The user finished on their phone: saves a session, reports `completed`, then reports
   * the connection as `connected`. When the store refuses the session it reports `failed`
   * with the reason `error` instead.
   */
  completeLink(linkSessionId: string): Promise<void>;
  /** Reports `failed`; the reason defaults to `rejected`. */
  failLink(linkSessionId: string, reason?: LinkFailureReason): Promise<void>;
  /** The platform gave up waiting: reports `expired`. */
  expireLink(linkSessionId: string): Promise<void>;

  // --- Connections, by user ---

  /** A `connected` connection goes down: reports `reconnecting`. */
  dropConnection(userId: string): Promise<void>;
  /** A `reconnecting` connection comes back: reports `connected`. */
  recoverConnection(userId: string): Promise<void>;
  /**
   * The platform logs the linked device out. A live connection ends and reports `expired`.
   * Without one nothing is reported, and the next `restore` of the user reports `expired`.
   */
  invalidateSession(userId: string): Promise<void>;
  /** The session of a live connection changes: saves a new state to the store. */
  refreshSession(userId: string): Promise<void>;
  /** The platform will not confirm the logout of the user's next `disconnect`. */
  refuseLogout(userId: string): void;
  /**
   * A message arrives on a `connected` connection. Returns the event that was reported, so
   * the test knows the identifiers that were made up.
   */
  deliverMessage(userId: string, message?: FakeMessageInput): Promise<MessageReceivedEvent>;

  // --- What the fake currently holds ---

  linkStatus(linkSessionId: string): FakeLinkStatus | undefined;
  /** The state of the user's live connection; `undefined` when the fake holds none. */
  connectionState(userId: string): Exclude<ConnectionState, 'expired'> | undefined;
}

interface Link {
  readonly userId: string;
  status: FakeLinkStatus;
}

const OPEN: ReadonlySet<FakeLinkStatus> = new Set([
  'pending',
  'awaiting_scan',
  'awaiting_verification',
]);

/** Made-up send times count seconds from here. */
const FIRST_SENT_AT = Date.UTC(2026, 0, 1);

export function createFakeConnector(options: FakeConnectorOptions = {}): FakeConnector {
  const platform = options.platform ?? 'line';
  const links = new Map<string, Link>();
  const connections = new Map<string, Exclude<ConnectionState, 'expired'>>();
  /** Users whose session the platform no longer accepts. */
  const invalidated = new Set<string>();
  /** How many times each user was disconnected, so a call that was waiting can tell. */
  const disconnects = new Map<string, number>();
  const logoutRefused = new Set<string>();
  let attached: ConnectorHost | undefined;
  let counter = 0;

  /** Every control starts here, so using the fake before `create` says so plainly. */
  function host(): ConnectorHost {
    if (attached === undefined) {
      throw new FakeConnectorUsageError('create() has not been called yet');
    }
    return attached;
  }

  function newSession(): SessionState {
    counter += 1;
    return { fake: true, serial: counter };
  }

  function openLinkOf(userId: string): Link | undefined {
    for (const link of links.values()) {
      if (link.userId === userId && OPEN.has(link.status)) return link;
    }
    return undefined;
  }

  /** The flow a control is about to move; it must exist and must not be over. */
  function openLink(linkSessionId: string): Link {
    const link = links.get(linkSessionId);
    if (link === undefined) {
      throw new FakeConnectorUsageError('no link flow was started with this identifier');
    }
    if (!OPEN.has(link.status)) {
      throw new FakeConnectorUsageError(`the link flow is already ${link.status}`);
    }
    return link;
  }

  function requireConnection(userId: string, required: Exclude<ConnectionState, 'expired'>): void {
    const state = connections.get(userId);
    if (state !== required) {
      throw new FakeConnectorUsageError(
        `the user's connection must be ${required}, but it is ${state ?? 'absent'}`,
      );
    }
  }

  function refuseIfBusy(userId: string): void {
    if (connections.has(userId)) throw new ConnectorError('already_connected');
    if (openLinkOf(userId) !== undefined) throw new ConnectorError('link_in_progress');
  }

  // An object literal with exactly the members of `Connector`: nothing else is reachable
  // from the code under test (see read-only-guard.ts).
  const connector: Connector = {
    platform,

    // eslint-disable-next-line @typescript-eslint/require-await -- refusals must reject, not throw
    async startLink({ userId, linkSessionId }) {
      refuseIfBusy(userId);
      if (links.has(linkSessionId)) {
        throw new FakeConnectorUsageError('a link flow was already started with this identifier');
      }
      links.set(linkSessionId, { userId, status: 'pending' });
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- same shape as the others
    async cancelLink(linkSessionId) {
      const link = links.get(linkSessionId);
      if (link !== undefined && OPEN.has(link.status)) link.status = 'cancelled';
    },

    async restore(userId) {
      const target = host();
      refuseIfBusy(userId);
      const disconnectsBefore = disconnects.get(userId);
      const session = await target.sessions.load(userId);
      // Whatever happened while the store was read counts: a disconnect means the session
      // just read is gone, and a connection or link flow that appeared is refused as usual.
      if (session === undefined || disconnects.get(userId) !== disconnectsBefore) {
        throw new ConnectorError('no_stored_session');
      }
      refuseIfBusy(userId);
      if (invalidated.has(userId)) {
        await target.onConnectionState({ userId, state: 'expired' });
        return;
      }
      connections.set(userId, 'connected');
      await target.onConnectionState({ userId, state: 'connected' });
    },

    async disconnect(userId) {
      const target = host();
      disconnects.set(userId, (disconnects.get(userId) ?? 0) + 1);
      const link = openLinkOf(userId);
      if (link !== undefined) link.status = 'cancelled';
      const wasLive = connections.delete(userId);
      const hadSession = wasLive || (await target.sessions.load(userId)) !== undefined;
      const deviceLoggedOut = hadSession && !invalidated.has(userId) && !logoutRefused.has(userId);
      await target.sessions.delete(userId);
      invalidated.delete(userId);
      logoutRefused.delete(userId);
      return { deviceLoggedOut };
    },
  };

  return {
    create(newHost) {
      if (attached !== undefined) {
        throw new FakeConnectorUsageError('create() was already called; make another fake');
      }
      attached = newHost;
      return connector;
    },

    async presentQrCode(linkSessionId, qrPayload) {
      const target = host();
      const link = openLink(linkSessionId);
      link.status = 'awaiting_scan';
      counter += 1;
      await target.onLinkState({
        userId: link.userId,
        linkSessionId,
        status: 'awaiting_scan',
        qrPayload: qrPayload ?? `fake-qr-${counter}`,
      });
    },

    async presentVerificationCode(linkSessionId, verificationCode) {
      const target = host();
      const link = openLink(linkSessionId);
      link.status = 'awaiting_verification';
      counter += 1;
      await target.onLinkState({
        userId: link.userId,
        linkSessionId,
        status: 'awaiting_verification',
        verificationCode: verificationCode ?? String(counter).padStart(6, '0'),
      });
    },

    async completeLink(linkSessionId) {
      const target = host();
      const link = openLink(linkSessionId);
      const { userId } = link;
      let saved = true;
      try {
        await target.sessions.save(userId, newSession());
      } catch {
        saved = false;
      }
      if (!OPEN.has(link.status)) {
        // The flow ended while the session was being saved (it was cancelled): it reports
        // nothing more and must leave nothing behind.
        if (saved) await target.sessions.delete(userId);
        return;
      }
      if (!saved) {
        link.status = 'failed';
        await target.onLinkState({ userId, linkSessionId, status: 'failed', reason: 'error' });
        return;
      }
      link.status = 'completed';
      connections.set(userId, 'connected');
      invalidated.delete(userId);
      await target.onLinkState({ userId, linkSessionId, status: 'completed' });
      await target.onConnectionState({ userId, state: 'connected' });
    },

    async failLink(linkSessionId, reason = 'rejected') {
      const target = host();
      const link = openLink(linkSessionId);
      link.status = 'failed';
      await target.onLinkState({ userId: link.userId, linkSessionId, status: 'failed', reason });
    },

    async expireLink(linkSessionId) {
      const target = host();
      const link = openLink(linkSessionId);
      link.status = 'expired';
      await target.onLinkState({ userId: link.userId, linkSessionId, status: 'expired' });
    },

    async dropConnection(userId) {
      const target = host();
      requireConnection(userId, 'connected');
      connections.set(userId, 'reconnecting');
      await target.onConnectionState({ userId, state: 'reconnecting' });
    },

    async recoverConnection(userId) {
      const target = host();
      requireConnection(userId, 'reconnecting');
      connections.set(userId, 'connected');
      await target.onConnectionState({ userId, state: 'connected' });
    },

    async invalidateSession(userId) {
      const target = host();
      invalidated.add(userId);
      if (connections.delete(userId)) {
        await target.onConnectionState({ userId, state: 'expired' });
      }
    },

    async refreshSession(userId) {
      const target = host();
      if (!connections.has(userId)) {
        throw new FakeConnectorUsageError('the user has no live connection');
      }
      await target.sessions.save(userId, newSession());
    },

    refuseLogout(userId) {
      logoutRefused.add(userId);
    },

    async deliverMessage(userId, message = {}) {
      const target = host();
      requireConnection(userId, 'connected');
      counter += 1;
      const event: MessageReceivedEvent = {
        userId,
        conversation: {
          externalId: 'fake-conversation',
          type: 'direct',
          name: 'Fake conversation',
          ...message.conversation,
        },
        message: {
          externalId: message.externalId ?? `fake-message-${counter}`,
          sender: { externalId: 'fake-sender', name: 'Fake sender', ...message.sender },
          direction: message.direction ?? 'incoming',
          sentAt: message.sentAt ?? new Date(FIRST_SENT_AT + counter * 1000),
          content: message.content ?? { type: 'text', text: `fake message ${counter}` },
        },
      };
      await target.onMessage(event);
      return event;
    },

    linkStatus(linkSessionId) {
      return links.get(linkSessionId)?.status;
    },

    connectionState(userId) {
      return connections.get(userId);
    },
  };
}
