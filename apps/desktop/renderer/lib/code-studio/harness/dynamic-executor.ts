// ============================================================
// Dynamic Executor — WebContainer에서 실제 실행 검증
// ============================================================
// 정적 분석(84점)을 동적 실행(95+점)으로 업그레이드.
// WebContainer 안에서 실제로:
//   1. Spy 주입 + 호출 추적 (런타임)
//   2. Fuzz 데이터 주입 + 크래시 감지
//   3. Mutation 코드 실행 + 테스트 견고성 확인
//   4. Playwright 렌더링 + 좌표/대비 측정
// 전부 브라우저 내 실행 → 서버 비용 0원

import type { WebContainerInstance } from '@/lib/code-studio/features/webcontainer';

import { generateMutations } from './adversarial-core';

// ── Types ──

export interface DynamicTestResult {
  gate: string;
  gateId?: string;
  passed: boolean;
  findings: string[];
  score: number;
  durationMs: number;
}

// ── Timeout Guard ──
// AI가 while(true) 등 무한루프를 생성해도 서버가 뻗지 않도록 3초 타임아웃 강제
const SANDBOX_TIMEOUT_MS = 3000;

async function runWithTimeout(
  wc: WebContainerInstance,
  command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const execution = wc.run(command);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[TIMEOUT] ${command} — ${SANDBOX_TIMEOUT_MS}ms 초과. 무한루프 또는 과도한 연산 의심.`)), SANDBOX_TIMEOUT_MS),
  );
  return Promise.race([execution, timeout]);
}

// ── 1. Runtime Spy Execution ──

/** WebContainer에서 Spy 래퍼로 코드 실행 + 호출 추적 */
export async function runSpyTest(
  wc: WebContainerInstance,
  code: string,
  _entryFunction: string,
): Promise<DynamicTestResult> {
  const start = Date.now();
  const findings: string[] = [];

  // Spy 래퍼 코드 생성 — fetch, localStorage, sessionStorage, console.error, indexedDB 감시
  const spyWrapper = `
const _spyCalls = {};
function _spy(target, method) {
  const orig = target[method];
  if (typeof orig === 'function') {
    target[method] = (...args) => {
      _spyCalls[method] = (_spyCalls[method] || 0) + 1;
      return orig.apply(target, args);
    };
  }
}

// [GATE-SPY] 외부 의존성 Monkey-Patching
_spy(globalThis, 'fetch');
if (typeof localStorage !== 'undefined') {
  _spy(localStorage, 'setItem');
  _spy(localStorage, 'getItem');
}
if (typeof sessionStorage !== 'undefined') {
  _spy(sessionStorage, 'setItem');
}
_spy(console, 'error');
if (typeof XMLHttpRequest !== 'undefined') {
  const _origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(...args) {
    _spyCalls.xhr = (_spyCalls.xhr || 0) + 1;
    return _origOpen.apply(this, args);
  };
}

// 모듈 로드 + 실행
${code}

// Spy 리포트
const _totalCalls = Object.values(_spyCalls).reduce((s, v) => s + v, 0);
const report = {
  spyCalls: _spyCalls,
  totalCallCount: _totalCalls,
  hasExternalCalls: _totalCalls > 0,
  spiedAPIs: Object.keys(_spyCalls).filter(k => _spyCalls[k] > 0),
};
console.log('__SPY_REPORT__' + JSON.stringify(report));
`;

  try {
    await wc.writeFile('_spy_test.mjs', spyWrapper);
    const result = await runWithTimeout(wc, 'node _spy_test.mjs');
    const output = result.stdout + result.stderr;

    // [GATE-SPY] Spy 리포트 파싱 — call_count 기반 판정
    const reportMatch = output.match(/__SPY_REPORT__(.+)/);
    if (reportMatch) {
      const report = JSON.parse(reportMatch[1]);
      if (report.totalCallCount === 0) {
        findings.push('[GATE-SPY] 외부 호출(fetch/DB/storage) 0회 — 결과값만 반환하는 가짜(Mock) 로직');
      } else if (!report.spiedAPIs.includes('fetch') && !report.spiedAPIs.includes('xhr')) {
        findings.push(`[GATE-SPY] 네트워크 호출 없음 (감지된 API: ${report.spiedAPIs.join(', ')})`);
      }
    }

    if (result.exitCode !== 0) {
      findings.push(`Spy: 코드 실행 실패 (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`);
    }
  } catch (err) {
    findings.push(`Spy 테스트 실행 오류: ${err}`);
  }

  return {
    gate: 'Runtime Spy',
    passed: findings.length === 0,
    findings,
    score: findings.length === 0 ? 100 : 0,
    durationMs: Date.now() - start,
  };
}

// ── 2. Runtime Fuzz Execution ──

/** WebContainer에서 퍼징 데이터 주입 + 크래시 감지 */
export async function runFuzzTest(
  wc: WebContainerInstance,
  code: string,
  functionName: string,
  fuzzInputs: unknown[][],
): Promise<DynamicTestResult> {
  const start = Date.now();
  const findings: string[] = [];
  let crashed = 0;

  for (let i = 0; i < Math.min(fuzzInputs.length, 10); i++) {
    const input = fuzzInputs[i];
    const fuzzCode = `
${code}

try {
  const result = ${functionName}(${input.map(v => JSON.stringify(v)).join(', ')});
  console.log('__FUZZ_OK__' + JSON.stringify({ input: ${JSON.stringify(input)}, result }));
} catch (e) {
  console.log('__FUZZ_CRASH__' + JSON.stringify({ input: ${JSON.stringify(input)}, error: e.message, stack: e.stack?.split('\\n')[0] }));
  process.exit(1);
}
`;

    try {
      await wc.writeFile('_fuzz_test.mjs', fuzzCode);
      const result = await runWithTimeout(wc, 'node _fuzz_test.mjs');
      const output = result.stdout + result.stderr;

      if (output.includes('__FUZZ_CRASH__')) {
        const crashMatch = output.match(/__FUZZ_CRASH__(.+)/);
        if (crashMatch) {
          const crash = JSON.parse(crashMatch[1]);
          findings.push(`Fuzz 크래시: 입력 ${JSON.stringify(crash.input).slice(0, 50)} → ${crash.error}`);
          crashed++;
        }
      }

      if (result.exitCode !== 0 && !output.includes('__FUZZ_CRASH__')) {
        findings.push(`Fuzz: 입력 #${i + 1}에서 비정상 종료 (exit ${result.exitCode})`);
        crashed++;
      }
    } catch {
      // WebContainer 타임아웃 등
      findings.push(`Fuzz: 입력 #${i + 1} 실행 타임아웃`);
      crashed++;
    }
  }

  const total = Math.min(fuzzInputs.length, 10);
  const score = total > 0 ? Math.round(((total - crashed) / total) * 100) : 100;

  return {
    gate: 'Runtime Fuzz',
    passed: crashed === 0,
    findings,
    score,
    durationMs: Date.now() - start,
  };
}

// ── 3. Mutation Test Execution ──

/** 변조 코드 실행 → 테스트가 잡는지 확인 */
export async function runMutationTest(
  wc: WebContainerInstance,
  originalCode: string,
  testCode: string,
): Promise<DynamicTestResult> {
  const start = Date.now();
  const findings: string[] = [];
  const mutations = generateMutations(originalCode);

  if (mutations.length === 0) {
    return { gate: 'Mutation Test', passed: true, findings: ['변조 가능한 코드 없음'], score: 100, durationMs: Date.now() - start };
  }

  let killed = 0; // 테스트가 잡은 변조 수
  let survived = 0; // 테스트를 통과한 변조 수 (위험)

  for (const mut of mutations.slice(0, 8)) {
    // 원본 코드의 해당 줄을 변조
    const lines = originalCode.split('\n');
    lines[mut.line - 1] = mut.mutated;
    const mutatedCode = lines.join('\n');

    try {
      await wc.writeFile('_mut_code.mjs', mutatedCode);
      await wc.writeFile('_mut_test.mjs', testCode);
      const result = await runWithTimeout(wc, 'node _mut_test.mjs');

      if (result.exitCode === 0) {
        // 테스트 통과 = 변조를 못 잡음 = 테스트가 빈깡통
        survived++;
        findings.push(`Mutation 생존: Line ${mut.line} "${mut.type}" 변조를 테스트가 못 잡음 — 테스트 빈깡통 의심`);
      } else {
        killed++; // 테스트가 변조를 잡음 = 좋음
      }
    } catch {
      killed++; // 크래시 = 변조가 잡힘
    }
  }

  const total = killed + survived;
  const score = total > 0 ? Math.round((killed / total) * 100) : 100;

  if (survived > 0) {
    findings.push(`Mutation 요약: ${total}개 변조 중 ${survived}개가 테스트를 통과함 — 테스트 견고성 ${score}%`);
  }

  return {
    gate: 'Mutation Test',
    passed: survived === 0,
    findings,
    score,
    durationMs: Date.now() - start,
  };
}

// ── 4. Visual Geometry Test (Playwright 대체: DOM API) ──

/** WebContainer에서 렌더링 후 DOM 좌표/대비 검사 */
export async function runVisualTest(
  wc: WebContainerInstance,
  htmlCode: string,
): Promise<DynamicTestResult> {
  const start = Date.now();
  const findings: string[] = [];

  // 간이 HTML 페이지로 렌더링 검사 스크립트 생성
  const testScript = `
const { JSDOM } = require('jsdom');
const dom = new JSDOM(\`<!DOCTYPE html><html><body>${htmlCode.replace(/\\\\/g, '\\\\\\\\').replace(/\`/g, '\\\\`')}</body></html>\`, { pretendToBeVisual: true });
const doc = dom.window.document;

const findings = [];

// 1. 모든 인터랙티브 요소 터치 타겟 크기 체크 (44px 미만 경고)
const buttons = doc.querySelectorAll('button, a, input, select');
buttons.forEach((el, i) => {
  // JSDOM에서는 실제 크기 측정 불가 → 클래스 기반 추정
  const classes = el.className || '';
  if (/w-[1-6]\\b|h-[1-6]\\b|p-0|p-1\\b|px-1\\b|py-0/.test(classes)) {
    findings.push('Touch target too small: ' + el.tagName + ' at index ' + i);
  }
});

// 2. 이미지에 alt 속성 체크
const imgs = doc.querySelectorAll('img');
imgs.forEach((img, i) => {
  if (!img.getAttribute('alt') && img.getAttribute('alt') !== '') {
    findings.push('Image missing alt: img at index ' + i);
  }
});

// 3. 빈 링크 체크
const links = doc.querySelectorAll('a');
links.forEach((a, i) => {
  if (!a.getAttribute('href') && !a.onclick) {
    findings.push('Empty link: a at index ' + i);
  }
});

console.log('__VISUAL_REPORT__' + JSON.stringify(findings));
`;

  try {
    // jsdom은 WebContainer에서 설치 가능
    await wc.writeFile('_visual_test.cjs', testScript);
    const result = await runWithTimeout(wc, 'node _visual_test.cjs');
    const output = result.stdout;

    const reportMatch = output.match(/__VISUAL_REPORT__(.+)/);
    if (reportMatch) {
      const visualFindings = JSON.parse(reportMatch[1]) as string[];
      findings.push(...visualFindings);
    }
  } catch {
    findings.push('Visual test: JSDOM 실행 실패 (jsdom 미설치 가능)');
  }

  const score = Math.max(0, 100 - findings.length * 10);
  return {
    gate: 'Visual/A11y Test',
    passed: findings.length === 0,
    findings,
    score,
    durationMs: Date.now() - start,
  };
}

// ── Full Dynamic Suite ──

/** 모든 동적 테스트 실행 */
export async function runDynamicSuite(
  wc: WebContainerInstance,
  code: string,
  options?: {
    testCode?: string;
    entryFunction?: string;
    fuzzInputs?: unknown[][];
    htmlCode?: string;
    onProgress?: (gate: string, status: string) => void;
  },
): Promise<{
  results: DynamicTestResult[];
  allPassed: boolean;
  totalScore: number;
  totalDurationMs: number;
}> {
  const results: DynamicTestResult[] = [];
  const start = Date.now();

  // 1. Spy Test
  options?.onProgress?.('spy', 'running');
  const spyResult = await runSpyTest(wc, code, options?.entryFunction || 'main');
  results.push(spyResult);

  // 2. Fuzz Test
  if (options?.fuzzInputs && options.fuzzInputs.length > 0 && options?.entryFunction) {
    options?.onProgress?.('fuzz', 'running');
    const fuzzResult = await runFuzzTest(wc, code, options.entryFunction, options.fuzzInputs);
    results.push(fuzzResult);
  }

  // 3. Mutation Test
  if (options?.testCode) {
    options?.onProgress?.('mutation', 'running');
    const mutResult = await runMutationTest(wc, code, options.testCode);
    results.push(mutResult);
  }

  // 4. Visual Test
  if (options?.htmlCode) {
    options?.onProgress?.('visual', 'running');
    const visResult = await runVisualTest(wc, options.htmlCode);
    results.push(visResult);
  }

  const allPassed = results.every(r => r.passed);
  const totalScore = results.length > 0
    ? Math.round(results.reduce((a, r) => a + r.score, 0) / results.length)
    : 100;

  return {
    results,
    allPassed,
    totalScore,
    totalDurationMs: Date.now() - start,
  };
}
