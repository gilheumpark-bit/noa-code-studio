// ============================================================
// Code Studio Harness — 3-Gate Verification Loop
// ============================================================
// Gate 1: AST Scanner (구조 검증 — 빈깡통, 미사용 파라미터, 더미 리턴)
// Gate 2: Linter + Type Checker (연결 검증 — tsc + eslint)
// Gate 3: TDD Sandbox (동적 검증 — jest 실행 + 커버리지)
// 모든 게이트 통과 시에만 최종 승인.

import type { WebContainerInstance } from '@/lib/code-studio/features/webcontainer';
import { scanForHollowCode, type HollowCodeFinding } from '@noa/quill-engine/pipeline/ast-hollow-scanner';
import { buildHarnessFeedback, type HarnessFeedback } from '@/lib/code-studio/harness/adversarial-core';

export interface HarnessResult {
  success: boolean;
  iterations: number;
  maxIterations: number;
  buildErrors: ParsedError[];
  testErrors: ParsedError[];
  lintErrors: ParsedError[];
  typeErrors: ParsedError[];
  /** Gate 1: AST 빈깡통 감지 결과 */
  hollowFindings: HollowCodeFinding[];
  finalOutput: string;
  /** Machine-readable AI 피드백 (실패 시 생성) */
  feedback?: HarnessFeedback;
}

export interface ParsedError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  source: 'build' | 'test' | 'lint' | 'typecheck';
  code?: string;
}

export interface HarnessConfig {
  maxIterations: number;
  /** 실행할 검증 단계 */
  steps: Array<'build' | 'typecheck' | 'lint' | 'test'>;
  /** 빌드 명령어 */
  buildCommand: string;
  /** 테스트 명령어 */
  testCommand: string;
  /** 린트 명령어 */
  lintCommand: string;
  /** 타입체크 명령어 */
  typecheckCommand: string;
  /** 진행 콜백 */
  onProgress?: (step: string, iteration: number, errors: ParsedError[]) => void;
  /** 수정 요청 콜백 — AI에게 에러를 보내고 수정 코드를 받음 */
  onFixRequest: (errors: ParsedError[], code: string) => Promise<string | null>;
}

const DEFAULT_CONFIG: HarnessConfig = {
  maxIterations: 3,
  steps: ['typecheck', 'lint', 'build', 'test'],
  buildCommand: 'npm run build',
  testCommand: 'npm test -- --no-coverage --passWithNoTests',
  lintCommand: 'npm run lint',
  typecheckCommand: 'npx tsc --noEmit',
  onFixRequest: async () => null,
};

/** WebContainer에서 명령 실행 + 에러 파싱 */
async function runCommand(
  wc: WebContainerInstance,
  command: string,
  source: ParsedError['source'],
): Promise<{ exitCode: number; errors: ParsedError[]; output: string }> {
  const result = await wc.run(command);
  const output = `${result.stdout}\n${result.stderr}`;
  const errors: ParsedError[] = [];

  if (result.exitCode !== 0) {
    const lines = output.split('\n');
    for (const line of lines) {
      const parsed = parseSingleError(line, source);
      if (parsed) errors.push(parsed);
    }
    // 파싱 못 한 에러가 있으면 전체 출력을 하나의 에러로
    if (errors.length === 0 && result.stderr.trim()) {
      errors.push({ file: '', line: 0, column: 0, message: result.stderr.slice(0, 500), severity: 'error', source });
    }
  }

  return { exitCode: result.exitCode, errors, output };
}

/** 에러 한 줄 파싱 (TypeScript, ESLint, Build 공통) */
function parseSingleError(line: string, source: ParsedError['source']): ParsedError | null {
  // TypeScript: src/App.tsx(10,5): error TS2304: Cannot find name 'foo'
  const tsMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (tsMatch) {
    return { file: tsMatch[1], line: parseInt(tsMatch[2]), column: parseInt(tsMatch[3]), message: tsMatch[5], severity: 'error', source, code: tsMatch[4] };
  }

  // ESLint: src/App.tsx:10:5 - error: 'foo' is not defined (no-undef)
  const eslintMatch = line.match(/^(.+?):(\d+):(\d+)\s+-\s+(error|warning):\s+(.+?)(?:\s+\((.+)\))?$/);
  if (eslintMatch) {
    return { file: eslintMatch[1], line: parseInt(eslintMatch[2]), column: parseInt(eslintMatch[3]), message: eslintMatch[5], severity: eslintMatch[4] as 'error' | 'warning', source, code: eslintMatch[6] };
  }

  // 일반 에러: Error: Something went wrong
  const genericMatch = line.match(/^(?:Error|error|ERROR):\s+(.+)$/);
  if (genericMatch) {
    return { file: '', line: 0, column: 0, message: genericMatch[1], severity: 'error', source };
  }

  // Jest: FAIL src/App.test.tsx
  const jestMatch = line.match(/^\s*FAIL\s+(.+)$/);
  if (jestMatch) {
    return { file: jestMatch[1], line: 0, column: 0, message: `Test suite failed: ${jestMatch[1]}`, severity: 'error', source: 'test' };
  }

  return null;
}

/**
 * 하네스 메인 루프: 빌드 → 에러 → AI 수정 → 재빌드 (최대 N회)
 */
export async function runHarnessLoop(
  wc: WebContainerInstance,
  initialCode: string,
  config: Partial<HarnessConfig> = {},
): Promise<HarnessResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let currentCode = initialCode;
  let iteration = 0;

  const allBuildErrors: ParsedError[] = [];
  const allTestErrors: ParsedError[] = [];
  const allLintErrors: ParsedError[] = [];
  const allTypeErrors: ParsedError[] = [];
  let allHollowFindings: HollowCodeFinding[] = [];

  while (iteration < cfg.maxIterations) {
    iteration++;
    let hasErrors = false;

    // ── Gate 1: AST Hollow Scanner (구조 검증) ──
    cfg.onProgress?.('ast-scan', iteration, []);
    const hollowResult = scanForHollowCode(currentCode, 'main');
    const hollowErrors = hollowResult.filter(f => f.severity === 'error');
    allHollowFindings = hollowResult;
    if (hollowErrors.length > 0) {
      hasErrors = true;
      cfg.onProgress?.('ast-scan', iteration, hollowErrors.map(f => ({
        file: f.file, line: f.line, column: 0, message: f.message, severity: 'error' as const, source: 'build' as const,
      })));
      // AST 에러를 AI에게 피드백
      if (iteration < cfg.maxIterations) {
        const fixedCode = await cfg.onFixRequest(hollowErrors.map(f => ({
          file: f.file, line: f.line, column: 0, message: `[AST] ${f.type}: ${f.message}`, severity: 'error' as const, source: 'build' as const,
        })), currentCode);
        if (fixedCode) { currentCode = fixedCode; continue; }
      }
    }

    // ── Gate 2+3: Build/Type/Lint/Test ──
    for (const step of cfg.steps) {
      const command = {
        build: cfg.buildCommand,
        test: cfg.testCommand,
        lint: cfg.lintCommand,
        typecheck: cfg.typecheckCommand,
      }[step];

      cfg.onProgress?.(step, iteration, []);

      const result = await runCommand(wc, command, step as ParsedError['source']);

      if (result.exitCode !== 0 && result.errors.length > 0) {
        hasErrors = true;

        // 에러 분류
        for (const err of result.errors) {
          switch (err.source) {
            case 'build': allBuildErrors.push(err); break;
            case 'test': allTestErrors.push(err); break;
            case 'lint': allLintErrors.push(err); break;
            case 'typecheck': allTypeErrors.push(err); break;
          }
        }

        cfg.onProgress?.(step, iteration, result.errors);

        // AI에게 수정 요청
        if (iteration < cfg.maxIterations) {
          const fixedCode = await cfg.onFixRequest(result.errors, currentCode);
          if (fixedCode) {
            currentCode = fixedCode;
            // 다음 반복에서 수정된 코드로 재실행
            break; // 현재 step 루프 탈출, 다음 iteration으로
          }
        }
      }
    }

    if (!hasErrors) {
      return {
        success: true,
        iterations: iteration,
        maxIterations: cfg.maxIterations,
        buildErrors: [],
        testErrors: [],
        lintErrors: [],
        typeErrors: [],
        hollowFindings: [],
        finalOutput: currentCode,
      };
    }
  }

  // [GATE-SPY/FUZZ/MUT] 실패 시 구조화 JSON 피드백 생성
  const allErrors = [...allBuildErrors, ...allTestErrors, ...allLintErrors, ...allTypeErrors];
  const gateResults = [{
    gate: allHollowFindings.length > 0 ? 'GATE-AST' : allBuildErrors.length > 0 ? 'GATE-BUILD' : 'GATE-TEST',
    passed: false,
    findings: allErrors.slice(0, 10).map(e => e.message),
    score: 0,
    durationMs: 0,
  }];
  const hollowMsgs = allHollowFindings.map(f => f.message);
  const buildMsgs = allErrors.map(e => `[${e.source}] ${e.file}:${e.line} ${e.message}`);
  const feedback = buildHarnessFeedback(gateResults, hollowMsgs, buildMsgs);

  return {
    success: false,
    iterations: iteration,
    maxIterations: cfg.maxIterations,
    buildErrors: allBuildErrors,
    testErrors: allTestErrors,
    lintErrors: allLintErrors,
    typeErrors: allTypeErrors,
    hollowFindings: allHollowFindings,
    finalOutput: currentCode,
    feedback,
  };
}

/** 에러를 에이전트 프롬프트로 변환 */
export function errorsToPrompt(errors: ParsedError[], feedback?: HarnessFeedback): string {
  if (errors.length === 0 && !feedback) return '';
  const parts: string[] = [];

  // Machine-readable JSON 피드백 (AI가 구조화 데이터로 정확히 이해)
  if (feedback && feedback.system_action === 'REJECTED_BY_HARNESS') {
    parts.push('## [SYSTEM HARNESS REJECTION]\n');
    parts.push('```json');
    parts.push(JSON.stringify({
      system_action: feedback.system_action,
      error_type: feedback.error_type,
      harness_trigger: feedback.harness_trigger,
      actual_behavior: feedback.actual_behavior,
      expected_behavior: feedback.expected_behavior,
      strict_instruction: feedback.strict_instruction,
    }, null, 2));
    parts.push('```\n');
  }

  // 기존 에러 목록
  if (errors.length > 0) {
    const grouped = new Map<string, ParsedError[]>();
    for (const err of errors) {
      const key = err.file || 'unknown';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(err);
    }

    parts.push('## Build/Test Errors to Fix\n');
    for (const [file, errs] of grouped) {
      parts.push(`### ${file}`);
      for (const err of errs) {
        parts.push(`- Line ${err.line}: [${err.source}] ${err.message}${err.code ? ` (${err.code})` : ''}`);
      }
    }
  }

  return parts.join('\n');
}
