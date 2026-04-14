/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for core/types module
 */
describe('core/types', () => {
  it('module loads without error', () => { expect(() => require('../types')).not.toThrow(); });
  it('exports type definitions', () => { expect(typeof require('../types')).toBe('object'); });
});
