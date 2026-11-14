// The values and events a connector reports. Everything here is plain data that flows from
// the platform into the system; nothing flows the other way.
//
// The lists are runtime constants so that tests can compare them with the database schema
// and the API contract (see types.test.ts).

/** Platforms a connector can read personal conversations from. The MVP has LINE only. */
export const PLATFORMS = ['line'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * What kind of conversation a message belongs to (ADR-0003). The ingestion scope depends on
 * it, so an implementation must be able to tell the three apart for every message.
 */
export const CONVERSATION_TYPES = ['direct', 'group', 'official_account'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

/** `incoming` was sent by someone else, `outgoing` by the user from one of their own devices. */
export const MESSAGE_DIRECTIONS = ['incoming', 'outgoing'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_CONTENT_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'file',
  'sticker',
  'location',
  'other',
] as const;
export type MessageContentType = (typeof MESSAGE_CONTENT_TYPES)[number];
export type NonTextContentType = Exclude<MessageContentType, 'text'>;

/**
 * The content of a message. Only a text message has any: for every other type the event
 * says that such a message exists and nothing more (ADR-0001). There is deliberately no
 * field for a URL, a file name, a caption or a preview.
 */
export type MessageContent =
  { readonly type: 'text'; readonly text: string } | { readonly type: NonTextContentType };

export interface MessageConversation {
  /** The platform's identifier of the conversation; stable for the same user. */
  readonly externalId: string;
  readonly type: ConversationType;
  readonly name: string;
}

export interface MessageSender {
  /** The platform's identifier of the sender. */
  readonly externalId: string;
  readonly name: string;
}

export interface ReceivedMessage {
  /** The platform's identifier of the message; unique within its conversation. */
  readonly externalId: string;
  readonly sender: MessageSender;
  readonly direction: MessageDirection;
  /** When the platform says the message was sent. */
  readonly sentAt: Date;
  readonly content: MessageContent;
}

/**
 * A message arrived on a user's connection.
 *
 * - The same message may be reported more than once; the receiver deduplicates on the
 *   conversation's and the message's `externalId`.
 * - Nothing is promised about messages sent while the connection was down: whether the
 *   platform replays them is not known (SPK-01).
 * - Nothing is promised about end-to-end-encrypted messages either: which of them an
 *   implementation can read is not known (SPK-01). An implementation never invents text.
 *
 * `content.text` is a message body. It must not be logged or put in an error.
 */
export interface MessageReceivedEvent {
  /** The user whose connection received the message. */
  readonly userId: string;
  readonly conversation: MessageConversation;
  readonly message: ReceivedMessage;
}

/**
 * The state of a user's connection, as stored in `line_connections.status`:
 *
 * - `connected`: the connection is up and receives messages.
 * - `reconnecting`: the connection is down and the implementation is bringing it back.
 * - `expired`: the platform invalidated the session. This is final: the implementation has
 *   stopped and holds no connection for the user. Only a new link flow brings one back.
 *
 * There is no state for "not linked" or "disconnected": those are the absence of a
 * connection, and they follow from calls the caller made itself.
 */
export const CONNECTION_STATES = ['connected', 'reconnecting', 'expired'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface ConnectionStateEvent {
  readonly userId: string;
  readonly state: ConnectionState;
}

/**
 * The states of a link flow that an implementation reports. They are the generic states of
 * the API's `LineLinkSession`, minus `pending` and `cancelled`, which the caller sets
 * itself (before the first report, and after `cancelLink`).
 *
 * `awaiting_scan` and `awaiting_verification` may arrive in either order, more than once,
 * or not at all: the order in which LINE asks for the QR code and the verification code is
 * not verified (SPK-01), so no caller may assume one.
 */
export const LINK_STATES = [
  'awaiting_scan',
  'awaiting_verification',
  'completed',
  'failed',
  'expired',
] as const;
export type LinkStatus = (typeof LINK_STATES)[number];

/**
 * Why a link flow failed, as a code. The text shown to the user is written by the caller.
 *
 * - `rejected`: the platform, or the user on their phone, refused the login.
 * - `error`: anything else, including a session that could not be stored.
 */
export const LINK_FAILURE_REASONS = ['rejected', 'error'] as const;
export type LinkFailureReason = (typeof LINK_FAILURE_REASONS)[number];

/**
 * A link flow moved on. `completed`, `failed` and `expired` end the flow; nothing is
 * reported for it afterwards.
 *
 * `qrPayload` and `verificationCode` let someone attach a device to the user's account.
 * They must not be logged.
 */
export type LinkStateEvent = {
  readonly userId: string;
  /** The identifier the caller gave to `startLink`. */
  readonly linkSessionId: string;
} & (
  | { readonly status: 'awaiting_scan'; readonly qrPayload: string }
  | { readonly status: 'awaiting_verification'; readonly verificationCode: string }
  | { readonly status: 'completed' }
  | { readonly status: 'failed'; readonly reason: LinkFailureReason }
  | { readonly status: 'expired' }
);
