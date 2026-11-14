import {
  decimal,
  integer,
  integerList,
  localTime,
  positiveDecimal,
  secret,
  serviceAccountJson,
  text,
  textList,
} from './fields.js';

// The one definition of every setting: the environment variable that carries it, how its
// value is validated, and its default. The defaults are the initial values of design §9.2;
// this file is the only place in the code where those numbers may appear.
//
// To add a setting, see "Configuration" in CLAUDE.md.

const ONE_DAY_IN_SECONDS = 86_400;

/** A duration in seconds. The upper bound catches a value given in milliseconds. */
function seconds() {
  return integer({ min: 1, max: ONE_DAY_IN_SECONDS });
}

/** PostgreSQL connection. Both services need it. */
export const databaseSettings = {
  DATABASE_HOST: text(),
  DATABASE_PORT: integer({ min: 1, max: 65_535 }).default(5432),
  DATABASE_USER: text(),
  DATABASE_PASSWORD: secret(),
  DATABASE_NAME: text(),
};

/**
 * The three triggers of a conversation window (ADR-0007). Both services need them: the
 * connector schedules and delays the window job, the core worker processes it.
 */
export const pipelineWindowSettings = {
  PIPELINE_WINDOW_QUIET_SECONDS: seconds().default(45),
  PIPELINE_WINDOW_MAX_MESSAGES: integer({ min: 1, max: 1000 }).default(30),
  PIPELINE_WINDOW_MAX_WAIT_SECONDS: seconds().default(180),
};

/** Thresholds and time constants that only the core service uses. */
export const coreBehaviourSettings = {
  TASK_CONFIDENCE_THRESHOLD: decimal({ min: 0, max: 1 }).default(0.8),
  REMINDER_MAX_PER_TASK: integer({ min: 1, max: 100 }).default(3),
  QUIET_HOURS_DEFAULT_START: localTime().default('22:00'),
  QUIET_HOURS_DEFAULT_END: localTime().default('08:00'),
  LINE_OA_REPLY_DEADLINE_SECONDS: seconds().default(50),
  BINDING_CODE_TTL_SECONDS: seconds().default(600),
  MESSAGE_RETENTION_OPTIONS_DAYS: integerList({ min: 1, max: 3650 }).default([7, 30, 90]),
};

/**
 * Settings whose value design §9.2 lists as undecided. They have no default on purpose:
 * unset, they load as `undefined`, never as a number. Do not add a default here; the value
 * is the project owner's decision (DEC-04, DEC-05, DEC-06).
 */
export const undecidedSettings = {
  SCAM_CONFIDENCE_HIGH_MIN: decimal({ min: 0, max: 1 }).optional(),
  SCAM_CONFIDENCE_MEDIUM_MIN: decimal({ min: 0, max: 1 }).optional(),
  // DEC-05 has not decided whether the budget counts messages or money, nor the unit of
  // the long-result threshold. Both names are provisional and deliberately carry no unit.
  WHATSAPP_MONTHLY_BUDGET: positiveDecimal().optional(),
  WHATSAPP_DAILY_REPLY_LIMIT_PER_USER: integer({ min: 1, max: 1_000_000 }).optional(),
  WHATSAPP_LONG_RESULT_THRESHOLD: integer({ min: 1, max: 1_000_000 }).optional(),
  MEMORY_MAX_ENTRIES: integer({ min: 1, max: 1_000_000 }).optional(),
};

/**
 * Credentials for features of the core service that are not built yet. Each is optional
 * until the work item that builds the feature makes it required. The connector must never
 * be given any of them.
 */
export const coreCredentialSettings = {
  ANTHROPIC_API_KEY: secret().optional(),
  GOOGLE_OAUTH_CLIENT_IDS: textList().optional(),
  AUTH_TOKEN_SIGNING_KEY: secret({ minLength: 32 }).optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson().optional(),
  GOOGLE_MAPS_API_KEY: secret().optional(),
  LINE_CHANNEL_SECRET: secret().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: secret().optional(),
  WHATSAPP_ACCESS_TOKEN: secret().optional(),
  WHATSAPP_APP_SECRET: secret().optional(),
};

/**
 * Variables that only make sense together. Setting some of a group but not all of it is a
 * start-up error.
 */
export const VARIABLE_GROUPS: readonly (readonly [string, string])[] = [
  ['SCAM_CONFIDENCE_HIGH_MIN', 'SCAM_CONFIDENCE_MEDIUM_MIN'],
  ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'],
  ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET'],
];

export const connectorSettings = {
  ...databaseSettings,
  ...pipelineWindowSettings,
};

export const coreSettings = {
  ...databaseSettings,
  ...pipelineWindowSettings,
  ...coreBehaviourSettings,
  ...undecidedSettings,
  ...coreCredentialSettings,
};

/** Every environment variable the connector reads. */
export const CONNECTOR_VARIABLES: readonly string[] = Object.keys(connectorSettings);

/** Every environment variable the core service reads. */
export const CORE_VARIABLES: readonly string[] = Object.keys(coreSettings);

/** Core-only credentials. The connector refuses to start when it is given one. */
export const CORE_ONLY_CREDENTIAL_VARIABLES: readonly string[] =
  Object.keys(coreCredentialSettings);
