// Test support for the connector interface, exported as
// `@arlo-tern/shared/connector/testing`: the fake implementation, an in-memory session
// store, and the read-only guard that every implementation's tests call.
//
// Source only. The export has no built form, so tests of any package can import it and a
// built service cannot.
export {
  createFakeConnector,
  FakeConnectorUsageError,
  type FakeConnector,
  type FakeConnectorOptions,
  type FakeLinkStatus,
  type FakeMessageInput,
} from './fake-connector.js';
export { MemorySessionStore } from './memory-session-store.js';
export {
  assertReadOnlyConnector,
  CONNECTOR_SURFACE,
  findForbiddenCallables,
  FORBIDDEN_VERBS,
  inspectConnectorDeclaration,
  inspectConnectorInstance,
  isForbiddenName,
} from './read-only-guard.js';
