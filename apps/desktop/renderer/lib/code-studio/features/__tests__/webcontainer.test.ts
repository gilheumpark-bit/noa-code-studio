/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for webcontainer module
 */
describe('webcontainer', () => {
  it('module loads without error', () => { expect(() => require('../webcontainer')).not.toThrow(); });
  it('exports webcontainer types', () => { expect(typeof require('../webcontainer')).toBe('object'); });
  it('simulates porcelain git status output for git runner consumers', async () => {
    const { createWebContainer } = require('../webcontainer');
    const container = await createWebContainer();
    const result = await container.run('git status --porcelain=v1 -b');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('## main');
  });

  it('simulates formatted git branch output for git runner consumers', async () => {
    const { createWebContainer } = require('../webcontainer');
    const container = await createWebContainer();
    const result = await container.run('git branch -a --format=%(refname:short) %(HEAD) %(objectname:short)');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('main');
    expect(result.stdout).toContain('abc1234');
  });
});
