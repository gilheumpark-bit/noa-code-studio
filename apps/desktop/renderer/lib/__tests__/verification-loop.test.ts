// @ts-nocheck
/**
 * Unit tests for src/lib/code-studio-verification-loop.ts
 * Covers: single-round pass, hard gate fail, no-progress stop,
 *         no-fixes stop, max iterations, safe fix filtering, onProgress callback
 */

import { runVerificationLoop, type VerificationConfig } from '@noa/quill-engine/pipeline/verification-loop';
import type { PipelineResult, PipelineStage } from '@noa/quill-engine/pipeline/pipeline';
import type { BugReport } from '@noa/quill-engine/pipeline/bugfinder';
import type { FixSuggestion } from '@noa/quill-engine/pipeline/pipeline-utils';
import type { StressReport } from '@noa/quill-engine/pipeline/stress-test';
import type { IPReport } from '@noa/quill-engine/patent-scanner';
import type { FileNode } from '@/lib/code-studio/core/types';

// ============================================================
// PART 1 — Mock Setup
// ============================================================

const mockRunStaticPipeline = jest.fn<PipelineResult, [string, string]>();
const mockFindBugsStatic = jest.fn<BugReport[], [string, string]>();
const mockGenerateFixes = jest.fn<FixSuggestion[], [unknown, unknown]>();
const mockRunStressReport = jest.fn<Promise<StressReport>, [string, string]>();
const mockScanProject = jest.fn<IPReport, [FileNode[]]>();

jest.mock('@noa/quill-engine/pipeline/pipeline', () => ({
  runStaticPipeline: (...args: unknown[]) => mockRunStaticPipeline(...(args as [string, string])),
}));
jest.mock('@noa/quill-engine/pipeline/bugfinder', () => ({
  findBugsStatic: (...args: unknown[]) => mockFindBugsStatic(...(args as [string, string])),
}));
jest.mock('@noa/quill-engine/pipeline/pipeline-utils', () => ({
  generateFixes: (...args: unknown[]) => mockGenerateFixes(...(args as [unknown, unknown])),
}));
jest.mock('@noa/quill-engine/pipeline/stress-test', () => ({
  runStressReport: (...args: unknown[]) => mockRunStressReport(...(args as [string, string])),
}));
jest.mock('@noa/quill-engine/patent-scanner', () => ({
  scanProject: (...args: unknown[]) => mockScanProject(...(args as [FileNode[]])),
}));

// ============================================================
// PART 2 — Helpers
// ============================================================

function makePipelineResult(score: number, status: 'pass' | 'warn' | 'fail', findings: string[] = []): PipelineResult {
  const stage: PipelineStage = {
    name: 'test-stage',
    status,
    score,
    message: 'test',
    findings,
  };
  return { stages: [stage], overallScore: score, overallStatus: status, timestamp: Date.now() };
}

function makeBugReport(severity: BugReport['severity'] = 'low'): BugReport {
  return {
    id: `bug-${Date.now()}`,
    severity,
    line: 1,
    description: 'test bug',
    suggestion: 'fix it',
    category: 'logic',
  };
}

function makeFix(overrides: Partial<FixSuggestion> = {}): FixSuggestion {
  return {
    id: `fix-${Date.now()}`,
    finding: { severity: 'minor', message: 'test' },
    description: 'Remove unused import',
    file: 'test.ts',
    line: 1,
    originalCode: 'const x = 1;',
    fixedCode: '// fixed',
    confidence: 0.9,
    safeToAutoApply: true,
    ...overrides,
  };
}

const baseConfig: Partial<VerificationConfig> = {
  maxIterations: 3,
  passThreshold: 77,
  enableStress: false,
  enableIP: false,
};

const dummyFiles: FileNode[] = [];

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// PART 3 — Single Round Pass
// ============================================================

describe('runVerificationLoop', () => {
  test('single round pass — score above threshold with no hard gates', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    expect(result.stopReason).toBe('passed');
    expect(result.iterations).toHaveLength(1);
    expect(result.finalScore).toBeGreaterThanOrEqual(77);
    expect(result.finalStatus).toBe('pass');
    expect(result.originalCode).toBe('const a = 1;');
  });

  // ============================================================
  // PART 4 — Hard Gate Fail
  // ============================================================

  test('hard gate fail — critical bugs cause failure regardless of score', async () => {
    // Score is high but there are critical bugs
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(95, 'pass'));
    mockFindBugsStatic.mockReturnValue([makeBugReport('critical')]);
    mockGenerateFixes.mockReturnValue([]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, {
      ...baseConfig,
      maxIterations: 3,
    });

    // With critical bugs, the hard gate check catches it.
    // The loop may not stop at round 1 if combined score is still above threshold
    // (because score formula penalizes critical bugs by 25 points each),
    // but it should eventually fail with hard-gate-fail at maxIterations.
    expect(result.hardGateFailures.length).toBeGreaterThan(0);
    expect(result.hardGateFailures[0]).toContain('critical bugs');
  });

  // ============================================================
  // PART 5 — No Progress Stop
  // ============================================================

  test('no-progress stop — same score each round triggers no-progress', async () => {
    // Round 1: score 60, Round 2: score 60 (delta < 2 => no-progress)
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(60, 'warn'));
    mockFindBugsStatic.mockReturnValue([]);

    // Return a fix that actually changes code on round 1 to avoid no-fixes on round 2
    const fix = makeFix({
      description: 'Remove unused import',
      originalCode: 'const a = 1;',
      fixedCode: 'const a = 1; // fixed',
      confidence: 0.9,
    });
    mockGenerateFixes.mockReturnValue([fix]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    expect(result.stopReason).toBe('no-progress');
    expect(result.iterations.length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================
  // PART 6 — No Fixes Stop
  // ============================================================

  test('no-fixes stop — findings exist but no fixable ones', async () => {
    // Score below threshold, findings exist but generateFixes returns empty
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(50, 'fail', ['L1: some issue']));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    // Round 1: appliedCount = 0, but round > 1 check means no-fixes only fires from round 2+
    // Since no fixes are applied and no progress, it should stop
    // Actually on round 1, appliedCount=0 does NOT trigger no-fixes (requires round > 1)
    // Round 2: same thing, appliedCount=0 and round > 1 => 'no-fixes'
    expect(result.stopReason).toBe('no-fixes');
    expect(result.iterations.length).toBe(2);
  });

  // ============================================================
  // PART 7 — Max Iterations
  // ============================================================

  test('max iterations — improving but never passing threshold', async () => {
    let callCount = 0;
    mockRunStaticPipeline.mockImplementation(() => {
      callCount++;
      // Scores: 50, 55, 60 — always below 77
      const score = 45 + callCount * 5;
      return makePipelineResult(score, 'warn');
    });
    mockFindBugsStatic.mockReturnValue([]);

    // Each round provides a fix that changes the code
    let fixCallCount = 0;
    mockGenerateFixes.mockImplementation(() => {
      fixCallCount++;
      return [makeFix({
        description: 'Remove unused import',
        originalCode: fixCallCount === 1 ? 'const a = 1;' : `// round ${fixCallCount - 1}`,
        fixedCode: `// round ${fixCallCount}`,
        confidence: 0.9,
      })];
    });

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    expect(result.stopReason).toBe('max-iterations');
    expect(result.iterations).toHaveLength(3);
  });

  // ============================================================
  // PART 8 — Safe Fix Filtering
  // ============================================================

  test('safe fix filtering — only safe categories get applied', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);

    const safeFix = makeFix({
      description: 'Remove unused import',
      originalCode: 'import { x } from "y";',
      fixedCode: '// removed',
      confidence: 0.9,
    });

    const unsafeFix = makeFix({
      description: 'Change business logic in handler',
      originalCode: 'return true;',
      fixedCode: 'return false;',
      confidence: 0.9,
    });

    mockGenerateFixes.mockReturnValue([safeFix, unsafeFix]);

    const result = await runVerificationLoop(
      'import { x } from "y";\nreturn true;',
      'typescript',
      'test.ts',
      dummyFiles,
      baseConfig,
    );

    // The safe fix applies, the unsafe one gets skipped
    expect(result.iterations[0].fixesSkipped).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // PART 9 — onProgress Callback
  // ============================================================

  test('onProgress fires for each round', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);

    const progressCalls: number[] = [];

    await runVerificationLoop(
      'const a = 1;',
      'typescript',
      'test.ts',
      dummyFiles,
      baseConfig,
      (iteration) => { progressCalls.push(iteration.round); },
    );

    expect(progressCalls).toEqual([1]);
  });

  test('onProgress fires for each of multiple rounds', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(50, 'fail'));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);

    const progressCalls: number[] = [];

    await runVerificationLoop(
      'const a = 1;',
      'typescript',
      'test.ts',
      dummyFiles,
      baseConfig,
      (iteration) => { progressCalls.push(iteration.round); },
    );

    // At least 2 rounds (round 1, then round 2 with no-fixes stop)
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[0]).toBe(1);
    expect(progressCalls[1]).toBe(2);
  });

  // ============================================================
  // PART 10 — finalCode Differs When Fixes Applied
  // ============================================================

  test('finalCode differs from originalCode when fixes are applied', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);

    const fix = makeFix({
      description: 'Remove unused import',
      originalCode: 'import { x } from "y";',
      fixedCode: '// removed import',
      confidence: 0.9,
    });
    mockGenerateFixes.mockReturnValue([fix]);

    const originalCode = 'import { x } from "y";\nconst a = 1;';
    const result = await runVerificationLoop(originalCode, 'typescript', 'test.ts', dummyFiles, baseConfig);

    expect(result.originalCode).toBe(originalCode);
    expect(result.finalCode).not.toBe(originalCode);
    expect(result.finalCode).toContain('// removed import');
  });

  // ============================================================
  // PART 11 — Stress & IP Integration
  // ============================================================

  test('stress grade F triggers hard gate failure', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);
    mockRunStressReport.mockResolvedValue({
      scenarios: [],
      overallScore: 10,
      grade: 'F',
      summary: 'terrible',
    });

    const result = await runVerificationLoop(
      'const a = 1;',
      'typescript',
      'test.ts',
      dummyFiles,
      { ...baseConfig, enableStress: true, maxIterations: 1 },
    );

    expect(result.hardGateFailures).toContain('stress: F');
  });

  test('IP grade F triggers hard gate failure', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);
    mockScanProject.mockReturnValue({
      licenses: [],
      patterns: [],
      score: 10,
      grade: 'F',
      summary: 'ip violation',
      recommendations: [],
    });

    const result = await runVerificationLoop(
      'const a = 1;',
      'typescript',
      'test.ts',
      dummyFiles,
      { ...baseConfig, enableIP: true, maxIterations: 1 },
    );

    expect(result.hardGateFailures).toContain('ip: F');
  });

  // ============================================================
  // PART 12 — Score Delta Calculation
  // ============================================================

  test('scoreDelta is zero when only one round runs', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    expect(result.scoreDelta).toBe(0);
  });

  // ============================================================
  // PART 13 — Pipeline/Bugfinder Error Resilience
  // ============================================================

  test('handles pipeline throw gracefully', async () => {
    mockRunStaticPipeline.mockImplementation(() => { throw new Error('pipeline crash'); });
    mockFindBugsStatic.mockReturnValue([]);
    mockGenerateFixes.mockReturnValue([]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    // Pipeline crash => score 0, status fail
    expect(result.iterations[0].pipelineScore).toBe(0);
    expect(result.finalStatus).toBe('fail');
  });

  test('handles bugfinder throw gracefully', async () => {
    mockRunStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
    mockFindBugsStatic.mockImplementation(() => { throw new Error('bugfinder crash'); });
    mockGenerateFixes.mockReturnValue([]);

    const result = await runVerificationLoop('const a = 1;', 'typescript', 'test.ts', dummyFiles, baseConfig);

    // Bugs fallback to empty array => no bug penalty
    expect(result.iterations[0].bugCount).toBe(0);
  });
});
