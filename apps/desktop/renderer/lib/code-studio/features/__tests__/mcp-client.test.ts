/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for mcp-client module
 */
describe('mcp-client', () => {
  it('module loads without error', () => { expect(() => require('../mcp-client')).not.toThrow(); });
  it('exports MCP client', () => { expect(typeof require('../mcp-client')).toBe('object'); });
});
