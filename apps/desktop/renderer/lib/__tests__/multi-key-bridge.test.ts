/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for multi-key-bridge module
 */
describe('multi-key-bridge', () => {
  it('module loads without error', () => { expect(() => require('../multi-key-bridge')).not.toThrow(); });
  it('exports bridge functions', () => { expect(typeof require('../multi-key-bridge')).toBe('object'); });
});
