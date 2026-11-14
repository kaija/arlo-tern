/**
 * Why a connector refused a call:
 *
 * - `already_connected`: the user has a live connection. A user never has two; the caller
 *   disconnects first.
 * - `link_in_progress`: the user has a link flow that has not ended.
 * - `no_stored_session`: the session store holds nothing for the user, so there is nothing
 *   to restore.
 */
export const CONNECTOR_ERROR_CODES = [
  'already_connected',
  'link_in_progress',
  'no_stored_session',
] as const;
export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[number];

const MESSAGES: Record<ConnectorErrorCode, string> = {
  already_connected: 'the user already has a live connection',
  link_in_progress: 'the user has a link flow in progress',
  no_stored_session: 'no stored session to restore',
};

/**
 * A connector refused a call. The message is fixed text chosen by `code`: it never holds an
 * identifier, a session, a QR payload, a verification code or message content, so it is
 * safe to log.
 */
export class ConnectorError extends Error {
  override readonly name = 'ConnectorError';
  readonly code: ConnectorErrorCode;

  constructor(code: ConnectorErrorCode) {
    super(MESSAGES[code]);
    this.code = code;
  }
}
