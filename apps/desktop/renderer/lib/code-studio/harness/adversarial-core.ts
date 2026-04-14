// ============================================================
// Adversarial Harness Core — 적대적 심문실
// ============================================================
// AI가 요령을 피우지 못하도록:
//   Core 1: Spy/Mock 행위 추적 (더미 리턴 사냥)
//   Core 2: Chaos Fuzzing 폭격 (해피패스 깡통 사냥)
//   Core 3: Mutation 검증 (가짜 테스트 사냥)
// + Machine-Readable JSON 피드백

// ── Types ──

export interface HarnessFeedback {
  system_action: 'REJECTED_BY_HARNESS' | 'APPROVED_FOR_MERGE';
  error_type?: string;
  harness_trigger?: string;
  actual_behavior?: string;
  expected_behavior?: string;
  strict_instruction?: string;
  gate_results?: GateResult[];
  /** 프로토콜 ID 태그 — 어떤 게이트를 통과/실패했는지 */
  gate_status?: Record<GateId, '✓' | '✗' | '—'>;
}

export type GateId = 'GATE-SPY' | 'GATE-FUZZ' | 'GATE-MUT' | 'GATE-AST' | 'GATE-BUILD' | 'GATE-TEST';

export interface GateResult {
  gate: string;
  gateId?: GateId;
  passed: boolean;
  findings: string[];
  score: number;
  durationMs?: number;
}

export interface SpyReport {
  functionName: string;
  callCount: number;
  calledWith: unknown[][];
  returned: unknown[];
}

export interface FuzzResult {
  input: unknown;
  crashed: boolean;
  error?: string;
  line?: number;
}

// ── Core 1: Spy Tracking (행위 추적) ──

/** 코드에서 외부 의존성 호출을 추적하는 패턴 분석 */
export function analyzeSpyPatterns(code: string): {
  findings: string[];
  suspiciousReturns: Array<{ line: number; pattern: string }>;
} {
  const findings: string[] = [];
  const suspiciousReturns: Array<{ line: number; pattern: string }> = [];
  const lines = code.split('\n');

  // 함수 안에서 외부 호출 없이 바로 리턴하는 패턴 감지
  let inFunction = false;
  let functionStart = 0;
  let functionBody: string[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 함수 시작 감지
    if (/(?:async\s+)?(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-z_$]\w*)\s*=>)/.test(line)) {
      inFunction = true;
      functionStart = i;
      functionBody = [];
      braceDepth = 0;
    }

    if (inFunction) {
      functionBody.push(line);
      braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

      if (braceDepth <= 0 && functionBody.length > 1) {
        inFunction = false;
        const body = functionBody.join('\n');

        // 외부 호출 없이 하드코딩 리턴만 있는지
        const hasExternalCall = /fetch\(|axios|\.query|\.insert|\.update|\.delete|\.save|\.send|dispatch|emit|navigate|push\(/.test(body);
        const hasHardcodedReturn = /return\s+(?:\{[^}]*status[^}]*\}|true|false|\[\]|\{\}|null|undefined|["'][^"']*["'])\s*;/.test(body);

        if (!hasExternalCall && hasHardcodedReturn && functionBody.length > 2) {
          suspiciousReturns.push({
            line: functionStart + 1,
            pattern: 'Function returns hardcoded value without any external call (DB/API/State)',
          });
          findings.push(`Line ${functionStart + 1}: Spy Alert — 외부 호출 없이 하드코딩 값만 반환하는 의심 함수`);
        }

        functionBody = [];
      }
    }
  }

  return { findings, suspiciousReturns };
}

// ── Core 2: Fuzzing Patterns (퍼징 시나리오 생성) ──

/** 함수 시그니처에서 퍼징 입력 생성 */
export function generateFuzzInputs(paramTypes: string[]): unknown[][] {
  const fuzzValues: Record<string, unknown[]> = {
    string: ['', ' ', 'a'.repeat(10000), '<script>alert(1)</script>', '\\x00', null, undefined, 42],
    number: [0, -1, -999999, Infinity, -Infinity, NaN, null, undefined, 'not_a_number'],
    boolean: [true, false, null, undefined, 0, '', 'true'],
    array: [[], null, undefined, [null], Array(10000).fill(0)],
    object: [{}, null, undefined, { __proto__: { admin: true } }, ''],
    any: [null, undefined, '', 0, false, [], {}, NaN, Infinity, -1, 'a'.repeat(10000)],
  };

  const inputs: unknown[][] = [];
  const maxCombinations = 20;

  for (let i = 0; i < maxCombinations && i < 100; i++) {
    const input = paramTypes.map(type => {
      const values = fuzzValues[type] || fuzzValues.any;
      return values[Math.floor(Math.random() * values.length)];
    });
    inputs.push(input);
  }

  return inputs;
}

/** 코드에서 함수 파라미터 추출 */
export function extractFunctionParams(code: string): Array<{ name: string; params: string[]; line: number }> {
  const functions: Array<{ name: string; params: string[]; line: number }> = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // export function foo(a: string, b: number)
    const match = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
    if (match) {
      const name = match[1];
      const params = match[2].split(',').map(p => {
        const typeMatch = p.match(/:\s*(\w+)/);
        return typeMatch ? typeMatch[1].toLowerCase() : 'any';
      }).filter(Boolean);
      functions.push({ name, params, line: i + 1 });
    }
  }

  return functions;
}

/** 퍼징 결과 분석 — 방어 로직 누락 감지 */
export function analyzeFuzzVulnerabilities(code: string): string[] {
  const findings: string[] = [];
  const lines = code.split('\n');

  // try-catch 없는 async 함수
  let inAsync = false;
  let asyncStart = 0;
  let hasTryCatch = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/async\s+function|async\s+\(|async\s+[a-z_$]\w*\s*=>/.test(line)) {
      inAsync = true;
      asyncStart = i;
      hasTryCatch = false;
      braceDepth = 0;
    }
    if (inAsync) {
      if (/try\s*\{/.test(line)) hasTryCatch = true;
      braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceDepth <= 0 && i > asyncStart) {
        if (!hasTryCatch) {
          findings.push(`Line ${asyncStart + 1}: Fuzz Alert — async 함수에 try-catch가 없습니다. 네트워크 에러 시 크래시됩니다.`);
        }
        inAsync = false;
      }
    }
  }

  // 배열 접근 전 null 체크 없음
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\.\s*map\s*\(|\.\s*filter\s*\(|\.\s*reduce\s*\(|\.\s*forEach\s*\(/.test(line)) {
      // 이전 3줄에 null/length 체크가 있는지
      const prevLines = lines.slice(Math.max(0, i - 3), i).join(' ');
      if (!/\.length|!==?\s*null|!==?\s*undefined|\?\.|Array\.isArray/.test(prevLines) && !/\?\.\s*map|\?\.\s*filter/.test(line)) {
        findings.push(`Line ${i + 1}: Fuzz Alert — 배열 메서드 호출 전 null/undefined 체크가 없습니다.`);
      }
    }
  }

  // parseInt/Number 변환 전 검증 없음
  for (let i = 0; i < lines.length; i++) {
    if (/parseInt\(|Number\(|parseFloat\(/.test(lines[i])) {
      if (!/isNaN|typeof.*number|!==?\s*undefined/.test(lines[i])) {
        findings.push(`Line ${i + 1}: Fuzz Alert — 숫자 변환 전 입력값 검증이 없습니다. NaN/Infinity 가능.`);
      }
    }
  }

  return findings;
}

// ── Core 3: Mutation Detection (돌연변이 검증) ──

/** 코드의 조건문을 변조해서 테스트 견고성 확인 */
export function generateMutations(code: string): Array<{ line: number; original: string; mutated: string; type: string }> {
  const mutations: Array<{ line: number; original: string; mutated: string; type: string }> = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // [GATE-MUT] 경계값 돌연변이: > → <, >= → >, <= → <
    if (/\s>\s/.test(line) && !/=>\s/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace(/\s>\s/, ' < '), type: 'boundary' });
    }
    if (/>=/.test(line) && !/=>\s/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('>=', '>'), type: 'boundary' });
    }
    if (/<=/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('<=', '<'), type: 'boundary' });
    }
    // [GATE-MUT] 동등성 돌연변이: === → !==, !== → ===
    if (/===/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('===', '!=='), type: 'equality' });
    }
    if (/!==/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('!==', '==='), type: 'equality' });
    }
    // [GATE-MUT] 논리 돌연변이: && → ||, || → &&
    if (/&&/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('&&', '||'), type: 'logical' });
    }
    if (/\|\|/.test(line) && !/\|\|.*=>/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('||', '&&'), type: 'logical' });
    }
    // [GATE-MUT] 산술 돌연변이: + → -, * → /
    if (/\s\+\s/.test(line) && !/\+\+/.test(line) && !/'\s*\+\s*'/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace(/\s\+\s/, ' - '), type: 'arithmetic' });
    }
    if (/\s\*\s/.test(line) && !/\*\*/.test(line) && !/\*\//.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace(/\s\*\s/, ' / '), type: 'arithmetic' });
    }
    // [GATE-MUT] 반환값 돌연변이: return true → false, return false → true
    if (/return\s+true/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('return true', 'return false'), type: 'return' });
    }
    if (/return\s+false/.test(line)) {
      mutations.push({ line: i + 1, original: line, mutated: line.replace('return false', 'return true'), type: 'return' });
    }
  }

  return mutations.slice(0, 20); // 최대 20개
}

// ── Machine-Readable Feedback ──

/** 하네스 결과를 AI 피드백 JSON으로 변환 */
export function buildHarnessFeedback(
  gateResults: GateResult[],
  spyFindings: string[],
  fuzzFindings: string[],
): HarnessFeedback {
  const allPassed = gateResults.every(g => g.passed) && spyFindings.length === 0 && fuzzFindings.length === 0;

  if (allPassed) {
    return { system_action: 'APPROVED_FOR_MERGE', gate_results: gateResults };
  }

  // 가장 심각한 문제 찾기
  const criticalGate = gateResults.find(g => !g.passed);
  const hasSpy = spyFindings.length > 0;
  const hasFuzz = fuzzFindings.length > 0;

  let errorType = '검증 미통과';
  let trigger = '';
  let actual = '';
  let expected = '';
  let instruction = '';

  if (hasSpy) {
    errorType = '빈깡통 감지 (Spy Alert: 하드코딩 리턴)';
    trigger = '하네스가 외부 의존성 호출 패턴을 추적함';
    actual = spyFindings[0];
    expected = '외부 API/DB를 실제로 호출하고 그 결과를 반환해야 함';
    instruction = '하드코딩된 return 값을 실제 로직으로 교체하라. 기존 인터페이스는 유지하라.';
  } else if (hasFuzz) {
    errorType = '50% 빈깡통 감지 (예외 방어 누락)';
    trigger = '하네스가 극단값(null, 빈 배열, NaN)을 주입함';
    actual = fuzzFindings[0];
    expected = '비정상 입력에 크래시되지 않고 안전하게 에러를 반환해야 함';
    instruction = '방어 로직(if/try-catch)을 추가하여 전체 코드를 다시 제출하라. 기존 정상 동작 로직은 절대 건드리지 마라.';
  } else if (criticalGate) {
    errorType = `Gate 미통과: ${criticalGate.gate}`;
    trigger = `${criticalGate.gate} 검증에서 ${criticalGate.findings.length}건 발견`;
    actual = criticalGate.findings.slice(0, 3).join('; ');
    expected = '모든 게이트를 경고 없이 통과해야 함';
    instruction = `${criticalGate.findings[0]}. 이 문제를 수정하고 다시 제출하라.`;
  }

  // 프로토콜 ID별 상태 생성
  const gateStatus: Record<GateId, '✓' | '✗' | '—'> = {
    'GATE-SPY': hasSpy ? '✗' : '—',
    'GATE-FUZZ': hasFuzz ? '✗' : '—',
    'GATE-MUT': '—',
    'GATE-AST': '—',
    'GATE-BUILD': '—',
    'GATE-TEST': '—',
  };
  for (const g of gateResults) {
    const id = (g.gateId ?? g.gate) as GateId;
    if (id in gateStatus) gateStatus[id] = g.passed ? '✓' : '✗';
  }

  return {
    system_action: 'REJECTED_BY_HARNESS',
    error_type: errorType,
    harness_trigger: trigger,
    actual_behavior: actual,
    expected_behavior: expected,
    strict_instruction: instruction,
    gate_results: gateResults,
    gate_status: gateStatus,
  };
}
