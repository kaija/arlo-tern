import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { ConfigError, type ConfigIssue } from './errors.js';
import {
  loadConnectorConfig,
  loadCoreConfig,
  loadDatabaseConfig,
  type Environment,
} from './load.js';
import { CORE_ONLY_CREDENTIAL_VARIABLES } from './settings.js';

const database = {
  DATABASE_HOST: 'postgres',
  DATABASE_USER: 'arlo',
  DATABASE_PASSWORD: 'test-database-password',
  DATABASE_NAME: 'arlo',
};

const serviceAccountJson = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  client_email: 'push@test-project.example',
  private_key: 'test-private-key',
});

/** Every credential the core service reads, set to a valid test value. */
const credentials = {
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id, android-client-id',
  AUTH_TOKEN_SIGNING_KEY: 'test-signing-key-0123456789-abcdef',
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson,
  GOOGLE_MAPS_API_KEY: 'test-maps-key',
  LINE_CHANNEL_SECRET: 'test-line-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'test-line-token',
  WHATSAPP_ACCESS_TOKEN: 'test-whatsapp-token',
  WHATSAPP_APP_SECRET: 'test-whatsapp-secret',
};

function failure(load: () => unknown): ConfigError {
  try {
    load();
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected the configuration to be rejected');
}

function coreIssues(env: Environment): readonly ConfigIssue[] {
  return failure(() => loadCoreConfig(env)).issues;
}

describe('loadDatabaseConfig', () => {
  it('reads the database connection with the default port', () => {
    const config = loadDatabaseConfig(database);
    expect(config).toMatchObject({ host: 'postgres', port: 5432, user: 'arlo', name: 'arlo' });
    expect(config.password.reveal()).toBe('test-database-password');
  });

  it('takes the port from the environment', () => {
    expect(loadDatabaseConfig({ ...database, DATABASE_PORT: '6543' }).port).toBe(6543);
  });

  it('needs no other setting and ignores the ones it is given', () => {
    const config = loadDatabaseConfig({
      ...database,
      ...credentials,
      TASK_CONFIDENCE_THRESHOLD: 'not-a-number',
    });
    expect(Object.keys(config)).toEqual(['host', 'port', 'user', 'password', 'name']);
  });

  it('names every missing variable as a problem of the migration command', () => {
    const error = failure(() => loadDatabaseConfig({ DATABASE_PORT: 'abc' }));
    expect(error.service).toBe('migrate');
    expect(error.issues.map((issue) => issue.variable).toSorted()).toEqual([
      'DATABASE_HOST',
      'DATABASE_NAME',
      'DATABASE_PASSWORD',
      'DATABASE_PORT',
      'DATABASE_USER',
    ]);
  });
});

describe('loadConnectorConfig', () => {
  it('applies the defaults of design §9.2', () => {
    expect(loadConnectorConfig(database)).toMatchObject({
      database: { host: 'postgres', port: 5432, user: 'arlo', name: 'arlo' },
      pipelineWindow: { quietSeconds: 45, maxMessages: 30, maxWaitSeconds: 180 },
    });
  });

  it('reads the database password as a secret', () => {
    const config = loadConnectorConfig(database);
    expect(config.database.password.reveal()).toBe('test-database-password');
    expect(JSON.stringify(config)).not.toContain('test-database-password');
  });

  it('takes overrides from the environment', () => {
    const config = loadConnectorConfig({
      ...database,
      DATABASE_PORT: '6543',
      PIPELINE_WINDOW_QUIET_SECONDS: '10',
      PIPELINE_WINDOW_MAX_MESSAGES: '5',
      PIPELINE_WINDOW_MAX_WAIT_SECONDS: '60',
    });
    expect(config.database.port).toBe(6543);
    expect(config.pipelineWindow).toEqual({ quietSeconds: 10, maxMessages: 5, maxWaitSeconds: 60 });
  });

  it('reads only its own variables', () => {
    const config = loadConnectorConfig({
      ...database,
      PATH: '/usr/bin',
      TASK_CONFIDENCE_THRESHOLD: 'not-a-number',
    });
    expect(Object.keys(config)).toEqual(['database', 'pipelineWindow']);
  });

  it('names every required variable that is missing', () => {
    const error = failure(() => loadConnectorConfig({}));
    expect(error.service).toBe('connector');
    expect(error.issues).toEqual(
      ['DATABASE_HOST', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME'].map((variable) => ({
        variable,
        message: 'is required but not set',
      })),
    );
    expect(error.message).toContain('Invalid configuration for connector:');
    expect(error.message).toContain('DATABASE_PASSWORD is required but not set');
  });

  it.each(CORE_ONLY_CREDENTIAL_VARIABLES)('refuses to start when it is given %s', (variable) => {
    const value = 'sentinel-core-credential';
    const error = failure(() => loadConnectorConfig({ ...database, [variable]: value }));
    expect(error.issues).toEqual([
      { variable, message: 'must not be given to the connector service' },
    ]);
    expect(error.message).not.toContain(value);
  });

  it('accepts a core credential variable that is empty', () => {
    expect(() => loadConnectorConfig({ ...database, ANTHROPIC_API_KEY: '' })).not.toThrow();
  });

  it('reports a forbidden credential together with an invalid value', () => {
    const error = failure(() =>
      loadConnectorConfig({ ...database, GOOGLE_MAPS_API_KEY: 'key', DATABASE_PORT: '0' }),
    );
    expect(error.issues.map((issue) => issue.variable)).toEqual([
      'GOOGLE_MAPS_API_KEY',
      'DATABASE_PORT',
    ]);
  });

  it('rejects a maximum wait shorter than the quiet time', () => {
    const error = failure(() =>
      loadConnectorConfig({
        ...database,
        PIPELINE_WINDOW_QUIET_SECONDS: '120',
        PIPELINE_WINDOW_MAX_WAIT_SECONDS: '60',
      }),
    );
    expect(error.issues).toEqual([
      {
        variable: 'PIPELINE_WINDOW_MAX_WAIT_SECONDS',
        message: 'must not be less than PIPELINE_WINDOW_QUIET_SECONDS',
      },
    ]);
  });
});

describe('loadCoreConfig', () => {
  it('applies the defaults of design §9.2', () => {
    expect(loadCoreConfig(database)).toMatchObject({
      database: { host: 'postgres', port: 5432, user: 'arlo', name: 'arlo' },
      pipelineWindow: { quietSeconds: 45, maxMessages: 30, maxWaitSeconds: 180 },
      tasks: { confidenceThreshold: 0.8, maxRemindersPerTask: 3 },
      defaultQuietHours: { start: '22:00', end: '08:00' },
      bindingCodeTtlSeconds: 600,
      messageRetentionOptionsDays: [7, 30, 90],
      lineOfficialAccount: { replyDeadlineSeconds: 50 },
    });
  });

  it('gives the undecided values of design §9.2 no default', () => {
    const config = loadCoreConfig(database);
    expect(config.scamConfidenceLevels).toBeUndefined();
    expect(config.memoryMaxEntries).toBeUndefined();
    expect(config.whatsapp).toEqual({
      monthlyBudget: undefined,
      dailyReplyLimitPerUser: undefined,
      longResultThreshold: undefined,
      credentials: undefined,
    });
  });

  it('leaves every credential unset until it is provided', () => {
    const config = loadCoreConfig(database);
    expect(config.anthropic).toBeUndefined();
    expect(config.googleSignIn).toBeUndefined();
    expect(config.authTokens).toBeUndefined();
    expect(config.firebase).toBeUndefined();
    expect(config.googleMaps).toBeUndefined();
    expect(config.lineOfficialAccount.credentials).toBeUndefined();
  });

  it('treats an empty string as not set, never as zero', () => {
    const config = loadCoreConfig({
      ...database,
      PIPELINE_WINDOW_QUIET_SECONDS: '',
      TASK_CONFIDENCE_THRESHOLD: '',
      SCAM_CONFIDENCE_HIGH_MIN: '',
      SCAM_CONFIDENCE_MEDIUM_MIN: '',
      WHATSAPP_MONTHLY_BUDGET: '',
      WHATSAPP_DAILY_REPLY_LIMIT_PER_USER: '',
      WHATSAPP_LONG_RESULT_THRESHOLD: '',
      MEMORY_MAX_ENTRIES: '',
      ANTHROPIC_API_KEY: '',
    });
    expect(config.pipelineWindow.quietSeconds).toBe(45);
    expect(config.tasks.confidenceThreshold).toBe(0.8);
    expect(config.scamConfidenceLevels).toBeUndefined();
    expect(config.whatsapp.monthlyBudget).toBeUndefined();
    expect(config.whatsapp.dailyReplyLimitPerUser).toBeUndefined();
    expect(config.whatsapp.longResultThreshold).toBeUndefined();
    expect(config.memoryMaxEntries).toBeUndefined();
    expect(config.anthropic).toBeUndefined();
  });

  it('treats an empty required variable as missing', () => {
    expect(coreIssues({ ...database, DATABASE_HOST: '' })).toEqual([
      { variable: 'DATABASE_HOST', message: 'is required but not set' },
    ]);
  });

  it('takes overrides from the environment', () => {
    const config = loadCoreConfig({
      ...database,
      TASK_CONFIDENCE_THRESHOLD: '0.65',
      REMINDER_MAX_PER_TASK: '5',
      QUIET_HOURS_DEFAULT_START: '23:30',
      QUIET_HOURS_DEFAULT_END: '07:15',
      LINE_OA_REPLY_DEADLINE_SECONDS: '40',
      BINDING_CODE_TTL_SECONDS: '300',
      MESSAGE_RETENTION_OPTIONS_DAYS: '30, 7,14',
      SCAM_CONFIDENCE_HIGH_MIN: '0.9',
      SCAM_CONFIDENCE_MEDIUM_MIN: '0.5',
      WHATSAPP_MONTHLY_BUDGET: '12.5',
      WHATSAPP_DAILY_REPLY_LIMIT_PER_USER: '20',
      WHATSAPP_LONG_RESULT_THRESHOLD: '400',
      MEMORY_MAX_ENTRIES: '50',
    });
    expect(config.tasks).toEqual({ confidenceThreshold: 0.65, maxRemindersPerTask: 5 });
    expect(config.defaultQuietHours).toEqual({ start: '23:30', end: '07:15' });
    expect(config.lineOfficialAccount.replyDeadlineSeconds).toBe(40);
    expect(config.bindingCodeTtlSeconds).toBe(300);
    expect(config.messageRetentionOptionsDays).toEqual([7, 14, 30]);
    expect(config.scamConfidenceLevels).toEqual({ highMin: 0.9, mediumMin: 0.5 });
    expect(config.whatsapp).toMatchObject({
      monthlyBudget: 12.5,
      dailyReplyLimitPerUser: 20,
      longResultThreshold: 400,
    });
    expect(config.memoryMaxEntries).toBe(50);
  });

  it('reads the credentials as secrets', () => {
    const config = loadCoreConfig({ ...database, ...credentials });
    expect(config.anthropic?.apiKey.reveal()).toBe('test-anthropic-key');
    expect(config.googleSignIn).toEqual({ clientIds: ['ios-client-id', 'android-client-id'] });
    expect(config.authTokens?.signingKey.reveal()).toBe('test-signing-key-0123456789-abcdef');
    expect(config.firebase).toMatchObject({
      projectId: 'test-project',
      clientEmail: 'push@test-project.example',
    });
    expect(config.firebase?.privateKey.reveal()).toBe('test-private-key');
    expect(config.googleMaps?.apiKey.reveal()).toBe('test-maps-key');
    expect(config.lineOfficialAccount.credentials?.channelSecret.reveal()).toBe('test-line-secret');
    expect(config.lineOfficialAccount.credentials?.channelAccessToken.reveal()).toBe(
      'test-line-token',
    );
    expect(config.whatsapp.credentials?.accessToken.reveal()).toBe('test-whatsapp-token');
    expect(config.whatsapp.credentials?.appSecret.reveal()).toBe('test-whatsapp-secret');
  });

  it('does not print a secret when the loaded configuration is logged', () => {
    const config = loadCoreConfig({ ...database, ...credentials });
    const printed = JSON.stringify(config) + inspect(config, { depth: null });
    for (const value of [
      'test-database-password',
      'test-anthropic-key',
      'test-signing-key-0123456789-abcdef',
      'test-private-key',
      'test-maps-key',
      'test-line-secret',
      'test-line-token',
      'test-whatsapp-token',
      'test-whatsapp-secret',
    ]) {
      expect(printed).not.toContain(value);
    }
  });

  it.each([
    ['DATABASE_PORT', '0', 'must be at least 1'],
    ['DATABASE_PORT', '65536', 'must be at most 65535'],
    ['DATABASE_PORT', '5432.0', 'must be a whole number'],
    ['DATABASE_HOST', ' postgres', 'must not start or end with whitespace'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', '0', 'must be at least 1'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', '45s', 'must be a whole number'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', '-45', 'must be a whole number'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', '0x2d', 'must be a whole number'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', '1e2', 'must be a whole number'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', ' 45', 'must not start or end with whitespace'],
    ['PIPELINE_WINDOW_QUIET_SECONDS', '86401', 'must be at most 86400'],
    ['PIPELINE_WINDOW_MAX_MESSAGES', '0', 'must be at least 1'],
    ['PIPELINE_WINDOW_MAX_WAIT_SECONDS', '180000', 'must be at most 86400'],
    ['TASK_CONFIDENCE_THRESHOLD', '1.01', 'must be at most 1'],
    ['TASK_CONFIDENCE_THRESHOLD', '80%', 'must be a number such as 0.8'],
    ['TASK_CONFIDENCE_THRESHOLD', '.8', 'must be a number such as 0.8'],
    ['TASK_CONFIDENCE_THRESHOLD', 'NaN', 'must be a number such as 0.8'],
    ['REMINDER_MAX_PER_TASK', '0', 'must be at least 1'],
    ['QUIET_HOURS_DEFAULT_START', '24:00', 'must be a 24-hour time such as 22:00'],
    ['QUIET_HOURS_DEFAULT_START', '22', 'must be a 24-hour time such as 22:00'],
    ['QUIET_HOURS_DEFAULT_END', '8:00', 'must be a 24-hour time such as 22:00'],
    ['LINE_OA_REPLY_DEADLINE_SECONDS', '0', 'must be at least 1'],
    ['BINDING_CODE_TTL_SECONDS', 'ten minutes', 'must be a whole number'],
    ['MESSAGE_RETENTION_OPTIONS_DAYS', '7;30', 'must be whole numbers separated by commas'],
    ['MESSAGE_RETENTION_OPTIONS_DAYS', '7,,30', 'must be whole numbers separated by commas'],
    ['MESSAGE_RETENTION_OPTIONS_DAYS', '7,7,30', 'must not repeat a number'],
    ['MESSAGE_RETENTION_OPTIONS_DAYS', '0,30', 'must be at least 1'],
    ['WHATSAPP_MONTHLY_BUDGET', '0', 'must be greater than 0'],
    ['WHATSAPP_MONTHLY_BUDGET', 'unlimited', 'must be a number such as 0.8'],
    ['WHATSAPP_DAILY_REPLY_LIMIT_PER_USER', '0', 'must be at least 1'],
    ['WHATSAPP_LONG_RESULT_THRESHOLD', '0', 'must be at least 1'],
    ['MEMORY_MAX_ENTRIES', '0', 'must be at least 1'],
    ['MEMORY_MAX_ENTRIES', 'none', 'must be a whole number'],
    ['GOOGLE_OAUTH_CLIENT_IDS', 'ios-client-id,,android', 'must not contain an empty item'],
    ['GOOGLE_OAUTH_CLIENT_IDS', 'same,same', 'must not repeat an item'],
    ['AUTH_TOKEN_SIGNING_KEY', 'too-short', 'must be at least 32 characters'],
    ['ANTHROPIC_API_KEY', 'key-with-newline\n', 'must not start or end with whitespace'],
    ['FIREBASE_SERVICE_ACCOUNT_JSON', '{"project_id":', 'must be the JSON of a service-account'],
    ['FIREBASE_SERVICE_ACCOUNT_JSON', '"a string"', 'must be the JSON of a service-account'],
    [
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      '{"project_id":"p","client_email":"e"}',
      'must be the JSON of a service-account',
    ],
  ])('rejects %s=%j', (variable, value, message) => {
    const issues = coreIssues({ ...database, [variable]: value });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.variable).toBe(variable);
    expect(issues[0]?.message).toContain(message);
  });

  it('reports every problem at once', () => {
    const issues = coreIssues({
      DATABASE_HOST: 'postgres',
      DATABASE_USER: 'arlo',
      TASK_CONFIDENCE_THRESHOLD: '2',
      MEMORY_MAX_ENTRIES: 'many',
    });
    expect(issues.map((issue) => issue.variable).toSorted()).toEqual([
      'DATABASE_NAME',
      'DATABASE_PASSWORD',
      'MEMORY_MAX_ENTRIES',
      'TASK_CONFIDENCE_THRESHOLD',
    ]);
  });

  it.each([
    ['SCAM_CONFIDENCE_HIGH_MIN', 'SCAM_CONFIDENCE_MEDIUM_MIN', '0.9'],
    ['SCAM_CONFIDENCE_MEDIUM_MIN', 'SCAM_CONFIDENCE_HIGH_MIN', '0.5'],
    ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'half-a-pair'],
    ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET', 'half-a-pair'],
    ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'half-a-pair'],
    ['WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'half-a-pair'],
  ])('rejects %s without %s', (present, missing, value) => {
    expect(coreIssues({ ...database, [present]: value })).toEqual([
      { variable: missing, message: `is required when ${present} is set` },
    ]);
  });

  it.each([
    ['0.5', '0.5'],
    ['0.5', '0.9'],
  ])('rejects scam levels high=%s medium=%s', (high, medium) => {
    expect(
      coreIssues({
        ...database,
        SCAM_CONFIDENCE_HIGH_MIN: high,
        SCAM_CONFIDENCE_MEDIUM_MIN: medium,
      }),
    ).toEqual([
      {
        variable: 'SCAM_CONFIDENCE_MEDIUM_MIN',
        message: 'must be less than SCAM_CONFIDENCE_HIGH_MIN',
      },
    ]);
  });

  it('rejects quiet hours that start and end at the same time', () => {
    expect(
      coreIssues({
        ...database,
        QUIET_HOURS_DEFAULT_START: '09:00',
        QUIET_HOURS_DEFAULT_END: '09:00',
      }),
    ).toEqual([
      {
        variable: 'QUIET_HOURS_DEFAULT_END',
        message: 'must differ from QUIET_HOURS_DEFAULT_START',
      },
    ]);
  });

  it('rejects a maximum wait shorter than the quiet time', () => {
    expect(coreIssues({ ...database, PIPELINE_WINDOW_QUIET_SECONDS: '200' })).toEqual([
      {
        variable: 'PIPELINE_WINDOW_MAX_WAIT_SECONDS',
        message: 'must not be less than PIPELINE_WINDOW_QUIET_SECONDS',
      },
    ]);
  });
});

describe('a rejected configuration', () => {
  const sentinel = 'SENTINEL-9f3b7c';

  /** Everything a caller could print from the error. */
  function printed(error: ConfigError): string {
    return [
      error.message,
      String(error),
      error.stack,
      JSON.stringify(error),
      JSON.stringify(error.issues),
      inspect(error, { depth: null, showHidden: true }),
    ].join('\n');
  }

  it('has no cause', () => {
    const error = failure(() =>
      loadCoreConfig({ ...database, FIREBASE_SERVICE_ACCOUNT_JSON: '{' }),
    );
    expect(error.cause).toBeUndefined();
  });

  it('does not contain a valid secret when another variable is invalid', () => {
    const secrets = {
      DATABASE_PASSWORD: `${sentinel}-database`,
      ANTHROPIC_API_KEY: `${sentinel}-anthropic`,
      AUTH_TOKEN_SIGNING_KEY: `${sentinel}-signing-key-0123456789-abcdef`,
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'test-project',
        client_email: 'push@test-project.example',
        private_key: `${sentinel}-private-key`,
      }),
      GOOGLE_MAPS_API_KEY: `${sentinel}-maps`,
      LINE_CHANNEL_SECRET: `${sentinel}-line-secret`,
      LINE_CHANNEL_ACCESS_TOKEN: `${sentinel}-line-token`,
      WHATSAPP_ACCESS_TOKEN: `${sentinel}-whatsapp-token`,
      WHATSAPP_APP_SECRET: `${sentinel}-whatsapp-secret`,
    };
    const error = failure(() =>
      loadCoreConfig({ ...database, ...secrets, TASK_CONFIDENCE_THRESHOLD: 'high' }),
    );
    expect(error.issues.map((issue) => issue.variable)).toEqual(['TASK_CONFIDENCE_THRESHOLD']);
    expect(printed(error)).not.toContain(sentinel);
  });

  it.each([
    ['DATABASE_PASSWORD', ` ${sentinel}`],
    ['ANTHROPIC_API_KEY', `${sentinel}\n`],
    ['AUTH_TOKEN_SIGNING_KEY', sentinel],
    ['FIREBASE_SERVICE_ACCOUNT_JSON', `{"private_key": ${sentinel}}`],
    ['FIREBASE_SERVICE_ACCOUNT_JSON', `{"private_key":"${sentinel}"}`],
    ['GOOGLE_MAPS_API_KEY', `${sentinel} `],
    ['GOOGLE_OAUTH_CLIENT_IDS', `${sentinel},${sentinel}`],
    ['LINE_CHANNEL_SECRET', sentinel],
    ['WHATSAPP_APP_SECRET', sentinel],
    ['TASK_CONFIDENCE_THRESHOLD', sentinel],
    ['MESSAGE_RETENTION_OPTIONS_DAYS', sentinel],
  ])('does not contain the rejected value of %s', (variable, value) => {
    const error = failure(() => loadCoreConfig({ ...database, [variable]: value }));
    expect(printed(error)).toContain(variable);
    expect(printed(error)).not.toContain(sentinel);
  });
});
