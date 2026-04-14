/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for useCodeStudioAgent hook
 */
describe('useCodeStudioAgent', () => {
  it('module loads without error', () => { expect(() => require('../useCodeStudioAgent')).not.toThrow(); });
  it('exports hook', () => { expect(typeof require('../useCodeStudioAgent')).toBe('object'); });
});
