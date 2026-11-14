import type { ServiceName } from '../index.js';

/** One rejected environment variable. `message` reads as a continuation of the variable name. */
export interface ConfigIssue {
  readonly variable: string;
  readonly message: string;
}

/**
 * Thrown when a service's environment is not a valid configuration.
 *
 * It names every offending variable and the rule it broke. It never carries a variable's
 * value, and it has no `cause`, so printing or serialising it cannot leak a secret.
 */
export class ConfigError extends Error {
  readonly service: ServiceName;
  readonly issues: readonly ConfigIssue[];

  constructor(service: ServiceName, issues: readonly ConfigIssue[]) {
    const lines = issues.map((issue) => `  ${issue.variable} ${issue.message}`);
    super([`Invalid configuration for ${service}:`, ...lines].join('\n'));
    this.name = 'ConfigError';
    this.service = service;
    this.issues = issues;
  }
}
