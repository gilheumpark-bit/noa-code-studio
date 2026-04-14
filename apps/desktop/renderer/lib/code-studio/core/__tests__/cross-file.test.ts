/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for cross-file module
 */
describe('cross-file', () => {
  it('module loads without error', () => { expect(() => require('../cross-file')).not.toThrow(); });
  it('exports cross-file utilities', () => { expect(typeof require('../cross-file')).toBe('object'); });
});
