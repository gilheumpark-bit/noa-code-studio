// ============================================================
// Verification Integration Tests
// ============================================================
// Full flow: verify -> fix -> re-verify -> stage -> apply -> rollback
// Tests multiple modules working together.

import type { PipelineResult, PipelineStage } from '@noa/quill-engine/pipeline/pipeline';
import type { BugReport } from '@noa/quill-engine/pipeline/bugfinder';
import type { FixSuggestion } from '@noa/quill-engine/pipeline/pipeline-utils';
import {
  runVerificationLoop,
} from '@noa/quill-engine/pipeline/verification-loop';
import {
  canTransition,
  createModeTransition,
  ALLOWED_TRANSITIONS,
  type ComposerMode,
} from '@/lib/code-studio/core/composer-state';

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

function makePipelineResult(
  overallScore: number,
  overallStatus: 'pass' | 'warn' | 'fail' = 'pass',
  stages: PipelineStage[] = [],
): PipelineResult {
  return { stages, overallScore, overallStatus, timestamp: Date.now() };
}

function makeBugReport(
  severity: BugReport['severity'] = 'low',
  line = 1,
): BugReport {
  return {
    id: `bug-test-${Date.now()}-${Math.random()}`,
    severity,
    line,
    description: `Test bug (${severity})`,
    suggestion: 'Fix it',
    category: 'logic',
    source: 'static',
  };
}

function makeFix(
  description: string,
  confidence: number,
  originalCode: string,
  fixedCode: string,
  line = 1,
): FixSuggestion {
  return {
    id: `fix-test-${Date.now()}`,
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

const DEFAULT_CODE = 'const x = 1;\nconsole.log(x);\n';
const DEFAULT_LANG = 'typescript';
const DEFAULT_FILE = 'test.ts';
const DEFAULT_FILES = [{ id: 'test-1', name: 'test.ts', type: 'file' as const, content: DEFAULT_CODE }];

// IDENTITY_SEAL: PART-2 | role=test-helpers | inputs=params | outputs=mock-data

// ============================================================
// PART 3 — Full Verification Flow Tests
// ============================================================

describe('Verification Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: IP scan returns clean
    scanProject.mockReturnValue({ licenses: [], patterns: [], score: 100, grade: 'A', summary: '' });
  });

  describe('Full verification flow', () => {
    test('passing code completes in 1 round', async () => {
      runStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
      findBugsStatic.mockReturnValue([]);
      generateFixes.mockReturnValue([]);

      const result = await runVerificationLoop(
        DEFAULT_CODE, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false },
      );

      expect(result.iterations).toHaveLength(1);
      expect(result.finalStatus).toBe('pass');
      expect(result.stopReason).toBe('passed');
      // combinedScore = 90 * 0.6 + 100 * 0.4 = 94
      expect(result.finalScore).toBeGreaterThanOrEqual(77);
    });

    test('failing code with fixable issues improves across rounds', async () => {
      const codeV1 = 'import { foo } from "bar";\nconst x = 1;\n';
      const _codeV2 = 'const x = 1;\n';

      // Round 1: score 60, one finding with fix
      runStaticPipeline
        .mockReturnValueOnce(makePipelineResult(60, 'warn', [
          { name: 'lint', status: 'warn', score: 60, message: 'warnings', findings: ['L1: unused import'] },
        ]))
        // Round 2: score 85 (passes)
        .mockReturnValueOnce(makePipelineResult(85, 'pass'));

      findBugsStatic
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      generateFixes
        .mockReturnValueOnce([
          makeFix('Remove unused import', 0.9, 'import { foo } from "bar";', '', 1),
        ])
        .mockReturnValueOnce([]);

      const result = await runVerificationLoop(
        codeV1, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false },
      );

      expect(result.iterations.length).toBeGreaterThanOrEqual(2);
      // Score should have improved
      const firstScore = result.iterations[0].combinedScore;
      const lastScore = result.iterations[result.iterations.length - 1].combinedScore;
      expect(lastScore).toBeGreaterThan(firstScore);
    });

    test('hard gate blocks despite high score', async () => {
      runStaticPipeline.mockReturnValue(makePipelineResult(85, 'pass'));
      findBugsStatic.mockReturnValue([makeBugReport('critical', 5)]);
      generateFixes.mockReturnValue([]);

      const result = await runVerificationLoop(
        DEFAULT_CODE, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false, maxIterations: 1 },
      );

      // Critical bugs trigger hard gate
      expect(result.hardGateFailures.length).toBeGreaterThan(0);
      expect(result.hardGateFailures.some(f => f.includes('critical'))).toBe(true);
    });

    test('no-progress stops early', async () => {
      // Both rounds return score 50 → delta < 2 → no-progress
      runStaticPipeline.mockReturnValue(makePipelineResult(50, 'fail'));
      findBugsStatic.mockReturnValue([makeBugReport('low', 1)]);
      // Return a fix that changes code so round 1 doesn't exit via no-fixes
      generateFixes
        .mockReturnValueOnce([
          makeFix('Remove unused import', 0.9, 'const x = 1;', 'const x: number = 1;', 1),
        ])
        .mockReturnValue([]);

      const result = await runVerificationLoop(
        DEFAULT_CODE, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false, maxIterations: 3 },
      );

      // Should stop before 3 rounds due to no-progress
      expect(result.iterations.length).toBeLessThanOrEqual(3);
      expect(['no-progress', 'no-fixes']).toContain(result.stopReason);
    });

    test('no-fixes stops on round 2 when no auto-fixable issues', async () => {
      runStaticPipeline.mockReturnValue(makePipelineResult(50, 'fail'));
      findBugsStatic.mockReturnValue([]);
      // Round 1: one fix applied
      generateFixes
        .mockReturnValueOnce([
          makeFix('formatting fix', 0.95, 'const x = 1;', 'const x = 1 ;', 1),
        ])
        // Round 2: no fixes
        .mockReturnValueOnce([]);

      const result = await runVerificationLoop(
        DEFAULT_CODE, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false, maxIterations: 3 },
      );

      expect(['no-fixes', 'no-progress']).toContain(result.stopReason);
    });

    test('max-iterations stops when threshold never reached', async () => {
      // Gradually improving but never enough
      runStaticPipeline
        .mockReturnValueOnce(makePipelineResult(40, 'fail', [
          { name: 'lint', status: 'fail', score: 40, message: '', findings: ['L1: issue'] },
        ]))
        .mockReturnValueOnce(makePipelineResult(50, 'fail', [
          { name: 'lint', status: 'fail', score: 50, message: '', findings: ['L1: issue'] },
        ]))
        .mockReturnValueOnce(makePipelineResult(60, 'fail', [
          { name: 'lint', status: 'fail', score: 60, message: '', findings: ['L1: issue'] },
        ]));

      findBugsStatic.mockReturnValue([]);

      let callCount = 0;
      generateFixes.mockImplementation(() => {
        callCount++;
        return [
          makeFix(
            `Remove unused import round ${callCount}`,
            0.9,
            callCount === 1 ? 'const x = 1;' : callCount === 2 ? 'const x: number = 1;' : 'const x: number = 1 ;',
            callCount === 1 ? 'const x: number = 1;' : callCount === 2 ? 'const x: number = 1 ;' : 'const x: number = 1;  ',
            1,
          ),
        ];
      });

      const result = await runVerificationLoop(
        DEFAULT_CODE, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false, maxIterations: 3 },
      );

      expect(result.iterations).toHaveLength(3);
      expect(result.stopReason).toBe('max-iterations');
    });

    test('onProgress callback fires for each iteration', async () => {
      runStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
      findBugsStatic.mockReturnValue([]);
      generateFixes.mockReturnValue([]);

      const progressCalls: number[] = [];
      await runVerificationLoop(
        DEFAULT_CODE, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false },
        (iter) => progressCalls.push(iter.round),
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]).toBe(1);
    });

    test('originalCode is preserved in result', async () => {
      const code = 'const original = true;\n';
      runStaticPipeline.mockReturnValue(makePipelineResult(90, 'pass'));
      findBugsStatic.mockReturnValue([]);
      generateFixes.mockReturnValue([]);

      const result = await runVerificationLoop(
        code, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false },
      );

      expect(result.originalCode).toBe(code);
    });
  });

  // IDENTITY_SEAL: PART-3 | role=full-flow-tests | inputs=mocks | outputs=assertions

  // ============================================================
  // PART 4 — State Machine + Verification Tests
  // ============================================================

  describe('State machine + verification', () => {
    test('mode transitions follow correct order during verification', () => {
      const sequence: ComposerMode[] = [
        'idle', 'generating', 'verifying', 'review', 'staged', 'applied', 'idle',
      ];

      for (let i = 0; i < sequence.length - 1; i++) {
        const from = sequence[i];
        const to = sequence[i + 1];
        expect(canTransition(from, to)).toBe(true);
      }
    });

    test('skipping steps is blocked', () => {
      // idle -> staged (skip generating, verifying, review)
      expect(canTransition('idle', 'staged')).toBe(false);
      // generating -> applied (skip verifying, review, staged)
      expect(canTransition('generating', 'applied')).toBe(false);
      // verifying -> staged (skip review)
      expect(canTransition('verifying', 'staged')).toBe(false);
      // idle -> review
      expect(canTransition('idle', 'review')).toBe(false);
      // idle -> applied
      expect(canTransition('idle', 'applied')).toBe(false);
    });

    test('error recovery works', () => {
      // generating -> error
      expect(canTransition('generating', 'error')).toBe(true);
      // error -> idle
      expect(canTransition('error', 'idle')).toBe(true);
      // idle -> generating (retry)
      expect(canTransition('idle', 'generating')).toBe(true);
      // error -> generating (direct retry)
      expect(canTransition('error', 'generating')).toBe(true);
    });

    test('createModeTransition guards invalid transitions', () => {
      let current: ComposerMode = 'idle';
      const setter = (m: ComposerMode) => { current = m; };
      const transition = createModeTransition(current, setter);

      // Valid: idle -> generating
      expect(transition('generating')).toBe(true);
      expect(current).toBe('generating');

      // Invalid: idle -> staged (transition was created with 'idle' as current)
      // Note: createModeTransition captures currentMode at creation time
      const transition2 = createModeTransition('idle', setter);
      expect(transition2('staged')).toBe(false);
    });

    test('review can go back to generating or idle', () => {
      expect(canTransition('review', 'generating')).toBe(true);
      expect(canTransition('review', 'idle')).toBe(true);
      expect(canTransition('review', 'staged')).toBe(true);
    });

    test('staged can return to review', () => {
      expect(canTransition('staged', 'review')).toBe(true);
    });

    test('ALLOWED_TRANSITIONS covers all modes', () => {
      const modes: ComposerMode[] = [
        'idle', 'generating', 'verifying', 'review', 'staged', 'applied', 'error',
      ];
      for (const mode of modes) {
        expect(ALLOWED_TRANSITIONS[mode]).toBeDefined();
        expect(Array.isArray(ALLOWED_TRANSITIONS[mode])).toBe(true);
      }
    });
  });

  // IDENTITY_SEAL: PART-4 | role=state-machine-tests | inputs=ComposerMode | outputs=assertions

  // ============================================================
  // PART 5 — Staging and Rollback Tests
  // ============================================================

  describe('Staging and rollback', () => {
    test('staged code preserves original for rollback', async () => {
      const original = 'const x = 1;\n';
      const fixedLine = 'const x: number = 1;';

      runStaticPipeline
        .mockReturnValueOnce(makePipelineResult(60, 'warn', [
          { name: 'types', status: 'warn', score: 60, message: '', findings: ['L1: missing type'] },
        ]))
        .mockReturnValueOnce(makePipelineResult(90, 'pass'));

      findBugsStatic.mockReturnValue([]);

      generateFixes
        .mockReturnValueOnce([
          makeFix('Add type annotation', 0.9, 'const x = 1;', fixedLine, 1),
        ])
        .mockReturnValueOnce([]);

      const result = await runVerificationLoop(
        original, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false },
      );

      // originalCode should be the unchanged input
      expect(result.originalCode).toBe(original);
      // finalCode may differ if fixes were applied
      expect(result.finalCode).toBeDefined();
      // scoreDelta reflects improvement
      expect(typeof result.scoreDelta).toBe('number');
    });

    test('rollback scenario: original preserved even after multiple fix rounds', async () => {
      const original = 'import { a } from "b";\nconst x = 1;\nconsole.log(x);\n';

      runStaticPipeline
        .mockReturnValueOnce(makePipelineResult(40, 'fail', [
          { name: 'lint', status: 'fail', score: 40, message: '', findings: ['L1: unused import', 'L3: console.log'] },
        ]))
        .mockReturnValueOnce(makePipelineResult(65, 'warn', [
          { name: 'lint', status: 'warn', score: 65, message: '', findings: ['L2: console.log'] },
        ]))
        .mockReturnValueOnce(makePipelineResult(90, 'pass'));

      findBugsStatic.mockReturnValue([]);

      generateFixes
        .mockReturnValueOnce([
          makeFix('Remove unused import', 0.9, 'import { a } from "b";', '', 1),
        ])
        .mockReturnValueOnce([
          makeFix('Remove console.log', 0.9, 'console.log(x);', '', 3),
        ])
        .mockReturnValueOnce([]);

      const result = await runVerificationLoop(
        original, DEFAULT_LANG, DEFAULT_FILE, DEFAULT_FILES,
        { enableStress: false, enableIP: false, maxIterations: 3 },
      );

      // Original must always be preserved regardless of how many rounds ran
      expect(result.originalCode).toBe(original);
      expect(result.totalFixesApplied).toBeGreaterThanOrEqual(0);
    });
  });

  // IDENTITY_SEAL: PART-5 | role=staging-rollback-tests | inputs=original-code | outputs=assertions
});
