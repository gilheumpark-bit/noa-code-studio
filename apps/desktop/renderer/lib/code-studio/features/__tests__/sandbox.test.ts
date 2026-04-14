/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for sandbox module
 */
describe('sandbox', () => {
  it('module loads without error', () => { expect(() => require('../sandbox')).not.toThrow(); });
  it('exports sandbox utilities', () => { expect(typeof require('../sandbox')).toBe('object'); });
});
