/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for useCodeStudioPanels hook
 */
describe('useCodeStudioPanels', () => {
  it('module loads without error', () => { expect(() => require('../useCodeStudioPanels')).not.toThrow(); });
  it('exports hook', () => { expect(typeof require('../useCodeStudioPanels')).toBe('object'); });
});
