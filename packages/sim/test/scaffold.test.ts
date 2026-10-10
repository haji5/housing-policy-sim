import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SIM_VERSION } from '../src/index.ts';

describe('scaffold', () => {
  it('exports a version string', () => {
    expect(SIM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('fast-check is wired up', () => {
    fc.assert(fc.property(fc.integer(), (n) => n + 0 === n));
  });
});
