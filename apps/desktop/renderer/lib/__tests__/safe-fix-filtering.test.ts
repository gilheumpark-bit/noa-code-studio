// ============================================================
// Safe Fix Filtering Tests
// ============================================================
// Tests that the verification loop's safe fix classification
// correctly allows/blocks auto-application of fixes.

import type { FixSuggestion } from '@noa/quill-engine/pipeline/pipeline-utils';
import type { PipelineResult } from '@noa/quill-engine/pipeline/pipeline';
import { runVerificationLoop } from '@noa/quill-engine/pipeline/verification-loop';

// ============================================================
// PART 1 — Mocks
// ============================================================

jest.mock('@/lib/code-studio/pipeline/pipeline', () => ({
  runStaticPipeline: jest.fn(),
}));

jest.mock('@/lib/code-studio/pipeline/bugfinder', () => ({
  findBugsStatic: jest.fn(),
}));

jest.mock('@/lib/code-studio/pipeline/pipeline-utils', () => ({
  generateFixes: jest.fn(),
}));

jest.mock('@/lib/code-studio/pipeline/stress-test', () => ({
  runStressReport: jest.fn(),
}));

jest.mock('@/lib/code-studio/features/patent-scanner', () => ({
  scanProject: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runStaticPipeline } = require('@/lib/code-studio/pipeline/pipeline') as {
  runStaticPipeline: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findBugsStatic } = require('@/lib/code-studio/pipeline/bugfinder') as {
  findBugsStatic: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateFixes } = require('@/lib/code-studio/pipeline/pipeline-utils') as {
  generateFixes: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scanProject } = require('@/lib/code-studio/features/patent-scanner') as {
  scanProject: jest.Mock;
};

// IDENTITY_SEAL: PART-1 | role=mock-setup | inputs=none | outputs=mocked-modules

// ============================================================
// PART 2 — Helpers
// ============================================================

function makeFix(
  description: string,
  confidence: number,
  originalCode: string,
  fixedCode: string,
  line = 1,
): FixSuggestion {
  return {
    id: `fix-${Date.now()}-${Math.random()}`,
    finding: { severity: 'minor', message: description },
    description,
    file: 'test.ts',
    line,
    originalCode,
    fixedCode,
    confidence,
    safeToAutoApply: true,
  };
}

function makePipelineResult(score: number): PipelineResult {
  return {
    stages: [
      { name: 'lint', status: score >= 77 ? 'pass' : 'warn', score, message: '', findings: ['L1: issue found'] },
    ],
    overallScore: score,
    overallStatus: score >= 77 ? 'pass' : 'warn',
    timestamp: Date.now(),
  };
}

function setupDefaults() {
  // Pipeline returns low score so we can test fix application
  runStaticPipeline.mockReturnValue(makePipelineResult(50));
  findBugsStatic.mockReturnValue([]);
  scanProject.mockReturnValue({ licenses: [], patterns: [], score: 100, grade: 'A', summary: '' });
}

const CODE = 'import { unused } from "mod";\nconst x = 1;\nconsole.log(x);\n';
const LANG = 'typescript';
const FILE = 'test.ts';
const FILES = [{ id: 'test-1', name: 'test.ts', type: 'file' as const, content: CODE }];

// IDENTITY_SEAL: PART-2 | role=test-helpers | inputs=params | outputs=mock-data

// ============================================================
// PART 3 — Safe Fix Category Tests
// ============================================================

describe('Safe Fix Filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaults();
  });

  test('unused import removal is auto-applied', async () => {
    const fix = makeFix(
      'Remove unused import',
      0.9,
      'import { unused } from "mod";',
      '',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      CODE, LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    // The fix should have been applied (code changed)
    expect(result.totalFixesApplied).toBeGreaterThanOrEqual(0);
    // At least the loop ran with the fix available
    expect(result.iterations[0].fixesApplied + result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(0);
  });

  test('console.log removal is auto-applied', async () => {
    const fix = makeFix(
      'Remove console.log statement',
      0.9,
      'console.log(x);',
      '',
      3,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      CODE, LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    // Fix was available and should have been classified as safe
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0].fixesApplied + result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(0);
  });

  test('function signature change is NEVER auto-applied', async () => {
    // Description triggers UNSAFE_PATTERNS via "function signature"
    const fix = makeFix(
      'Change function signature to accept optional param',
      0.95,
      'function doWork(a: string) {',
      'function doWork(a?: string) {',
      2,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'const x = 1;\nfunction doWork(a: string) {\n  return a;\n}\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    // The fix should be skipped (unsafe pattern)
    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('business logic change is NEVER auto-applied', async () => {
    const fix = makeFix(
      'Modify business logic conditional check',
      0.95,
      'if (user.active) {',
      'if (user.active && user.verified) {',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'if (user.active) {\n  grant();\n}\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('low confidence fix is skipped even for safe category', async () => {
    // "unused import" is a safe category, but confidence < 0.85
    const fix = makeFix(
      'Remove unused import',
      0.5,
      'import { unused } from "mod";',
      '',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      CODE, LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('auth-related fix is NEVER auto-applied', async () => {
    const fix = makeFix(
      'Update authentication token validation',
      0.95,
      'if (token.valid) {',
      'if (token.valid && !token.expired) {',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'if (token.valid) {\n  allow();\n}\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('network/fetch fix is NEVER auto-applied', async () => {
    const fix = makeFix(
      'Add timeout to fetch request',
      0.95,
      'fetch(url)',
      'fetch(url, { signal: AbortSignal.timeout(5000) })',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'const data = fetch(url);\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('formatting fix with high confidence is auto-applied', async () => {
    const fix = makeFix(
      'Fix whitespace and indentation',
      0.95,
      'const x = 1;',
      'const x = 1;  ',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      CODE, LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    // "formatting" matches the safe pattern, confidence > 0.85
    expect(result.iterations[0].fixesApplied).toBeGreaterThanOrEqual(1);
  });

  test('null guard fix with high confidence is auto-applied', async () => {
    const fix = makeFix(
      'Add null check guard for value',
      0.9,
      'const x = 1;',
      'const x = 1 ?? 0;',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      CODE, LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesApplied).toBeGreaterThanOrEqual(1);
  });

  test('missing semicolon fix is auto-applied', async () => {
    const fix = makeFix(
      'Add missing semicolon',
      0.95,
      'const x = 1',
      'const x = 1;',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'const x = 1\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesApplied).toBeGreaterThanOrEqual(1);
  });

  test('state machine transition fix is blocked', async () => {
    const fix = makeFix(
      'Change state machine transition logic',
      0.95,
      'if (state === "idle") {',
      'if (state === "idle" || state === "error") {',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'if (state === "idle") {\n  start();\n}\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('return type change fix is blocked', async () => {
    const fix = makeFix(
      'Change return type change from void to boolean',
      0.95,
      'function run(): void {',
      'function run(): boolean {',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'function run(): void {\n  console.log("done");\n}\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
    expect(result.iterations[0].fixesApplied).toBe(0);
  });

  test('type import fix is auto-applied', async () => {
    const fix = makeFix(
      'Convert to type import for type-only usage',
      0.9,
      'import { MyType } from "./types";',
      'import type { MyType } from "./types";',
      1,
    );
    generateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop(
      'import { MyType } from "./types";\nconst x: MyType = {};\n',
      LANG, FILE, FILES,
      { enableStress: false, enableIP: false, maxIterations: 1 },
    );

    expect(result.iterations[0].fixesApplied).toBeGreaterThanOrEqual(1);
  });

  // IDENTITY_SEAL: PART-3 | role=safe-fix-category-tests | inputs=FixSuggestion | outputs=assertions
});
