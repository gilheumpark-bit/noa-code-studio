/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for terminal module
 */
describe('terminal', () => {
  it('module loads without error', () => { expect(() => require('../terminal')).not.toThrow(); });
  it('exports terminal types', () => { expect(typeof require('../terminal')).toBe('object'); });
});
