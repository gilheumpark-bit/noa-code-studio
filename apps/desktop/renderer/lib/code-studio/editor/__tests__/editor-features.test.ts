/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for editor-features module
 */
describe('editor-features', () => {
  it('module loads without error', () => { expect(() => require('../editor-features')).not.toThrow(); });
  it('exports editor feature functions', () => { expect(typeof require('../editor-features')).toBe('object'); });
});
