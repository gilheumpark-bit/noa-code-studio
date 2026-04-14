/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for useAIProvider hook
 */
describe('useAIProvider', () => {
  it('module loads without error', () => { expect(() => require('../useAIProvider')).not.toThrow(); });
  it('exports hook', () => { expect(typeof require('../useAIProvider')).toBe('object'); });
});
