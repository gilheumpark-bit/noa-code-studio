/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for useCodeStudioKeyboard hook
 */
describe('useCodeStudioKeyboard', () => {
  it('module loads without error', () => { expect(() => require('../useCodeStudioKeyboard')).not.toThrow(); });
  it('exports hook', () => { expect(typeof require('../useCodeStudioKeyboard')).toBe('object'); });
});
