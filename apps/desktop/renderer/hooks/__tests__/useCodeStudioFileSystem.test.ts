/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for useCodeStudioFileSystem hook
 */
describe('useCodeStudioFileSystem', () => {
  it('module loads without error', () => { expect(() => require('../useCodeStudioFileSystem')).not.toThrow(); });
  it('exports hook', () => { expect(typeof require('../useCodeStudioFileSystem')).toBe('object'); });
});
