/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for terminal-emulator module
 */
describe('terminal-emulator', () => {
  it('module loads without error', () => { expect(() => require('../terminal-emulator')).not.toThrow(); });
  it('exports emulator types', () => { expect(typeof require('../terminal-emulator')).toBe('object'); });
});
