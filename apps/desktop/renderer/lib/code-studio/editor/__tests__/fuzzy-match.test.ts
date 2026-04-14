/**
 * Unit tests for fuzzy-match — fuzzyMatch, highlightMatches
 */
import { fuzzyMatch, highlightMatches } from '../fuzzy-match';

describe('fuzzyMatch', () => {
  it('matches exact string', () => {
    const result = fuzzyMatch('hello', 'hello');
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('matches prefix', () => {
    const result = fuzzyMatch('hel', 'hello');
    expect(result.matched).toBe(true);
  });

  it('matches camelCase boundaries', () => {
    const result = fuzzyMatch('fM', 'fuzzyMatch');
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns false for non-matching', () => {
    const result = fuzzyMatch('xyz', 'hello');
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it('returns true for empty query', () => {
    const result = fuzzyMatch('', 'anything');
    expect(result.matched).toBe(true);
  });

  it('returns false for empty target', () => {
    const result = fuzzyMatch('a', '');
    expect(result.matched).toBe(false);
  });

  it('applies threshold filtering', () => {
    const result = fuzzyMatch('a', 'abcdefghijklmnop', 999);
    expect(result.matched).toBe(false);
  });

  it('gives bonus for consecutive matches', () => {
    const consecutive = fuzzyMatch('ab', 'abc');
    const spaced = fuzzyMatch('ac', 'abc');
    expect(consecutive.score).toBeGreaterThan(spaced.score);
  });
});

describe('highlightMatches', () => {
  it('wraps matched chars in mark tags', () => {
    const result = highlightMatches('hello', [0, 1]);
    expect(result).toContain('<mark>');
    expect(result).toContain('</mark>');
  });

  it('returns original for no positions', () => {
    expect(highlightMatches('hello', [])).toBe('hello');
  });

  it('handles consecutive positions', () => {
    const result = highlightMatches('abc', [0, 1, 2]);
    expect(result).toBe('<mark>abc</mark>');
  });
});
