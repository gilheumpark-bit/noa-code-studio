// ============================================================
// Headless First Strategy — 뼈대 → 검증 → 디자인 → 검증
// ============================================================
// AI에게 기능(로직)과 디자인(스타일)을 동시에 짜라고 하면 빈깡통.
// 2단계로 분리: 뼈대(기능) → 검증 → 디자인 입히기 → 검증

import { runFrontendGate1 } from '@noa/quill-engine/pipeline/frontend-gate1';
import { runFrontendGate2 } from '@noa/quill-engine/pipeline/frontend-gate2';
import { analyzeSpyPatterns, analyzeFuzzVulnerabilities, buildHarnessFeedback, type GateResult, type HarnessFeedback } from './adversarial-core';

export interface HeadlessFirstConfig {
  /** Phase 1 프롬프트 (뼈대 생성) */
  skeletonPrompt: string;
  /** Phase 2 프롬프트 (디자인 입히기) */
  designPrompt: string;
  /** AI 호출 콜백 */
  callAI: (prompt: string) => Promise<string>;
  /** 진행 콜백 */
  onProgress?: (phase: string, message: string) => void;
}

export interface HeadlessFirstResult {
  /** 최종 코드 */
  code: string;
  /** Phase 1 결과 (뼈대) */
  skeletonCode: string;
  /** 전체 통과 여부 */
  approved: boolean;
  /** 피드백 */
  feedback: HarnessFeedback;
  /** 각 Phase 게이트 결과 */
  phaseResults: {
    phase1: { gate1: GateResult; spy: string[]; fuzz: string[] };
    phase2: { gate2: GateResult };
  };
}

/** Phase 1 검증: 뼈대 코드 (기능만, 스타일 없음) */
function verifyPhase1(code: string): { gate1: GateResult; spy: string[]; fuzz: string[] } {
  // Gate 1: 5-State + Dead DOM
  const g1 = runFrontendGate1(code);
  const gate1: GateResult = {
    gate: 'Frontend Gate 1 (5-State + Dead DOM)',
    passed: g1.passed,
    findings: g1.findings.map(f => f.message),
    score: g1.score,
  };

  // Spy: 하드코딩 리턴 감지
  const spyResult = analyzeSpyPatterns(code);
  const spy = spyResult.findings;

  // Fuzz: 방어 로직 누락 감지
  const fuzz = analyzeFuzzVulnerabilities(code);

  return { gate1, spy, fuzz };
}

/** Phase 2 검증: 디자인 토큰 린트 */
function verifyPhase2(code: string): { gate2: GateResult } {
  const g2 = runFrontendGate2(code);
  const gate2: GateResult = {
    gate: 'Frontend Gate 2 (Design Token)',
    passed: g2.passed,
    findings: g2.findings.map(f => f.message),
    score: g2.score,
  };
  return { gate2 };
}

/**
 * Headless First 전체 실행
 * Phase 1: 뼈대 생성 → Gate1 + Spy + Fuzz 검증
 * Phase 2: 디자인 입히기 → Gate2 검증
 */
export async function runHeadlessFirst(config: HeadlessFirstConfig): Promise<HeadlessFirstResult> {
  // ── Phase 1: 뼈대 생성 ──
  config.onProgress?.('phase1', '기능 뼈대 코드 생성 중...');
  const skeletonCode = await config.callAI(config.skeletonPrompt);

  // Phase 1 검증
  config.onProgress?.('phase1-verify', '뼈대 코드 검증 중 (5-State, Dead DOM, Spy, Fuzz)...');
  const phase1 = verifyPhase1(skeletonCode);

  const phase1Passed = phase1.gate1.passed && phase1.spy.length === 0 && phase1.fuzz.length === 0;

  if (!phase1Passed) {
    // Phase 1 실패 → 피드백 반환 (Phase 2 진행 안 함)
    const feedback = buildHarnessFeedback([phase1.gate1], phase1.spy, phase1.fuzz);
    return {
      code: skeletonCode,
      skeletonCode,
      approved: false,
      feedback,
      phaseResults: { phase1, phase2: { gate2: { gate: 'Frontend Gate 2', passed: false, findings: ['Phase 1 미통과로 스킵'], score: 0 } } },
    };
  }

  // ── Phase 2: 디자인 입히기 ──
  config.onProgress?.('phase2', '디자인 토큰 입히는 중...');
  const designedCode = await config.callAI(config.designPrompt + '\n\n[검증 통과한 뼈대 코드]:\n```\n' + skeletonCode + '\n```');

  // Phase 2 검증
  config.onProgress?.('phase2-verify', '디자인 검증 중 (토큰 린트)...');
  const phase2 = verifyPhase2(designedCode);

  const allPassed = phase2.gate2.passed;
  const feedback = buildHarnessFeedback(
    [phase1.gate1, phase2.gate2],
    phase1.spy,
    phase1.fuzz,
  );

  return {
    code: designedCode,
    skeletonCode,
    approved: allPassed,
    feedback,
    phaseResults: { phase1, phase2 },
  };
}

// ── Prompt Templates ──

/** Phase 1 프롬프트: 뼈대만 (스타일 없음) */
export function buildSkeletonPrompt(requirement: string): string {
  return `[HEADLESS FIRST — Phase 1: 기능 뼈대]

요구사항: ${requirement}

규칙:
1. 스타일(CSS, Tailwind, 색상)을 절대 넣지 마세요. 순수 HTML/React 뼈대만.
2. 반드시 5가지 상태를 분기 처리하세요:
   - Idle (초기 대기)
   - Loading (로딩 중 — 스피너/스켈레톤)
   - Empty (데이터 없음 — 안내 메시지)
   - Error (에러 — 재시도 버튼)
   - Success (정상 데이터)
3. 모든 <button>에 onClick, 모든 <input>에 onChange, 모든 <form>에 onSubmit을 넣으세요.
4. 모든 async 함수에 try-catch를 넣으세요.
5. 외부 API 호출이 있으면 실제 fetch/axios를 사용하세요. 하드코딩 return 금지.

출력: React/TypeScript 컴포넌트 코드만. 설명 없이.`;
}

/** Phase 2 프롬프트: 디자인 입히기 */
export function buildDesignPrompt(requirement: string): string {
  return `[HEADLESS FIRST — Phase 2: 디자인 토큰 입히기]

요구사항: ${requirement}

아래 검증 통과한 뼈대 코드에 디자인을 입혀주세요.

규칙:
1. Tailwind CSS 클래스만 사용하세요.
2. 인라인 style={{}} 금지.
3. 하드코딩 px/color 금지. Tailwind spacing(p-4) 및 테마 색상(text-text-primary) 사용.
4. 반응형: mobile-first (sm:, md:, lg: 브레이크포인트).
5. 기존 로직(onClick, onChange, 5-State 분기)을 절대 수정하지 마세요. className만 추가하세요.

출력: 디자인이 입혀진 전체 코드만. 설명 없이.`;
}
