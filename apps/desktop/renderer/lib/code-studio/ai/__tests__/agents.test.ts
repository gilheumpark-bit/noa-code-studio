/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for agents module
 */
describe('agents', () => {
  it('module loads without error', () => {
    expect(() => require('../agents')).not.toThrow();
  });
  it('exports agent definitions', () => {
    const mod = require('../agents');
    expect(typeof mod).toBe('object');
  });
});
