/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for patent-scanner module
 */
describe('patent-scanner', () => {
  it('module loads without error', () => { expect(() => require('../patent-scanner')).not.toThrow(); });
  it('exports scanner functions', () => { expect(typeof require('../patent-scanner')).toBe('object'); });
});
