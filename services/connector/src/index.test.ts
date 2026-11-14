import { describe, expect, it } from 'vitest';

import { serviceName } from './index.js';

describe('connector entry point', () => {
  it('resolves the shared package', () => {
    expect(serviceName).toBe('connector');
  });
});
