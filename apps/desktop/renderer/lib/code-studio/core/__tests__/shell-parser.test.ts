/**
 * Unit tests for shell-parser — tokenize, expandVariables, globToRegex, isIncomplete
 */
import {
  tokenize,
  expandVariables,
  globToRegex,
  containsGlob,
  expandGlob,
  isIncomplete,
  joinContinuations,
  parseCommandChain,
} from '../shell-parser';

describe('tokenize', () => {
  it('tokenizes simple command', () => {
    const tokens = tokenize('ls -la');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ type: 'word', value: 'ls' });
    expect(tokens[1]).toMatchObject({ type: 'word', value: '-la' });
  });

  it('tokenizes pipe', () => {
    const tokens = tokenize('cat file | grep test');
    const pipeToken = tokens.find(t => t.type === 'pipe');
    expect(pipeToken).toBeDefined();
  });

  it('tokenizes logical AND', () => {
    const tokens = tokenize('cmd1 && cmd2');
    expect(tokens.some(t => t.type === 'and')).toBe(true);
  });

  it('tokenizes redirects', () => {
    const tokens = tokenize('echo hello > out.txt');
    expect(tokens.some(t => t.type === 'redirect_out')).toBe(true);
  });

  it('handles single-quoted strings', () => {
    const tokens = tokenize("echo 'hello world'");
    expect(tokens[1].value).toBe('hello world');
    expect(tokens[1].quoted).toBe(true);
  });

  it('handles double-quoted strings', () => {
    const tokens = tokenize('echo "hello world"');
    expect(tokens[1].value).toBe('hello world');
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toHaveLength(0);
  });
});

describe('expandVariables', () => {
  it('expands simple $VAR', () => {
    expect(expandVariables('$HOME/dir', { HOME: '/usr' })).toBe('/usr/dir');
  });

  it('expands ${VAR} syntax', () => {
    expect(expandVariables('${PATH}', { PATH: '/bin' })).toBe('/bin');
  });

  it('uses default with ${VAR:-default}', () => {
    expect(expandVariables('${MISSING:-fallback}', {})).toBe('fallback');
  });

  it('returns empty for undefined var without default', () => {
    expect(expandVariables('$NOPE', {})).toBe('');
  });
});

describe('globToRegex', () => {
  it('matches wildcard *', () => {
    const re = globToRegex('*.ts');
    expect(re.test('file.ts')).toBe(true);
    expect(re.test('file.js')).toBe(false);
  });

  it('matches double wildcard **', () => {
    const re = globToRegex('src/**/*.ts');
    expect(re.test('src/lib/file.ts')).toBe(true);
  });

  it('matches question mark ?', () => {
    const re = globToRegex('file?.ts');
    expect(re.test('file1.ts')).toBe(true);
    expect(re.test('file.ts')).toBe(false);
  });

  it('matches brace alternatives', () => {
    const re = globToRegex('*.{ts,js}');
    expect(re.test('file.ts')).toBe(true);
    expect(re.test('file.js')).toBe(true);
    expect(re.test('file.py')).toBe(false);
  });
});

describe('containsGlob', () => {
  it('detects * as glob', () => { expect(containsGlob('*.ts')).toBe(true); });
  it('detects ? as glob', () => { expect(containsGlob('file?.ts')).toBe(true); });
  it('returns false for plain text', () => { expect(containsGlob('file.ts')).toBe(false); });
});

describe('expandGlob', () => {
  it('filters paths matching glob', () => {
    const paths = ['a.ts', 'b.js', 'c.ts'];
    expect(expandGlob('*.ts', paths)).toEqual(['a.ts', 'c.ts']);
  });
});

describe('isIncomplete', () => {
  it('detects unclosed single quote', () => {
    expect(isIncomplete("echo 'hello")).toBe(true);
  });

  it('returns false for complete input', () => {
    expect(isIncomplete('echo hello')).toBe(false);
  });

  it('detects trailing backslash', () => {
    expect(isIncomplete('echo hello \\')).toBe(true);
  });
});

describe('joinContinuations', () => {
  it('joins backslash-terminated lines', () => {
    expect(joinContinuations(['hello\\', 'world'])).toBe('helloworld');
  });
});

describe('parseCommandChain', () => {
  it('parses simple command', () => {
    const tokens = tokenize('ls -la');
    const chain = parseCommandChain(tokens);
    expect(chain.pipelines.length).toBeGreaterThanOrEqual(1);
    expect(chain.pipelines[0].pipeline.commands[0].args).toEqual(['ls', '-la']);
  });
});
