// @ts-nocheck
// ============================================================
// Code Studio Harness — 적대적 AI 코드 검증 엔진
// ============================================================
// 3-Gate Backend + Frontend Gate + Adversarial Core + Headless First
// lazy import: const harness = await import('@/lib/code-studio/harness');

// Build-Test Loop (Backend 3-Gate)
export { runHarnessLoop, errorsToPrompt, type HarnessResult, type HarnessConfig, type ParsedError } from './build-test-loop';

// AST Hollow Scanner (Gate 1 Backend)
export { scanForHollowCode, scanProjectForHollowCode, type HollowCodeFinding } from '@noa/quill-engine/pipeline/ast-hollow-scanner';

// Frontend Gate 1: 5-State + Dead DOM
export { runFrontendGate1, scan5States, scanDeadDOM, type FrontendGateFinding } from '@noa/quill-engine/pipeline/frontend-gate1';

// Frontend Gate 2: Design Token Linter
export { runFrontendGate2, scanDesignTokens, type DesignTokenFinding } from '@noa/quill-engine/pipeline/frontend-gate2';

// Adversarial Core (Spy + Fuzz + Mutation)
export { analyzeSpyPatterns, generateFuzzInputs, extractFunctionParams, analyzeFuzzVulnerabilities, generateMutations, buildHarnessFeedback, type HarnessFeedback, type GateResult, type SpyReport, type FuzzResult } from './adversarial-core';

// Headless First Strategy (뼈대→검증→디자인→검증)
export { runHeadlessFirst, buildSkeletonPrompt, buildDesignPrompt, type HeadlessFirstConfig, type HeadlessFirstResult } from './headless-first';

// Dynamic Executor (WebContainer 런타임 검증 — Spy/Fuzz/Mutation/Visual)
export { runSpyTest, runFuzzTest, runMutationTest, runVisualTest, runDynamicSuite, type DynamicTestResult } from './dynamic-executor';

// Good Pattern Detector (양품 패턴 탐지 — false-positive 억제 + 점수 가산)
export { detectGoodPatterns, suppressFindings, downgradeFindings, type DetectedGoodPattern, type GoodPatternReport } from '@noa/quill-engine/pipeline/good-pattern-detector';

// ============================================================
// Master Harness — Fail-Fast 단일 진입점
// ============================================================
// Gate 1 (정적 0.1초) → Gate 2 (린터) → Gate 3 (동적 샌드박스)
// 앞단 실패 시 뒷단 스킵 → 비용 절감

import type { WebContainerInstance } from '@/lib/code-studio/features/webcontainer';
import type { HarnessFeedback, GateResult } from './adversarial-core';

export interface MasterHarnessResult {
  approved: boolean;
  gatesRun: number;
  gatesPassed: number;
  gateFailed?: string;
  results: GateResult[];
  feedback?: HarnessFeedback;
  totalDurationMs: number;
  /** 양품 패턴 탐지 결과 (good-pattern-catalog 기반) */
  goodPatterns?: import('@noa/quill-engine/pipeline/good-pattern-detector').GoodPatternReport;
}

/**
 * 무관용 마스터 하네스 — Fail-Fast 오케스트레이션
 *
 * 순서: 정적(빠름) → 동적(느림). 앞단 실패 시 뒷단 스킵.
 * Gate 1: AST 빈깡통 스캐너 (~0.1초)
 * Gate 2: Frontend Gate 1+2 — 5-State/DeadDOM/디자인토큰 (~0.2초)
 * Gate 3: 동적 샌드박스 — Spy/Fuzz/Mutation (~3초, 타임아웃 보호)
 */
export async function runMasterHarness(
  wc: WebContainerInstance,
  code: string,
  options?: {
    entryFunction?: string;
    testCode?: string;
    language?: string;
    skipDynamic?: boolean;
  },
): Promise<MasterHarnessResult> {
  const start = Date.now();
  const results: GateResult[] = [];
  const opts = { entryFunction: 'main', language: 'typescript', ...options };

  // ── Gate 1: AST 정적 스캔 (0.1초 — 빈깡통/pass/TODO 사냥) ──
  const { scanForHollowCode } = await import('@noa/quill-engine/pipeline/ast-hollow-scanner');
  const hollowFindings = scanForHollowCode(code, opts.entryFunction);
  const hollowErrors = hollowFindings.filter(f => f.severity === 'error');
  const gate1: GateResult = {
    gate: 'AST Hollow Scanner',
    gateId: 'GATE-AST',
    passed: hollowErrors.length === 0,
    findings: hollowErrors.map(f => f.message),
    score: hollowErrors.length === 0 ? 100 : Math.max(0, 100 - hollowErrors.length * 20),
    durationMs: Date.now() - start,
  };
  results.push(gate1);

  if (!gate1.passed) {
    const { buildHarnessFeedback } = await import('./adversarial-core');
    return {
      approved: false, gatesRun: 1, gatesPassed: 0, gateFailed: 'GATE-AST',
      results, feedback: buildHarnessFeedback(results, hollowErrors.map(f => f.message), []),
      totalDurationMs: Date.now() - start,
    };
  }

  // ── Gate 2: Frontend 정적 검사 (0.2초 — 5-State/DeadDOM/디자인토큰) ──
  const gate2Start = Date.now();
  const { runFrontendGate1 } = await import('@noa/quill-engine/pipeline/frontend-gate1');
  const { scanDesignTokens } = await import('@noa/quill-engine/pipeline/frontend-gate2');
  const fg1 = runFrontendGate1(code, opts.language);
  const fg2 = scanDesignTokens(code);
  const fg1Errors = fg1.findings.filter(f => f.severity === 'error');
  const fg2Errors = fg2.filter(f => f.severity === 'error');
  const gate2Findings = [...fg1Errors.map(f => f.message), ...fg2Errors.map(f => f.message)];
  const gate2: GateResult = {
    gate: 'Frontend Static Gates',
    gateId: 'GATE-BUILD',
    passed: gate2Findings.length === 0,
    findings: gate2Findings,
    score: gate2Findings.length === 0 ? 100 : Math.max(0, 100 - gate2Findings.length * 10),
    durationMs: Date.now() - gate2Start,
  };
  results.push(gate2);

  if (!gate2.passed) {
    const { buildHarnessFeedback } = await import('./adversarial-core');
    return {
      approved: false, gatesRun: 2, gatesPassed: 1, gateFailed: 'GATE-BUILD',
      results, feedback: buildHarnessFeedback(results, [], gate2Findings),
      totalDurationMs: Date.now() - start,
    };
  }

  // ── Gate 3: 동적 샌드박스 (3초 타임아웃 보호 — Spy/Fuzz/Mutation) ──
  if (opts.skipDynamic) {
    return {
      approved: true, gatesRun: 2, gatesPassed: 2,
      results, totalDurationMs: Date.now() - start,
    };
  }

  const gate3Start = Date.now();
  const { runDynamicSuite } = await import('./dynamic-executor');
  try {
    const dynamicResult = await runDynamicSuite(wc, code, {
      entryFunction: opts.entryFunction,
      testCode: opts.testCode,
    });
    const dynamicFailed = dynamicResult.results.filter(r => !r.passed);
    const gate3: GateResult = {
      gate: 'Dynamic Sandbox',
      gateId: 'GATE-SPY',
      passed: dynamicFailed.length === 0,
      findings: dynamicFailed.flatMap(r => r.findings),
      score: dynamicResult.results.length > 0
        ? Math.round(dynamicResult.results.reduce((s, r) => s + r.score, 0) / dynamicResult.results.length)
        : 100,
      durationMs: Date.now() - gate3Start,
    };
    results.push(gate3);

    if (!gate3.passed) {
      const { buildHarnessFeedback } = await import('./adversarial-core');
      return {
        approved: false, gatesRun: 3, gatesPassed: 2, gateFailed: 'GATE-SPY',
        results, feedback: buildHarnessFeedback(results, dynamicFailed.flatMap(r => r.findings), []),
        totalDurationMs: Date.now() - start,
      };
    }
  } catch (err) {
    // 타임아웃 또는 크래시
    const gate3: GateResult = {
      gate: 'Dynamic Sandbox',
      gateId: 'GATE-SPY',
      passed: false,
      findings: [`[GATE-SPY] 동적 테스트 실패: ${err}`],
      score: 0,
      durationMs: Date.now() - gate3Start,
    };
    results.push(gate3);
    const { buildHarnessFeedback } = await import('./adversarial-core');
    return {
      approved: false, gatesRun: 3, gatesPassed: 2, gateFailed: 'GATE-SPY',
      results, feedback: buildHarnessFeedback(results, [`${err}`], []),
      totalDurationMs: Date.now() - start,
    };
  }

  // ── Good Pattern Detection — 양품 패턴으로 finding 억제 + 점수 보정 ──
  const { detectGoodPatterns, downgradeFindings: downgrade } = await import('@noa/quill-engine/pipeline/good-pattern-detector');
  const goodReport = detectGoodPatterns(code);

  // 양품 패턴이 탐지되면 각 게이트 findings를 다운그레이드
  if (goodReport.suppressedRules.length > 0) {
    for (const gate of results) {
      gate.findings = downgrade(
        gate.findings.map(f => ({ severity: 'warning' as string, message: f, rule: f.match(/\[([A-Z]+-\w+)\]/)?.[1] })),
        goodReport,
      ).map(f => f.message);
      // 양품 보너스로 gate 점수 보정 (최대 +10)
      gate.score = Math.min(100, gate.score + Math.min(10, goodReport.scoreBonus));
    }
  }

  // ── 모든 게이트 통과 ──
  return {
    approved: true, gatesRun: 3, gatesPassed: 3,
    results, goodPatterns: goodReport, totalDurationMs: Date.now() - start,
  };
}
