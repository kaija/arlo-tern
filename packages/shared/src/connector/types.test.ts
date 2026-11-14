import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { tables } from '../db/schema.js';
import {
  CONNECTION_STATES,
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  CONVERSATION_TYPES,
  LINK_FAILURE_REASONS,
  LINK_STATES,
  MESSAGE_CONTENT_TYPES,
  MESSAGE_DIRECTIONS,
  PLATFORMS,
} from './index.js';

// What a connector reports ends up in the database and, from there, in the API. These tests
// keep the three lists of values in step: the connector's, the schema's and the API's.

const spec = readFileSync(
  fileURLToPath(new URL('../../../../docs/api/openapi.yaml', import.meta.url)),
  'utf8',
);

/**
 * The `enum` of a schema in docs/api/openapi.yaml, or of one of its properties. Reads the
 * file as text, so it depends on how the spec is laid out; when it cannot find the list it
 * fails with a message that says so, rather than passing.
 */
function specEnum(schema: string, property?: string): string[] {
  const lines = spec.split('\n');
  const start = lines.indexOf(`    ${schema}:`);
  if (start === -1) throw new Error(`schema ${schema} not found in the OpenAPI spec`);
  let end = lines.findIndex((line, index) => index > start && /^ {4}\S/.test(line));
  if (end === -1) end = lines.length;
  let from = start;
  if (property !== undefined) {
    from = lines.findIndex(
      (line, index) => index > start && index < end && line.trim() === `${property}:`,
    );
    if (from === -1) throw new Error(`property ${property} not found in schema ${schema}`);
  }
  const at = lines.findIndex(
    (line, index) => index > from && index < end && line.trim().startsWith('enum:'),
  );
  const first = lines[at];
  if (first === undefined) throw new Error(`no enum found for ${schema} ${property ?? ''}`);
  const inline = /\[(.*)\]/.exec(first);
  if (inline?.[1] !== undefined) return inline[1].split(',').map((value) => value.trim());
  const values: string[] = [];
  for (const line of lines.slice(at + 1, end)) {
    const item = /^\s+- (\S+)$/.exec(line);
    if (item?.[1] === undefined) break;
    values.push(item[1]);
  }
  return values;
}

describe('connector values and the database schema', () => {
  it('uses the platforms of conversations.platform', () => {
    expect(PLATFORMS).toEqual(tables.conversations.platform.oneOf);
  });

  it('uses the conversation types of conversations.type', () => {
    expect(CONVERSATION_TYPES).toEqual(tables.conversations.type.oneOf);
  });

  it('uses the directions of messages.direction', () => {
    expect(MESSAGE_DIRECTIONS).toEqual(tables.messages.direction.oneOf);
  });

  it('reports every connection status except not_linked, which is the absence of one', () => {
    expect(['not_linked', ...CONNECTION_STATES]).toEqual(tables.line_connections.status.oneOf);
  });

  it('reports every link status except the two the caller sets itself', () => {
    expect(['pending', ...LINK_STATES, 'cancelled']).toEqual(
      tables.line_link_sessions.status.oneOf,
    );
  });
});

describe('connector values and the API contract', () => {
  it('uses the conversation types of ConversationType', () => {
    expect(CONVERSATION_TYPES).toEqual(specEnum('ConversationType'));
  });

  it('uses the platforms of Conversation.platform', () => {
    expect(PLATFORMS).toEqual(specEnum('Conversation', 'platform'));
  });

  it('uses the directions and content types of SourceMessage', () => {
    expect(MESSAGE_DIRECTIONS).toEqual(specEnum('SourceMessage', 'direction'));
    expect(MESSAGE_CONTENT_TYPES).toEqual(specEnum('SourceMessage', 'contentType'));
  });

  it('uses the statuses of LineConnection and LineLinkSession', () => {
    expect(['not_linked', ...CONNECTION_STATES]).toEqual(specEnum('LineConnection', 'status'));
    expect(['pending', ...LINK_STATES, 'cancelled']).toEqual(specEnum('LineLinkSession', 'status'));
  });

  it('fails loudly when the spec has no such list', () => {
    expect(() => specEnum('NoSuchSchema')).toThrow('schema NoSuchSchema not found');
    expect(() => specEnum('LineConnection', 'nothing')).toThrow('property nothing not found');
    expect(() => specEnum('ConversationRef', 'name')).toThrow('no enum found');
  });
});

describe('link failure reasons', () => {
  it('are codes, not text for the user', () => {
    expect(LINK_FAILURE_REASONS).toEqual(['rejected', 'error']);
  });
});

describe('ConnectorError', () => {
  it.each(CONNECTOR_ERROR_CODES)('carries the code %s and a fixed message', (code) => {
    const error = new ConnectorError(code);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConnectorError');
    expect(error.code).toBe(code);
    expect(error.message).not.toBe('');
  });

  it('has a different message for each code', () => {
    const messages = CONNECTOR_ERROR_CODES.map((code) => new ConnectorError(code).message);
    expect(new Set(messages).size).toBe(CONNECTOR_ERROR_CODES.length);
  });
});
