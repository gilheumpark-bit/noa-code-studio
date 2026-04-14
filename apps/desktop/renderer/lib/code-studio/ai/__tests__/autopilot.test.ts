/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for autopilot module
 */
describe('autopilot', () => {
  it('module loads without error', () => { expect(() => require('../autopilot')).not.toThrow(); });
  it('exports autopilot types', () => { expect(typeof require('../autopilot')).toBe('object'); });
});
