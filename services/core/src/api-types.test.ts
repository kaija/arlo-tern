import type { operations, Schema } from '@arlo-tern/shared/api';
import { describe, expect, expectTypeOf, it } from 'vitest';

// The API types are generated in the shared package for this service and the app to share.
// This checks that the path resolves from here and that the types describe what the service
// will write; the types' own tests are next to them.
describe('the API types, seen from the core service', () => {
  it('resolve, and describe an error response the service can build', () => {
    const problem: Schema<'Problem'> = {
      title: 'Not found',
      status: 404,
      code: 'not_found',
    };
    expect(problem.code).toBe('not_found');
    expectTypeOf(problem).toExtend<
      operations['getTask']['responses'][404]['content']['application/problem+json']
    >();
  });
});
