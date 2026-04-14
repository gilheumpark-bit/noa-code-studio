/**
 * Unit tests for ANSI parser — parseAnsi, stripAnsi
 */
import { parseAnsi, stripAnsi } from '../ansi';

describe('parseAnsi', () => {
  it('returns single span for plain text', () => {
    const spans = parseAnsi('hello');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('hello');
    expect(spans[0].color).toBeUndefined();
  });

  it('parses bold code', () => {
    const spans = parseAnsi('\x1b[1mBOLD\x1b[0m');
    expect(spans[0].bold).toBe(true);
    expect(spans[0].text).toBe('BOLD');
  });

  it('parses color codes', () => {
    const spans = parseAnsi('\x1b[31mred\x1b[0m');
    expect(spans[0].color).toBe('#f85149');
    expect(spans[0].text).toBe('red');
  });

  it('resets styles on code 0', () => {
    const spans = parseAnsi('\x1b[1;31mhello\x1b[0m world');
    expect(spans[1].bold).toBe(false);
    expect(spans[1].color).toBeUndefined();
  });

  it('returns empty array for empty string', () => {
    expect(parseAnsi('')).toEqual([]);
  });

  it('parses italic and underline', () => {
    const spans = parseAnsi('\x1b[3;4mtext\x1b[0m');
    expect(spans[0].italic).toBe(true);
    expect(spans[0].underline).toBe(true);
  });
});

describe('stripAnsi', () => {
  it('removes ANSI codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('no codes here')).toBe('no codes here');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});
