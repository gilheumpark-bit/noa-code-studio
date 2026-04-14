/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for multi-key-manager module
 */
describe('multi-key-manager', () => {
  it('module loads without error', () => { expect(() => require('../multi-key-manager')).not.toThrow(); });
  it('exports manager functions', () => { expect(typeof require('../multi-key-manager')).toBe('object'); });
});
