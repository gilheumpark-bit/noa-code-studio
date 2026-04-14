// ============================================================
// PART 1 — Deterministic Vector Mapping Dictionary
// ============================================================

/**
 * [Shadow Translator]
 * Models are inherently non-deterministic. To achieve absolute phase-locking (NOA-AGI),
 * we bypass the LLM for intent extraction. Human adjectives map strictly to AST/System constraints.
 */

export interface IntentConstraints {
  matrixLog: string[];      // Audit Invoice 용 로그
  systemOverride: string[]; // LLM 에게 주입될 절대 규제 프롬프트
}

const VECTOR_DICTIONARY = {
  speed: {
    keywords: ['빠르게', '가볍게', '속도', '최적화', 'fast', 'optimize', 'lightweight'],
    constraints: [
      '- MAX_TIME_COMPLEXITY: O(N) (Do not use nested loops like for-inside-for)',
      '- MAX_DEPENDENCIES: 0 (Do not add new external library imports)',
    ],
    log: '성능 최적화 의도 감지 ➔ [규제 적용] 시간 복잡도 O(N) 하드록, 무의존성 강제',
  },
  security: {
    keywords: ['안전하게', '죽지 않게', '에러 안 나게', '튼튼하게', 'safe', 'secure', 'robust', 'no bugs'],
    constraints: [
      '- NULL_SAFETY: STRICT (Every object access must use optional chaining `?.` or explicit null checks)',
      '- TYPE_ANY: FORBIDDEN (Do not use the `any` type under any circumstances)',
      '- ERROR_BOUNDARY: REQUIRED (Wrap risky operations in try-catch blocks)',
    ],
    log: '견고성 의도 감지 ➔ [규제 적용] Strict Null-Safety, Try-Catch 방어막 필수',
  },
  readability: {
    keywords: ['깔끔하게', '유지보수', '짧게', '명확하게', 'clean', 'readable', 'short', 'maintainable'],
    constraints: [
      '- MAX_LINES_PER_FUNCTION: 20 (Keep functions extremely small and modular)',
      '- CYCLOMATIC_COMPLEXITY: 3 (Do not use more than 3 if/else branches per block)',
    ],
    log: '유지보수성 의도 감지 ➔ [규제 적용] 함수 단위 20줄 이하, 분기 복잡도 3 이하 강제',
  },
};

// ============================================================
// PART 2 — Shadow Parsing Engine
// ============================================================

/**
 * Extracts constraints based on regex matching without LLM invocation.
 */
export function extractPhysicalConstraints(userPrompt: string): IntentConstraints {
  const result: IntentConstraints = {
    matrixLog: [],
    systemOverride: [],
  };

  const lowerPrompt = userPrompt.toLowerCase();
  
  // Iterate through dictionary and apply matching constraints
  // eslint-disable-next-line unused-imports/no-unused-vars
  for (const [vectorName, vectorData] of Object.entries(VECTOR_DICTIONARY)) {
    const isMatch = vectorData.keywords.some((kw) => lowerPrompt.includes(kw));
    if (isMatch) {
      result.matrixLog.push(vectorData.log);
      result.systemOverride.push(...vectorData.constraints);
    }
  }

  // Fallback defaults if user is too vague, but we still want NOA baseline
  if (result.systemOverride.length === 0) {
    result.matrixLog.push('명시적 의도 부재 ➔ [기본 규제 적용] NOA Base Stability Model 가동');
    result.systemOverride.push(
      '- STANDARD_SAFETY: Include basic null checks.',
      '- NO_DESTRUCTIVE_ACTIONS: Do not mutate globally without locks.'
    );
  }

  return result;
}

/**
 * Builds the final un-ignorable system prompt injection format.
 */
export function buildConstraintInjection(constraints: string[]): string {
  if (constraints.length === 0) return '';
  return `
[SYSTEM OVERRIDE: PHYSICAL CONSTRAINTS]
You are operating under the NOA-AGI strict phase-locking mechanism.
You MUST strictly obey the following mathematical and structural limits:
${constraints.join('\n')}

If you violate these constraints, your output will be violently rejected by the internal build system before it even reaches the user. Do not apologize, just output the compliant code.
`;
}

// IDENTITY_SEAL: PART-2 | role=ShadowTranslator | inputs=userPrompt | outputs=IntentConstraints
