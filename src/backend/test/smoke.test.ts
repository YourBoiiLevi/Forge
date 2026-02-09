import { describe, expect, it } from 'vitest';

import { main } from '../index';

describe('backend scaffolding', () => {
  it('exports a runnable entrypoint', () => {
    expect(typeof main).toBe('function');
  });
});
