import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_VARIABLES,
  CORE_ONLY_CREDENTIAL_VARIABLES,
  CORE_VARIABLES,
  undecidedSettings,
} from './settings.js';

// Keeps the files that hand variables to the services in step with settings.ts. A setting
// that is added to the code but not to these files would silently never be overridable.

function repositoryFile(name: string): string {
  return readFileSync(new URL(`../../../../${name}`, import.meta.url), 'utf8');
}

/** The variable names in the `environment:` block of one service in docker-compose.yml. */
function composeEnvironment(service: string): string[] {
  const lines = repositoryFile('docker-compose.yml').split('\n');
  const start = lines.indexOf(`  ${service}:`);
  if (start === -1) throw new Error(`docker-compose.yml has no service named ${service}`);

  const variables: string[] = [];
  let inEnvironment = false;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (/^ {0,2}\S/.test(line)) break; // the next service or top-level key
    if (/^ {4}\S/.test(line)) inEnvironment = line === '    environment:';
    const variable = /^ {6}([A-Z][A-Z0-9_]*):/.exec(line)?.[1];
    if (inEnvironment && variable !== undefined) variables.push(variable);
  }
  return variables;
}

/** Variable name to value for every assignment in .env.example, commented out or not. */
function exampleAssignments(): Map<string, string> {
  const assignments = new Map<string, string>();
  for (const line of repositoryFile('.env.example').split('\n')) {
    const match = /^(?:# )?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1] !== undefined) assignments.set(match[1], match[2] ?? '');
  }
  return assignments;
}

describe('docker-compose.yml', () => {
  it('gives the connector exactly the variables it reads', () => {
    expect(composeEnvironment('connector').toSorted()).toEqual(CONNECTOR_VARIABLES.toSorted());
  });

  it('gives the core service exactly the variables it reads', () => {
    expect(composeEnvironment('core').toSorted()).toEqual(CORE_VARIABLES.toSorted());
  });

  it('gives the connector no core credential', () => {
    const connector = composeEnvironment('connector');
    for (const variable of CORE_ONLY_CREDENTIAL_VARIABLES) {
      expect(connector).not.toContain(variable);
    }
  });
});

describe('.env.example', () => {
  const assignments = exampleAssignments();

  it('names every variable a service reads', () => {
    for (const variable of CORE_VARIABLES) {
      expect(assignments.has(variable), variable).toBe(true);
    }
  });

  it('holds no credential and no value for an undecided setting', () => {
    for (const variable of [...CORE_ONLY_CREDENTIAL_VARIABLES, ...Object.keys(undecidedSettings)]) {
      expect(assignments.get(variable), variable).toBe('');
    }
  });
});
