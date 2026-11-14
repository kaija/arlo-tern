import { describe, expect, it } from 'vitest';

import { serviceName } from './index.js';

describe('core entry point', () => {
  it('resolves the shared package', () => {
    expect(serviceName).toBe('core');
  });
});
