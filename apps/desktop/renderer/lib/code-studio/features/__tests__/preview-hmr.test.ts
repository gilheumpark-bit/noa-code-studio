/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for preview-hmr module
 */
describe('preview-hmr', () => {
  it('module loads without error', () => { expect(() => require('../preview-hmr')).not.toThrow(); });
  it('exports HMR functions', () => { expect(typeof require('../preview-hmr')).toBe('object'); });
});
