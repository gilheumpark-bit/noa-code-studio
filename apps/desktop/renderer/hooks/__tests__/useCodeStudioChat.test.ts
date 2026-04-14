/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for useCodeStudioChat hook
 */
describe('useCodeStudioChat', () => {
  it('module loads without error', () => { expect(() => require('../useCodeStudioChat')).not.toThrow(); });
  it('exports hook', () => { expect(typeof require('../useCodeStudioChat')).toBe('object'); });
});
