import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';

import type { operations, paths, Schema } from './index.js';

// Most of this file is checked by the compiler, not by the test runner: `expectTypeOf` does
// nothing at run time, and a line that no longer holds fails `pnpm typecheck`. The tests pin
// the shapes that the core service and the app rely on, so a field that disappears from the
// spec, or a generator option that changes what the types mean, is noticed here first.

/** The keys of `T` that are not optional. */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

type Task = Schema<'Task'>;
type Problem = Schema<'Problem'>;
type AgentStreamEvent = Schema<'AgentStreamEvent'>;

describe('the generated file', () => {
  const generated = readFileSync(
    fileURLToPath(new URL('./openapi.generated.ts', import.meta.url)),
    'utf8',
  );

  it('imports nothing, so the mobile app can bundle it', () => {
    expect(generated).not.toMatch(/^\s*import\s/m);
    expect(generated).not.toMatch(/\brequire\(/);
    expect(generated).not.toMatch(/\sfrom\s+['"]/);
  });

  it('declares types only and has no runtime code', () => {
    const declarations = generated
      .split('\n')
      .filter((line) => /^[A-Za-z]/.test(line))
      .map((line) => /^(export )?(interface|type) /.test(line));
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations).not.toContain(false);
  });
});

describe('Task', () => {
  it('has exactly the fields of the spec', () => {
    expectTypeOf<keyof Task>().toEqualTypeOf<
      | 'id'
      | 'title'
      | 'date'
      | 'time'
      | 'allDay'
      | 'category'
      | 'status'
      | 'source'
      | 'confidence'
      | 'userModified'
      | 'hasSource'
      | 'conversation'
      | 'tripId'
      | 'createdAt'
      | 'updatedAt'
    >();
  });

  it('requires the fields the spec lists as required', () => {
    expectTypeOf<RequiredKeys<Task>>().toEqualTypeOf<
      | 'id'
      | 'title'
      | 'date'
      | 'time'
      | 'allDay'
      | 'category'
      | 'status'
      | 'source'
      | 'userModified'
      | 'hasSource'
      | 'createdAt'
      | 'updatedAt'
    >();
  });

  it('types a nullable field as a union with null, and an optional one with undefined too', () => {
    // `oneOf: [$ref, { type: 'null' }]`, required.
    expectTypeOf<Task['time']>().toEqualTypeOf<string | null>();
    // `type: [number, 'null']`, not required.
    expectTypeOf<Task['confidence']>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<Task['conversation']>().toEqualTypeOf<
      Schema<'ConversationRef'> | null | undefined
    >();
    expectTypeOf<Schema<'Notification'>['ref']>().toEqualTypeOf<Schema<'NotificationRef'> | null>();
  });

  it('types an enumeration as a union of its values', () => {
    expectTypeOf<Task['status']>().toEqualTypeOf<'active' | 'completed' | 'cancelled'>();
    expectTypeOf<Schema<'ConversationType'>>().toEqualTypeOf<
      'direct' | 'group' | 'official_account'
    >();
  });

  it('accepts a task as the API returns it', () => {
    const task = {
      id: '8d3f0f0e-6a54-4a52-9d0c-1f2a3b4c5d6e',
      title: '繳電費',
      date: '2026-12-01',
      time: null,
      allDay: true,
      category: 'payment',
      status: 'active',
      source: 'pipeline',
      confidence: 0.92,
      userModified: false,
      hasSource: true,
      createdAt: '2026-11-14T08:00:00Z',
      updatedAt: '2026-11-14T08:00:00Z',
    } satisfies Task;
    expect(task.status).toBe('active');
  });
});

describe('request bodies', () => {
  it('leave a field with a default optional, because the client may omit it', () => {
    // Generated with `--default-non-nullable false`. Without it `allDay` and `reminderMode`
    // would be required of the client, and `type` of every Problem the service writes.
    expectTypeOf<RequiredKeys<Schema<'TaskCreate'>>>().toEqualTypeOf<'title' | 'date'>();
    expectTypeOf<Schema<'TaskCreate'>['allDay']>().toEqualTypeOf<boolean | undefined>();
  });

  it('accept a populated body for a schema built from allOf', () => {
    // Generated with `--empty-objects-unknown`. Without it this body is rejected: the second
    // member of the allOf has no properties and becomes `Record<string, never>`.
    const body = {
      date: '2026-12-20',
      startTime: '09:30',
      type: 'attraction',
      title: '淺草寺',
    } satisfies Schema<'ItineraryItemCreate'>;
    expect(body.type).toBe('attraction');
  });

  it('do not carry the required list of an allOf member (known gap)', () => {
    // The spec requires eight fields of ItineraryItem, but lists them inside a member of the
    // allOf. The generator applies such a list to that member's own properties (id, tripId)
    // and not to the six that come from the other member, which are therefore optional here.
    // See the row "spec 的寫法造成的型別缺口" of the 工具與專案結構 table in the design
    // document. When the spec or the generator changes that, these lines stop compiling:
    // replace them with the full list.
    expectTypeOf<RequiredKeys<Schema<'ItineraryItem'>>>().toEqualTypeOf<'id' | 'tripId'>();
    expectTypeOf<Schema<'ItineraryItem'>['date']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Schema<'ItineraryItemCreate'>['date']>().toEqualTypeOf<string | undefined>();
  });
});

describe('Problem', () => {
  it('has exactly the fields of the spec, of which three are required', () => {
    expectTypeOf<keyof Problem>().toEqualTypeOf<
      'type' | 'title' | 'status' | 'detail' | 'code' | 'errors' | 'requiredConsents'
    >();
    expectTypeOf<RequiredKeys<Problem>>().toEqualTypeOf<'title' | 'status' | 'code'>();
  });

  it('carries a machine-readable code from the list of error codes', () => {
    expectTypeOf<Problem['code']>().toEqualTypeOf<Schema<'ErrorCode'>>();
    expectTypeOf<'not_found'>().toExtend<Problem['code']>();
    expectTypeOf<'no_such_code'>().not.toExtend<Problem['code']>();
  });

  it('is the body of an error response, under application/problem+json', () => {
    type NotFound = operations['getTask']['responses'][404];
    expectTypeOf<NotFound['content']['application/problem+json']>().toEqualTypeOf<Problem>();
    // A response declared on the operation itself rather than under components.responses.
    type Conflict = operations['sendAgentMessage']['responses'][409];
    expectTypeOf<Conflict['content']['application/problem+json']>().toEqualTypeOf<Problem>();
  });
});

describe('operations', () => {
  it('are reachable by path and method as well as by operationId', () => {
    expectTypeOf<paths['/tasks/{taskId}']['get']>().toEqualTypeOf<operations['getTask']>();
  });

  it('type a cursor-paginated list as items plus a nullable next cursor', () => {
    type Page = operations['listTasks']['responses'][200]['content']['application/json'];
    expectTypeOf<Page>().toEqualTypeOf<{ items: Task[]; nextCursor: string | null }>();
    type Query = NonNullable<operations['listTasks']['parameters']['query']>;
    expectTypeOf<Query['limit']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Query['cursor']>().toEqualTypeOf<string | undefined>();
  });
});

describe('the agent stream', () => {
  it('types the data of an SSE event as AgentStreamEvent', () => {
    type Stream = operations['sendAgentMessage']['responses'][200];
    expectTypeOf<Stream['content']['text/event-stream']>().toEqualTypeOf<AgentStreamEvent>();
  });

  it('has exactly six event types', () => {
    expectTypeOf<AgentStreamEvent['type']>().toEqualTypeOf<
      | 'message.started'
      | 'text.delta'
      | 'tool.started'
      | 'tool.completed'
      | 'message.completed'
      | 'error'
    >();
  });

  it('narrows an event to its payload by its type', () => {
    // Each case reads a field that only that event has, and the default case only compiles
    // while every type is handled.
    function summarise(event: AgentStreamEvent): string {
      switch (event.type) {
        case 'message.started':
          return event.assistantMessageId;
        case 'text.delta':
          return event.delta;
        case 'tool.started':
          return event.tool;
        case 'tool.completed':
          return `${event.tool}:${String(event.ok)}`;
        case 'message.completed':
          return event.message.status;
        case 'error':
          return event.code;
        default:
          return event satisfies never;
      }
    }

    expect(summarise({ type: 'text.delta', delta: '好的' })).toBe('好的');
    expect(summarise({ type: 'tool.completed', toolCallId: 'call-1', tool: 'x', ok: true })).toBe(
      'x:true',
    );
    expect(summarise({ type: 'error', code: 'internal_error', message: 'failed' })).toBe(
      'internal_error',
    );
  });
});
