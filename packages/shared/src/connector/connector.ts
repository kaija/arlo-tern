import type {
  ConnectionStateEvent,
  LinkStateEvent,
  MessageReceivedEvent,
  Platform,
} from './types.js';

// The connector interface: how the connector service talks to a messaging platform on
// behalf of users who linked their personal account (ADR-0001, design section 3.2).
//
// READ-ONLY BY CONSTRUCTION. `Connector` has no way to send a message, mark one as read,
// add a friend or change a setting, and it must never get one: a personal account is only
// ever read (ADR-0001). The interface is the place where that is reviewed, so its surface
// is pinned by a test. `testing/read-only-guard.ts` lists the members `Connector` may have;
// connector.test.ts fails when this file and that list disagree, and the list does not
// compile when it disagrees with `keyof Connector`. Read the comment in that file before
// changing anything below.
//
// The interface is platform independent: nothing in it is specific to LINE, and an
// implementation for another platform is created and used the same way.

/**
 * An implementation's own session state for one user: whatever it needs to bring the
 * connection back after a restart. Opaque to everyone else, and a credential: it is never
 * logged and never leaves the session store (ADR-0005).
 */
export type SessionState = Readonly<Record<string, unknown>>;

/**
 * Where an implementation keeps each user's session state. The connector process provides
 * it; an implementation has no other storage and writes no file (ADR-0001).
 *
 * A method may reject. That is how a store refuses a write (for example the ownership check
 * of ADR-0025, which this interface does not otherwise know about).
 */
export interface SessionStore {
  /** The stored state, or `undefined` when there is none. */
  load(userId: string): Promise<SessionState | undefined>;
  /** Replaces the stored state. An implementation calls it whenever its state changes. */
  save(userId: string, state: SessionState): Promise<void>;
  /** Removes the stored state. Removing nothing is not an error. */
  delete(userId: string): Promise<void>;
}

/**
 * What the connector process gives an implementation: the session store, and the three
 * callbacks through which the implementation reports what happens on the platform.
 *
 * A callback may return a promise. An implementation reports the events of one user one at
 * a time and in order: it waits for a callback to settle before it reports the next event
 * of that user. A callback handles its own failures; what an implementation does when one
 * rejects is not part of this contract.
 */
export interface ConnectorHost {
  readonly sessions: SessionStore;
  onLinkState(event: LinkStateEvent): void | Promise<void>;
  onMessage(event: MessageReceivedEvent): void | Promise<void>;
  onConnectionState(event: ConnectionStateEvent): void | Promise<void>;
}

export interface StartLinkRequest {
  readonly userId: string;
  /**
   * The identifier of the link flow, chosen by the caller (the `line_link_sessions` row is
   * created before the connector is told to start). Every `LinkStateEvent` of the flow
   * carries it.
   */
  readonly linkSessionId: string;
}

export interface DisconnectResult {
  /**
   * Whether the platform confirmed that the linked device was logged out. `false` when it
   * did not, and when there was no session to log out. The stored session is gone either
   * way.
   */
  readonly deviceLoggedOut: boolean;
}

export interface Connector {
  readonly platform: Platform;

  /**
   * Starts a link flow for a user. Resolves when the flow has started; its progress and its
   * outcome arrive through `ConnectorHost.onLinkState`.
   *
   * When the flow succeeds the implementation saves the session first, then reports
   * `completed`, and from then on holds the user's connection. If the session cannot be
   * saved the flow fails instead.
   *
   * Rejects with `ConnectorError`: `already_connected` when the user has a live connection,
   * `link_in_progress` when the user has a flow that has not ended.
   */
  startLink(request: StartLinkRequest): Promise<void>;

  /**
   * Ends a link flow that has not ended yet. Once it resolves nothing more is reported for
   * the flow. A flow that is unknown or already over is left alone; in particular a flow
   * that completed keeps its connection.
   */
  cancelLink(linkSessionId: string): Promise<void>;

  /**
   * Brings a user's connection back from the session in the store, without a new link flow.
   * Resolves when the implementation holds the connection; how it went arrives through
   * `ConnectorHost.onConnectionState`, as `connected`, `reconnecting` or, when the platform
   * no longer accepts the session, `expired`.
   *
   * Rejects with `ConnectorError`: `no_stored_session`, `already_connected`, or
   * `link_in_progress`.
   */
  restore(userId: string): Promise<void>;

  /**
   * Ends everything the implementation holds for a user: it stops the connection and any
   * link flow, logs the linked device out of the platform, and deletes the stored session.
   * Once it resolves the implementation holds nothing for the user and reports nothing more
   * for them.
   *
   * It works whatever the state: with a live connection, with only a stored session, or
   * with nothing at all. A logout that the platform does not confirm does not make it fail,
   * because the session must be deleted regardless; the result says which it was. It
   * rejects only when the stored session could not be deleted, and can then be called again.
   */
  disconnect(userId: string): Promise<DisconnectResult>;
}

/**
 * Creates a connector. The connector process is written against this type, so the
 * implementation is chosen where the process is assembled and nowhere else.
 */
export type ConnectorFactory = (host: ConnectorHost) => Connector;
