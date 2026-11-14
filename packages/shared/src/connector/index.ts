// The connector interface, exported as `@arlo-tern/shared/connector`: what the connector
// service needs from a messaging platform, and nothing that could act on a user's account.
// Backend only, like `@arlo-tern/shared/config`: the mobile app must not import this path,
// and the package's root entry must not re-export it.
//
// The fake implementation and the read-only guard are test support and live behind
// `@arlo-tern/shared/connector/testing`.
export type {
  Connector,
  ConnectorFactory,
  ConnectorHost,
  DisconnectResult,
  SessionState,
  SessionStore,
  StartLinkRequest,
} from './connector.js';
export { CONNECTOR_ERROR_CODES, ConnectorError, type ConnectorErrorCode } from './errors.js';
export {
  CONNECTION_STATES,
  CONVERSATION_TYPES,
  LINK_FAILURE_REASONS,
  LINK_STATES,
  MESSAGE_CONTENT_TYPES,
  MESSAGE_DIRECTIONS,
  PLATFORMS,
  type ConnectionState,
  type ConnectionStateEvent,
  type ConversationType,
  type LinkFailureReason,
  type LinkStateEvent,
  type LinkStatus,
  type MessageContent,
  type MessageContentType,
  type MessageConversation,
  type MessageDirection,
  type MessageReceivedEvent,
  type MessageSender,
  type NonTextContentType,
  type Platform,
  type ReceivedMessage,
} from './types.js';
