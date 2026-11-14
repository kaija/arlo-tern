// Configuration of the two backend services, exported as `@arlo-tern/shared/config`.
// Backend only: the mobile app must not import this path, and the package's root entry
// must not re-export it.
export { ConfigError, type ConfigIssue } from './errors.js';
export {
  loadConnectorConfig,
  loadCoreConfig,
  type ConnectorConfig,
  type CoreConfig,
  type DatabaseConfig,
  type Environment,
  type PipelineWindowConfig,
} from './load.js';
export { Secret } from './secret.js';
export { CONNECTOR_VARIABLES, CORE_ONLY_CREDENTIAL_VARIABLES, CORE_VARIABLES } from './settings.js';
