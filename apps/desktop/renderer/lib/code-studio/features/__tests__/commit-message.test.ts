/**
 * Unit tests for commit-message — generateCommitMessage, formatConventionalCommit
 */
import { generateCommitMessage, formatConventionalCommit } from '../commit-message';
import type { GitDiffResult } from '../git';

function makeDiff(filePath: string, additions = 5, deletions = 2): GitDiffResult {
  return {
    filePath,
    additions,
    deletions,
    hunks: [{ oldStart: 1, oldLines: deletions, newStart: 1, newLines: additions, lines: [] }],
  } as GitDiffResult;
}

describe('generateCommitMessage', () => {
  it('returns chore for empty diffs', () => {
    const msg = generateCommitMessage([]);
    expect(msg.type).toBe('chore');
    expect(msg.confidence).toBe(0);
  });

  it('detects test type for test files', () => {
    const msg = generateCommitMessage([makeDiff('src/__tests__/foo.test.ts')]);
    expect(msg.type).toBe('test');
  });

  it('detects docs type for md files', () => {
    const msg = generateCommitMessage([makeDiff('README.md')]);
    expect(msg.type).toBe('docs');
  });

  it('infers scope from single file path', () => {
    const msg = generateCommitMessage([makeDiff('src/lib/utils.ts')]);
    expect(msg.scope).toBe('lib');
  });

  it('generates full conventional commit string', () => {
    const msg = generateCommitMessage([makeDiff('src/app.ts')]);
    expect(msg.full).toMatch(/^\w+(\(\w+\))?:/);
  });
});

describe('formatConventionalCommit', () => {
  it('formats without scope', () => {
    expect(formatConventionalCommit('feat', '', 'add feature')).toBe('feat: add feature');
  });

  it('formats with scope', () => {
    expect(formatConventionalCommit('fix', 'auth', 'fix login')).toBe('fix(auth): fix login');
  });

  it('adds breaking change marker', () => {
    const result = formatConventionalCommit('feat', 'api', 'change endpoint', undefined, true);
    expect(result).toContain('!');
  });

  it('includes body', () => {
    const result = formatConventionalCommit('feat', '', 'title', 'body text');
    expect(result).toContain('\n\nbody text');
  });
});
