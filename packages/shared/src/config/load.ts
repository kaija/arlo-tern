import { z } from 'zod';

import type { ServiceName } from '../index.js';
import { ConfigError, type ConfigIssue } from './errors.js';
import type { Secret } from './secret.js';
import {
  connectorSettings,
  CORE_ONLY_CREDENTIAL_VARIABLES,
  coreSettings,
  VARIABLE_GROUPS,
} from './settings.js';

/** The shape of `process.env`. The loaders take it as a parameter and read nothing else. */
export type Environment = Readonly<Record<string, string | undefined>>;

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: Secret;
  readonly name: string;
}

/** Whichever trigger comes first closes the window (ADR-0007). */
export interface PipelineWindowConfig {
  readonly quietSeconds: number;
  readonly maxMessages: number;
  readonly maxWaitSeconds: number;
}

export interface ConnectorConfig {
  readonly database: DatabaseConfig;
  readonly pipelineWindow: PipelineWindowConfig;
}

/**
 * A property typed `| undefined` is either an undecided value of design §9.2 or the
 * credentials of a feature that is not built yet. Code that needs one must handle its
 * absence explicitly and must not substitute a literal.
 */
export interface CoreConfig {
  readonly database: DatabaseConfig;
  readonly pipelineWindow: PipelineWindowConfig;
  readonly tasks: {
    /** Task operations at or above this confidence are applied; the rest become proposals. */
    readonly confidenceThreshold: number;
    readonly maxRemindersPerTask: number;
  };
  /** Local times as `HH:mm` in the user's time zone. A start later than the end spans midnight. */
  readonly defaultQuietHours: { readonly start: string; readonly end: string };
  readonly bindingCodeTtlSeconds: number;
  /** In ascending order. */
  readonly messageRetentionOptionsDays: readonly number[];
  /** Undecided (DEC-06). Confidence at or above `highMin` is high, at or above `mediumMin` medium. */
  readonly scamConfidenceLevels:
    { readonly highMin: number; readonly mediumMin: number } | undefined;
  /** Undecided (DEC-04). */
  readonly memoryMaxEntries: number | undefined;
  readonly lineOfficialAccount: {
    readonly replyDeadlineSeconds: number;
    readonly credentials:
      { readonly channelSecret: Secret; readonly channelAccessToken: Secret } | undefined;
  };
  readonly whatsapp: {
    /** Undecided (DEC-05), including whether it counts messages or money. */
    readonly monthlyBudget: number | undefined;
    /** Undecided (DEC-05). */
    readonly dailyReplyLimitPerUser: number | undefined;
    /** Undecided (DEC-05), including its unit. */
    readonly longResultThreshold: number | undefined;
    readonly credentials: { readonly accessToken: Secret; readonly appSecret: Secret } | undefined;
  };
  readonly anthropic: { readonly apiKey: Secret } | undefined;
  /** The OAuth client IDs accepted as the audience of a Google ID token. */
  readonly googleSignIn: { readonly clientIds: readonly string[] } | undefined;
  readonly authTokens: { readonly signingKey: Secret } | undefined;
  readonly firebase:
    | { readonly projectId: string; readonly clientEmail: string; readonly privateKey: Secret }
    | undefined;
  readonly googleMaps: { readonly apiKey: Secret } | undefined;
}

type Check<Values> = (values: Values) => ConfigIssue[];

/**
 * Validates the variables that `settings` declares and returns them keyed by variable name.
 * A variable that is unset or set to the empty string counts as not set, so `VAR=` in an
 * env file and `${VAR:-}` in a compose file mean "use the default". Other variables in
 * `env` are ignored. Throws a ConfigError listing every problem found.
 */
function readEnvironment<Shape extends z.ZodRawShape>(
  service: ServiceName,
  settings: Shape,
  env: Environment,
  forbidden: readonly string[],
  checks: readonly Check<z.output<z.ZodObject<Shape>>>[],
): z.output<z.ZodObject<Shape>> {
  const isSet = (variable: string) => env[variable] !== undefined && env[variable] !== '';

  const issues: ConfigIssue[] = forbidden.filter(isSet).map((variable) => ({
    variable,
    message: `must not be given to the ${service} service`,
  }));

  const given = Object.fromEntries(
    Object.keys(settings)
      .filter(isSet)
      .map((variable) => [variable, env[variable]]),
  );
  const result = z.object(settings).safeParse(given);
  if (!result.success) {
    // Only the path and the message are taken from an issue. Every message is written in
    // fields.ts and contains no value. A value can break several rules of one variable;
    // the first is enough to fix it.
    const reported = new Set<string>();
    for (const issue of result.error.issues) {
      const variable = String(issue.path[0]);
      if (reported.has(variable)) continue;
      reported.add(variable);
      issues.push({ variable, message: issue.message });
    }
    throw new ConfigError(service, issues);
  }

  // Rules that span several variables run once each variable is valid on its own.
  issues.push(...checks.flatMap((check) => check(result.data)));
  if (issues.length > 0) throw new ConfigError(service, issues);
  return result.data;
}

function checkGroups(values: Readonly<Record<string, unknown>>): ConfigIssue[] {
  return VARIABLE_GROUPS.flatMap(([first, second]) => {
    const firstSet = values[first] !== undefined;
    const secondSet = values[second] !== undefined;
    if (firstSet === secondSet) return [];
    const [missing, present] = firstSet ? [second, first] : [first, second];
    return [{ variable: missing, message: `is required when ${present} is set` }];
  });
}

function checkPipelineWindow(values: {
  PIPELINE_WINDOW_QUIET_SECONDS: number;
  PIPELINE_WINDOW_MAX_WAIT_SECONDS: number;
}): ConfigIssue[] {
  if (values.PIPELINE_WINDOW_MAX_WAIT_SECONDS >= values.PIPELINE_WINDOW_QUIET_SECONDS) return [];
  return [
    {
      variable: 'PIPELINE_WINDOW_MAX_WAIT_SECONDS',
      message: 'must not be less than PIPELINE_WINDOW_QUIET_SECONDS',
    },
  ];
}

function checkQuietHours(values: {
  QUIET_HOURS_DEFAULT_START: string;
  QUIET_HOURS_DEFAULT_END: string;
}): ConfigIssue[] {
  if (values.QUIET_HOURS_DEFAULT_START !== values.QUIET_HOURS_DEFAULT_END) return [];
  return [
    { variable: 'QUIET_HOURS_DEFAULT_END', message: 'must differ from QUIET_HOURS_DEFAULT_START' },
  ];
}

function checkScamLevels(values: {
  SCAM_CONFIDENCE_HIGH_MIN?: number | undefined;
  SCAM_CONFIDENCE_MEDIUM_MIN?: number | undefined;
}): ConfigIssue[] {
  const { SCAM_CONFIDENCE_HIGH_MIN: high, SCAM_CONFIDENCE_MEDIUM_MIN: medium } = values;
  if (high === undefined || medium === undefined || medium < high) return [];
  return [
    {
      variable: 'SCAM_CONFIDENCE_MEDIUM_MIN',
      message: 'must be less than SCAM_CONFIDENCE_HIGH_MIN',
    },
  ];
}

function databaseConfig(values: {
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_USER: string;
  DATABASE_PASSWORD: Secret;
  DATABASE_NAME: string;
}): DatabaseConfig {
  return {
    host: values.DATABASE_HOST,
    port: values.DATABASE_PORT,
    user: values.DATABASE_USER,
    password: values.DATABASE_PASSWORD,
    name: values.DATABASE_NAME,
  };
}

function pipelineWindowConfig(values: {
  PIPELINE_WINDOW_QUIET_SECONDS: number;
  PIPELINE_WINDOW_MAX_MESSAGES: number;
  PIPELINE_WINDOW_MAX_WAIT_SECONDS: number;
}): PipelineWindowConfig {
  return {
    quietSeconds: values.PIPELINE_WINDOW_QUIET_SECONDS,
    maxMessages: values.PIPELINE_WINDOW_MAX_MESSAGES,
    maxWaitSeconds: values.PIPELINE_WINDOW_MAX_WAIT_SECONDS,
  };
}

/** Builds a group's object when every member is set, and `undefined` otherwise. */
function whenSet<A, B, Result>(
  first: A | undefined,
  second: B | undefined,
  build: (first: A, second: B) => Result,
): Result | undefined {
  return first === undefined || second === undefined ? undefined : build(first, second);
}

/**
 * Loads the connector's configuration from its environment, normally `process.env`.
 * The connector calls no LLM and sends no push, so it reads no core credential and
 * refuses to start when it is given one.
 */
export function loadConnectorConfig(env: Environment): ConnectorConfig {
  const values = readEnvironment(
    'connector',
    connectorSettings,
    env,
    CORE_ONLY_CREDENTIAL_VARIABLES,
    [checkPipelineWindow],
  );
  return {
    database: databaseConfig(values),
    pipelineWindow: pipelineWindowConfig(values),
  };
}

/** Loads the core service's configuration from its environment, normally `process.env`. */
export function loadCoreConfig(env: Environment): CoreConfig {
  const values = readEnvironment(
    'core',
    coreSettings,
    env,
    [],
    [checkGroups, checkPipelineWindow, checkQuietHours, checkScamLevels],
  );
  return {
    database: databaseConfig(values),
    pipelineWindow: pipelineWindowConfig(values),
    tasks: {
      confidenceThreshold: values.TASK_CONFIDENCE_THRESHOLD,
      maxRemindersPerTask: values.REMINDER_MAX_PER_TASK,
    },
    defaultQuietHours: {
      start: values.QUIET_HOURS_DEFAULT_START,
      end: values.QUIET_HOURS_DEFAULT_END,
    },
    bindingCodeTtlSeconds: values.BINDING_CODE_TTL_SECONDS,
    messageRetentionOptionsDays: values.MESSAGE_RETENTION_OPTIONS_DAYS,
    scamConfidenceLevels: whenSet(
      values.SCAM_CONFIDENCE_HIGH_MIN,
      values.SCAM_CONFIDENCE_MEDIUM_MIN,
      (highMin, mediumMin) => ({ highMin, mediumMin }),
    ),
    memoryMaxEntries: values.MEMORY_MAX_ENTRIES,
    lineOfficialAccount: {
      replyDeadlineSeconds: values.LINE_OA_REPLY_DEADLINE_SECONDS,
      credentials: whenSet(
        values.LINE_CHANNEL_SECRET,
        values.LINE_CHANNEL_ACCESS_TOKEN,
        (channelSecret, channelAccessToken) => ({ channelSecret, channelAccessToken }),
      ),
    },
    whatsapp: {
      monthlyBudget: values.WHATSAPP_MONTHLY_BUDGET,
      dailyReplyLimitPerUser: values.WHATSAPP_DAILY_REPLY_LIMIT_PER_USER,
      longResultThreshold: values.WHATSAPP_LONG_RESULT_THRESHOLD,
      credentials: whenSet(
        values.WHATSAPP_ACCESS_TOKEN,
        values.WHATSAPP_APP_SECRET,
        (accessToken, appSecret) => ({ accessToken, appSecret }),
      ),
    },
    anthropic: values.ANTHROPIC_API_KEY && { apiKey: values.ANTHROPIC_API_KEY },
    googleSignIn: values.GOOGLE_OAUTH_CLIENT_IDS && { clientIds: values.GOOGLE_OAUTH_CLIENT_IDS },
    authTokens: values.AUTH_TOKEN_SIGNING_KEY && { signingKey: values.AUTH_TOKEN_SIGNING_KEY },
    firebase: values.FIREBASE_SERVICE_ACCOUNT_JSON,
    googleMaps: values.GOOGLE_MAPS_API_KEY && { apiKey: values.GOOGLE_MAPS_API_KEY },
  };
}
