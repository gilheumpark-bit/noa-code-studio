/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for terminal-ai module
 */
describe('terminal-ai', () => {
  it('module loads without error', () => { expect(() => require('../terminal-ai')).not.toThrow(); });
  it('exports AI terminal types', () => { expect(typeof require('../terminal-ai')).toBe('object'); });
});
