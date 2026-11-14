import { describe, expect, it } from 'vitest';

import { SERVICE_NAMES } from './index.js';

describe('SERVICE_NAMES', () => {
  it('lists the two backend services', () => {
    expect(SERVICE_NAMES).toEqual(['connector', 'core']);
  });
});
