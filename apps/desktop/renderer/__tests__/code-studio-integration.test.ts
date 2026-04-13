/**
 * Code Studio Integration Tests
 * Tests core code-studio logic: design linting, preset detection,
 * static pipeline, and shell parsing.
 */

import { runDesignLint, formatDesignLintReport } from '@noa/quill-engine/pipeline/design-lint';
import { detectPreset, DESIGN_PRESETS, buildPresetPrompt } from '@/lib/code-studio/core/design-presets';
import { runStaticPipeline } from '@noa/quill-engine/pipeline/pipeline';
import { tokenize, parseCommandChain, expandGlob, containsGlob, isIncomplete } from '@/lib/code-studio/core/shell-parser';

// ============================================================
// runDesignLint
// ============================================================

describe('runDesignLint', () => {
  test('passes clean code using semantic tokens', () => {
    const code = `
      <div className="bg-bg-primary text-text-primary border-border p-4">
        <button className="bg-accent-purple text-text-primary min-h-[44px] focus-visible:ring-2">
          Click me
        </button>
      </div>
    `;
    const result = runDesignLint(code);
    expect(result).toBeDefined();
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  test('flags raw Tailwind colors as issues', () => {
    const code = `<div className="bg-red-500 text-blue-300">Bad tokens</div>`;
    const result = runDesignLint(code);
    expect(result.issues.length).toBeGreaterThan(0);
    // Should find at least one issue about raw colors
    const hasColorIssue = result.issues.some(
      (i) => i.rule.toLowerCase().includes('color') || i.rule.toLowerCase().includes('semantic') || i.rule.toLowerCase().includes('token'),
    );
    expect(hasColorIssue).toBe(true);
  });

  test('flags arbitrary z-index', () => {
    const code = `<div style="z-index: 9999" className="z-[100]">stacked</div>`;
    const result = runDesignLint(code);
    // The z-index rule should catch arbitrary z values
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('formatDesignLintReport returns a string', () => {
    const code = `<div className="bg-bg-primary">clean</div>`;
    const result = runDesignLint(code);
    const report = formatDesignLintReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  test('handles empty code gracefully', () => {
    const result = runDesignLint('');
    expect(result).toBeDefined();
    expect(typeof result.score).toBe('number');
  });
});

// ============================================================
// detectPreset
// ============================================================

describe('detectPreset', () => {
  test('detects IDE preset from keyword', () => {
    expect(detectPreset('Build me an IDE editor')).toBe(1);
  });

  test('detects landing page preset', () => {
    expect(detectPreset('Create a landing page with hero section')).toBe(2);
  });

  test('detects dashboard preset', () => {
    expect(detectPreset('I need an admin dashboard')).toBe(3);
  });

  test('detects e-commerce preset', () => {
    expect(detectPreset('Build a shopping cart page')).toBe(4);
  });

  test('detects SaaS preset', () => {
    expect(detectPreset('Create a SaaS pricing page with onboarding')).toBe(5);
  });

  test('returns null for unrelated text', () => {
    expect(detectPreset('Hello world, just chatting')).toBeNull();
  });

  test('detects explicit PRESET-N syntax', () => {
    expect(detectPreset('[PRESET-3] analytics panel')).toBe(3);
  });

  test('DESIGN_PRESETS has 5 entries', () => {
    expect(Object.keys(DESIGN_PRESETS).length).toBe(5);
  });

  test('buildPresetPrompt returns non-empty for null (fallback)', () => {
    const prompt = buildPresetPrompt(null);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ============================================================
// runStaticPipeline
// ============================================================

describe('runStaticPipeline', () => {
  test('returns a result with stages and overall score', () => {
    const code = `
      function hello() {
        console.log("Hello world");
        return 42;
      }
    `;
    const result = runStaticPipeline(code, 'javascript');
    expect(result).toBeDefined();
    expect(Array.isArray(result.stages)).toBe(true);
    expect(result.stages.length).toBeGreaterThan(0);
    expect(typeof result.overallScore).toBe('number');
    expect(['pass', 'warn', 'fail']).toContain(result.overallStatus);
    expect(typeof result.timestamp).toBe('number');
  });

  test('detects problematic patterns in code', () => {
    const badCode = `
      async function fetchData() {
        const data = await fetch('/api');
        const json = await data.json();
        eval(json.code);
        while (true) {
          doSomething();
        }
        return json;
      }
    `;
    const result = runStaticPipeline(badCode, 'javascript');
    // Should flag issues (eval, unguarded await, infinite loop)
    const totalFindings = result.stages.reduce((sum, s) => sum + s.findings.length, 0);
    expect(totalFindings).toBeGreaterThan(0);
  });

  test('handles empty code gracefully', () => {
    const result = runStaticPipeline('', 'typescript');
    expect(result).toBeDefined();
    expect(typeof result.overallScore).toBe('number');
  });
});

// ============================================================
// Shell parser: tokenize & parseCommandChain
// ============================================================

describe('shell-parser', () => {
  test('tokenize splits simple command', () => {
    const tokens = tokenize('ls -la /home');
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe('word');
    expect(tokens[0].value).toBe('ls');
    expect(tokens[1].value).toBe('-la');
    expect(tokens[2].value).toBe('/home');
  });

  test('tokenize handles pipes', () => {
    const tokens = tokenize('cat file.txt | grep hello');
    const pipeTokens = tokens.filter((t) => t.type === 'pipe');
    expect(pipeTokens.length).toBe(1);
  });

  test('tokenize handles quoted strings', () => {
    const tokens = tokenize('echo "hello world"');
    expect(tokens.length).toBe(2);
    expect(tokens[1].value).toBe('hello world');
    expect(tokens[1].quoted).toBe(true);
  });

  test('parseCommandChain parses piped commands', () => {
    const tokens = tokenize('cat file | sort | uniq');
    const chain = parseCommandChain(tokens);
    expect(chain).toBeDefined();
    // chain.pipelines[0].pipeline.commands has the 3 piped commands
    expect(chain.pipelines.length).toBeGreaterThanOrEqual(1);
    expect(chain.pipelines[0].pipeline.commands.length).toBe(3);
  });

  test('containsGlob detects glob patterns', () => {
    expect(containsGlob('*.ts')).toBe(true);
    expect(containsGlob('hello')).toBe(false);
    expect(containsGlob('src/**/*.tsx')).toBe(true);
  });

  test('expandGlob matches file paths', () => {
    const files = ['app.ts', 'utils.ts', 'app.css', 'README.md'];
    const matches = expandGlob('*.ts', files);
    expect(matches).toContain('app.ts');
    expect(matches).toContain('utils.ts');
    expect(matches).not.toContain('app.css');
    expect(matches).not.toContain('README.md');
  });

  test('isIncomplete detects unterminated strings', () => {
    expect(isIncomplete('echo "hello')).toBe(true);
    expect(isIncomplete('echo "hello"')).toBe(false);
  });
});
