/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for git module
 */
describe('git', () => {
  it('module loads without error', () => {
    expect(() => require('../git')).not.toThrow();
  });
  it('exports git types and functions', () => {
    const mod = require('../git');
    expect(typeof mod).toBe('object');
  });
});
