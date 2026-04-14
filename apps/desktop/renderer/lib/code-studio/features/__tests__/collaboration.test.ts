/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for collaboration module
 */
describe('collaboration', () => {
  it('module loads without error', () => {
    expect(() => require('../collaboration')).not.toThrow();
  });
  it('exports collaboration types', () => {
    const mod = require('../collaboration');
    expect(typeof mod).toBe('object');
  });
});
