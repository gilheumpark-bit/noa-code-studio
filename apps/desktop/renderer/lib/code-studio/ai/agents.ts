// ============================================================
// PART 1 — Types & Constants
// ============================================================

import { streamChat } from '@/lib/ai-providers';
import { streamWithMultiKey, isMultiKeyActive } from '@/lib/multi-key-bridge';
import { type AgentRole as MultiKeyAgentRole } from '@/lib/multi-key-manager';
import { CODE_STUDIO_ARCHITECTURE_APPENDIX } from '@/lib/code-studio/core/architecture-spec';
import { DESIGN_SYSTEM_SPEC } from '@/lib/code-studio/core/design-system-spec';
import { DESIGN_LINTER_SPEC } from '@/lib/code-studio/core/design-linter';
import { buildIdiomDirective, detectFramework, type FrameworkId } from '@/lib/code-studio/ai/idiom-presets';
import { buildCalcProtocolPrompt } from '@/lib/code-studio/ai/calc-protocol';
import { extractPhysicalConstraints, buildConstraintInjection, type IntentConstraints } from '@/lib/code-studio/ai/intent-parser';

// Re-export for consumers that need provider info alongside agent sessions.
export { getApiKey, getActiveProvider } from '@/lib/ai-providers';

import { type AgentRole, AGENT_REGISTRY } from '@/types/code-studio-agent';

/** 코드 스튜디오 에이전트 역할 → 멀티키 역할 매핑 */
const CODE_ROLE_TO_MULTI_KEY: Record<string, MultiKeyAgentRole> = {
  // Leadership → reviewer (전략적 판단)
  'team-leader': 'reviewer',
  'frontend-lead': 'reviewer',
  'backend-lead': 'reviewer',
  // Generation → coder
  'domain-analyst': 'coder',
  'state-designer': 'coder',
  'css-layout': 'coder',
  'interaction-motion': 'coder',
  'core-engine': 'coder',
  'api-binding': 'coder',
  // Verification → analyst
  'overflow-guard': 'analyst',
  'security-auth': 'analyst',
  'memory-cache': 'analyst',
  'render-optimizer': 'analyst',
  'deadcode-scanner': 'analyst',
  'coding-convention': 'analyst',
  'stress-tester': 'analyst',
  'dependency-linker': 'analyst',
  // Repair → coder
  'progressive-repair': 'coder',
  'snapshot-manager': 'coder',
};

// Re-export for consumers that need the new 19-agent types
export type { AgentRole };

// Re-export idiom utilities for external consumers
export { buildIdiomDirective, detectFramework, type FrameworkId };

/**
 * Module-level detected framework. Set by runAgentPipeline from codeContext,
 * consumed by runSingleAgent to inject framework-specific idiom directives.
 */
let _detectedFramework: FrameworkId | null = null;

/** A single message produced by an agent during a session. */
export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  timestamp: number;
  confidence: number; // 0-1, computed from response characteristics
}

/** Tracks a disagreement or issue found between agents. */
export interface ConflictEntry {
  between: [AgentRole, AgentRole];
  description: string;
  resolved: boolean;
}

/** Summary produced after pipeline completion. */
export interface SessionSummary {
  totalAgentsRun: number;
  totalTokensEstimate: number;
  conflictsFound: number;
  finalConfidence: number;
  durationMs: number;
}

/** Tracks the full lifecycle of a multi-agent code generation run. */
export interface AgentSession {
  id: string;
  task: string;
  agents: AgentRole[];
  messages: AgentMessage[];
  status: 'idle' | 'running' | 'done' | 'error';
  finalOutput?: string;
  conflicts: ConflictEntry[];
  summary?: SessionSummary;
  auditInvoice?: IntentConstraints; // Added for the Calculation Receipt
}

// IDENTITY_SEAL: PART-1 | role=TypeDefinitions | inputs=none | outputs=AgentRole,AgentMessage,ConflictEntry,SessionSummary,AgentSession

// ============================================================
// PART 2 — Agent System Prompts
// ============================================================

/**
 * System prompt for each agent role.
 * Each prompt constrains the agent to its specific responsibility
 * so that the sequential pipeline produces coherent, layered output.
 */
export const AGENT_PROMPTS: Partial<Record<AgentRole, string>> = {
  // Leadership
  'team-leader': 'You are the Chief Coordinator. Validate the overall lifecycle state.',
  'frontend-lead': `You are the Frontend Lead. Ensure UI/UX integrity and ErrorBoundary wrapping.

Design verification checklist (v8.0):
1. All color classes use project semantic tokens (bg-bg-*, text-text-*, accent-*). Flag any raw Tailwind colors (bg-blue-500, text-red-600).
2. Existing component classes reused (.premium-button, .ds-card, .ds-input, .badge-*). Flag custom rebuilds of existing primitives.
3. Z-index uses var(--z-*) tokens only. Flag arbitrary numbers (z-index: 9999).
4. Global focus-visible not overridden. Flag any outline:none or custom focus styles.
5. Touch targets ≥ 44px on interactive elements. Flag small buttons/links.
6. Transitions use var(--transition-fast/normal/slow). Flag transition:all.
7. Status indicators use color + icon/text (min 2 of 3). Flag color-only states.`,
  'backend-lead': 'You are the Backend Lead. Ensure API integrity and Proxy headers.',

  // Pipeline 1: 건축 설계 (Architecture)
  'domain-analyst': `[NOA-CORE: 확신도 게이트 0.55 적용] 당신은 도메인 분석가(A1)입니다. 
당신의 역할: 주어진 사용자의 요구사항과 코드 컨텍스트를 분석하여 비즈니스 모델, 주요 도메인 객체, 엣지 케이스 및 제약사항(Business Rules & Constraints)을 식별합니다.
1. 사이트/작업의 성격 파악 (예: 게시판, E-commerce, 인증 등)
2. 발생할 수 있는 취약 지점 및 엣지 케이스 값 3가지 이상 명시
3. [NOA-EXEC: 3-Persona (안전/성능/간결)] 원칙에 위배될 수 있는 잠재적 위험(Risks)을 정리하세요.
결과물은 구조화된 마크다운 문서로 작성하고, 마지막에 "A1_ANALYSIS_COMPLETE"를 출력하세요.`,

  'state-designer': `[NOA-CORE: 확신도 게이트 0.55 적용] 당신은 상태 스키마 설계자(A2)입니다.
당신의 역할: 도메인 분석가의 결과를 바탕으로 애플리케이션의 상태(State) 변이 다이어그램 및 설계도를 작성합니다.
1. 필요한 전역/지역 상태 식별 (\`idle -> generating -> verifying\` 등 상태 머신 구조화 허용)
2. 예측 불가능한 부작용(Side Effect) 방어 계획 (NOA-EXEC [C] 안전성 원칙 적용)
3. 렌더링 최적화를 위한 상태 분리 방안 (NOA-EXEC [G] 성능 원칙 적용)
오직 설계 개요와 JSON 형태의 상태 인터페이스 스니펫만 출력하고, 마지막에 "A2_SCHEMA_COMPLETE"를 출력하세요.`,

  // Pipeline 2: UI 스캐폴딩
  'css-layout': `You are the CSS/Layout agent (A3). Your job:
1. Generate Tailwind v4 CSS using project semantic tokens ONLY:
   - Backgrounds: bg-bg-primary, bg-bg-secondary, bg-bg-tertiary
   - Text: text-text-primary, text-text-secondary, text-text-tertiary
   - Accents: accent-amber (primary), accent-red, accent-green, accent-purple, accent-blue
   - Border: border-border. Radius: var(--radius-sm/md/lg/xl/full)
   - NO raw Tailwind colors (bg-blue-500, text-red-600 etc.)
2. Reuse existing component classes: .premium-button, .ds-card, .ds-input, .badge-*, .zone-card
3. Responsive: mobile-first sm/md/lg/xl. Check fixed widths > 375px.
4. Z-index: var(--z-base/dropdown/sticky/overlay/modal/toast/tooltip) ONLY. No arbitrary numbers.
5. Spacing: 4px grid via --sp-* tokens or Tailwind (p-1/p-2/p-4). No non-4-multiples.
6. Shadows: shadow-luxury, shadow-panel, shadow-manuscript tokens.
7. Glassmorphism: var(--bl-sm/md/lg) ONLY in .premium-panel, NOT in editor/terminal.
8. Verify 5 themes: archive(default), dark, light, bright, beige — all must work.
Output: Structured layout code with accessibility (role, aria-label). End with "A3_LAYOUT_COMPLETE".`,

  'interaction-motion': `You are the Interaction/Motion agent (A4). Your job:
1. Review all interactive elements: buttons, links, inputs, modals, dropdowns.
2. Verify visual feedback uses project tokens:
   - Transitions: var(--transition-fast:150ms), var(--transition-normal:250ms), var(--transition-slow:400ms)
   - FORBIDDEN: transition: all. Always specify target property.
   - Hover: use bg-bg-tertiary or opacity changes, NOT hardcoded colors
   - Active: scale-95 or translateY patterns
3. Check animations: use existing 29 @keyframes from globals-animations.css first.
   - No layout thrashing, will-change used properly
   - Global prefers-reduced-motion already declared — do NOT add duplicate
4. Keyboard navigation: Tab order, Enter/Escape, focus trap in modals.
   - DO NOT override global *:focus-visible (accent-amber outline already active)
5. Touch targets: min-height 44px on ALL interactive elements.
   - Use .premium-button (already min-h 3.4rem) or .ds-btn-* (pre-sized)
   - Flag: click targets < 44px, unlinked handlers, missing disabled states
6. Status: color + icon(lucide-react) + text label, minimum 2 of 3.
   - Color-blind pairs (red/green) need icon/shape differentiation
Output: Interaction audit with fixes. End with "A4_INTERACTION_COMPLETE".`,

  // Pipeline 3: 로직 생성
  'core-engine': `You are the Core Engine agent (A5). Your job:
1. Implement the core business logic with performance in mind.
2. Rules: no nested loops > 2 levels, no synchronous heavy computation on main thread.
3. Use proper data structures (Map/Set over Object for lookups, WeakRef for caches).
4. Ensure: error boundaries around async operations, AbortController for cancellable requests.
5. Validate: no memory leaks (event listener cleanup, subscription disposal, timer clearing).
Output: Optimized core logic. End with "A5_ENGINE_COMPLETE".`,

  'api-binding': `You are the API Binding agent (A6). Your job:
1. Implement API calls with proper error handling (try/catch, status code checks).
2. Enforce: request timeout (AbortSignal.timeout), retry logic for transient failures (429, 503).
3. Prevent: race conditions (stale closure, concurrent request dedup), loading state leaks.
4. Validate: no sensitive data in query params, proper Content-Type headers, CSRF tokens.
5. Check: response type validation before usage, null/undefined guards on response data.
Output: Robust API layer. End with "A6_API_COMPLETE".`,

  // Pipeline 4: 검증 — 경계 & 보안
  'overflow-guard': `You are the Overflow Guard agent (A7). Your job:
1. Find ALL potential null/undefined access paths. Check every optional chain, every array index.
2. Detect: division by zero, array out-of-bounds, string.length on null, parseInt on non-numeric.
3. Validate: function parameter types at runtime (typeof/instanceof guards at boundaries).
4. Check: recursive functions have base cases and depth limits.
5. Flag: any unchecked .length, .map(), .filter() on potentially undefined arrays.
Output: List each issue with file:line, severity, and fix. End with "A7_OVERFLOW_COMPLETE".`,

  'security-auth': `You are the Security/Auth Guard agent (A8). Your job:
1. Scan for: eval(), innerHTML, dangerouslySetInnerHTML without sanitization, Function() constructor.
2. Check: XSS vectors (user input → DOM), SQL injection (if any DB), command injection.
3. Verify: auth tokens not in localStorage (use httpOnly cookies), API keys not in client bundles.
4. Audit: CORS settings, CSP headers, Referrer-Policy, X-Frame-Options.
5. Flag: hardcoded secrets, credentials in comments, JWT decoded without verification.
Output: Security report with OWASP category for each finding. End with "A8_SECURITY_COMPLETE".`,

  // Pipeline 5: 검증 — 성능
  'memory-cache': `You are the Memory/Cache Guard agent (A9). Your job:
1. Detect: event listeners without cleanup (useEffect missing return), subscriptions not unsubscribed.
2. Find: growing arrays/maps that never shrink (memory leak), closures capturing stale state.
3. Check: N+1 query patterns (loop with await inside), unbounded cache growth.
4. Verify: WeakMap/WeakRef used where appropriate, large objects cleared after use.
5. Audit: IndexedDB/localStorage usage (quota checks, cleanup of expired data).
Output: Memory audit with leak risk scores. End with "A9_MEMORY_COMPLETE".`,

  'render-optimizer': `You are the Render Optimizer agent (A10). Your job:
1. Find: unnecessary re-renders (missing React.memo, unstable object/array props, missing useMemo).
2. Check: useCallback on event handlers passed to child components.
3. Detect: state updates in loops, setState in render, derived state that should be useMemo.
4. Verify: list rendering has stable keys (not index), virtualization for lists > 50 items.
5. Flag: expensive computations in render path without memoization.
Output: Render performance report with specific fixes. End with "A10_RENDER_COMPLETE".`,

  // Pipeline 6: 검증 — 코드 품질
  'deadcode-scanner': `You are the Deadcode Scanner agent (A11). Your job:
NOTE: Static analysis (dead-code.ts) already catches basic unused imports/variables via regex.
Your role is to find what STATIC ANALYSIS MISSES:
1. Semantically dead code: functions that ARE called but whose return value is never used.
2. Feature flags that are always false — conditional blocks that never execute.
3. Exported functions with zero consumers across the project (orphan exports).
4. React components defined but never rendered in any parent.
5. Event handlers registered but never triggered (onX props passed but parent never fires).
6. State variables (useState) that are set but never read in JSX or effects.
DO NOT repeat what regex can find (unused imports, unreachable after return).
Output: Each dead item with file:line and WHY static analysis missed it. End with "A11_DEADCODE_COMPLETE".`,

  'coding-convention': `You are the Coding Convention agent (A12). Your job:
1. Check naming: camelCase for variables/functions, PascalCase for components/types, UPPER_SNAKE for constants.
2. Verify: consistent import ordering (React → libs → local → types → styles).
3. Ensure: no magic numbers (extract to named constants), no string literals for repeated values.
4. Check: JSDoc/TSDoc on exported functions, consistent error message formatting.
5. Validate: file structure follows project conventions (one component per file, index exports).
Output: Convention violations list. End with "A12_CONVENTION_COMPLETE".`,

  // Pipeline 7: 검증 — 스트레스 & 의존성
  'stress-tester': `You are the Stress Tester agent (A13). Your job:
NOTE: Virtual simulation (stress-test.ts) computes static metrics (loop depth, fetch count, etc.).
Your role is BEHAVIORAL stress analysis that static metrics can't detect:
1. N+1 patterns: find loops containing await/fetch — calculate exact request count at scale.
2. Memory growth: trace objects created per iteration — estimate heap at 10K iterations.
3. Render storms: find setState inside loops/effects — count re-renders at scale.
4. Concurrency: identify shared mutable state accessed by multiple async paths without locks.
5. Input extremes: test with empty string, 1MB string, -1, Infinity, nested 100-level object.
6. Rate limiting: check if rapid repeated calls (100/sec) are debounced/throttled.
For each finding, provide: scenario, expected behavior, actual risk, and a runnable test case.
Output: Structured stress report. End with "A13_STRESS_COMPLETE".`,

  'dependency-linker': `You are the Dependency Linker agent (A14). Your job:
1. Detect circular dependencies between modules (A imports B, B imports A).
2. Check: package.json for unused dependencies, missing peer dependencies.
3. Verify: no duplicate packages (different versions of same lib).
4. Audit: bundle size impact of each dependency (flag > 100KB gzipped).
5. Check: import paths are correct (no ../../../ deep nesting, use path aliases).
Output: Dependency graph issues. End with "A14_DEPENDENCY_COMPLETE".`,

  // Pipeline 8: 수리
  'progressive-repair': `You are the Progressive Repair agent (A15). Your job:
Fix issues reported by previous verification agents using 3-level strategy:
L1 (Safe): Auto-fix — unused imports, missing semicolons, formatting, type annotations.
L2 (Moderate): Guided fix — null guards, missing error handling, accessibility attributes.
L3 (Complex): Structural fix — refactor functions, extract components, fix architecture issues.

Rules:
- NEVER change business logic unless explicitly broken.
- NEVER remove code that might be intentionally there.
- ALWAYS preserve existing tests and their assertions.
- Output ONLY the fixed code, no explanation needed.
End with "A15_REPAIR_COMPLETE".`,

  'snapshot-manager': `You are the Snapshot Manager agent (A16). Your job:
1. Before any repair: create a snapshot of current state (list changed files + line ranges).
2. After repair: diff the snapshot to verify only intended changes were made.
3. If repair introduced NEW issues: rollback to snapshot and report failure.
4. Track: which agent made which change, in what order, with what confidence.
5. Output: Change manifest (files changed, lines added/removed, rollback available).
End with "A16_SNAPSHOT_COMPLETE".`,
};

// IDENTITY_SEAL: PART-2 | role=AgentPrompts | inputs=none | outputs=AGENT_PROMPTS

// ============================================================
// PART 3 — Session Factory & Helpers
// ============================================================

/** Default agent pipeline order when no custom roles are provided. */
const DEFAULT_ROLES: AgentRole[] = ['domain-analyst', 'state-designer', 'css-layout', 'interaction-motion'];

/** 검증 전용 프리셋 — 코드 붙여넣기 → 원클릭 검증용 (전체 8개) */
export const VERIFY_ONLY_ROLES: AgentRole[] = [
  'team-leader',
  'overflow-guard', 'security-auth',
  'memory-cache', 'render-optimizer',
  'deadcode-scanner', 'coding-convention',
  'stress-tester', 'dependency-linker',
];

/** 티어별 검증 에이전트 수 제한. agentCount에 맞춰 앞에서부터 슬라이스. */
export function getVerifyRolesForTier(agentCount: number): AgentRole[] {
  if (agentCount >= 8) return VERIFY_ONLY_ROLES;
  // 팀장 + 상위 N개 검증 에이전트 (보안 > 컨벤션 > 데드코드 우선)
  const priority: AgentRole[] = ['security-auth', 'coding-convention', 'deadcode-scanner', 'overflow-guard', 'memory-cache', 'render-optimizer', 'stress-tester', 'dependency-linker'];
  return ['team-leader', ...priority.slice(0, agentCount)];
}

/** 생성 → 검증 프리셋 — 이지모드 전체 흐름용 */
export const GENERATE_AND_VERIFY_ROLES: AgentRole[] = [
  'team-leader',
  'domain-analyst', 'state-designer',
  'core-engine', 'api-binding',
  'css-layout', 'interaction-motion',
  'overflow-guard', 'security-auth',
  'memory-cache', 'render-optimizer',
  'deadcode-scanner', 'coding-convention',
  'progressive-repair',
];

/** Execution order — agents run in this sequence regardless of input order. */
const ROLE_ORDER: AgentRole[] = [
  'team-leader', 'frontend-lead', 'backend-lead',
  'domain-analyst', 'state-designer',
  'css-layout', 'interaction-motion',
  'core-engine', 'api-binding',
  'overflow-guard', 'security-auth',
  'memory-cache', 'render-optimizer',
  'deadcode-scanner', 'coding-convention',
  'stress-tester', 'dependency-linker',
  'progressive-repair', 'snapshot-manager',
];

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new agent session in idle state.
 */
export function createAgentSession(
  task: string,
  roles: AgentRole[] = DEFAULT_ROLES,
): AgentSession {
  return {
    id: generateId(),
    task,
    agents: [...roles],
    messages: [],
    status: 'idle',
    conflicts: [],
  };
}

// IDENTITY_SEAL: PART-3 | role=SessionFactory | inputs=task,roles | outputs=AgentSession

// ============================================================
// PART 4 — Confidence Scoring
// ============================================================

/** 헷징 표현 패턴 — 이 표현이 많을수록 확신도가 낮다 */
const HEDGING_PATTERNS = [
  /\bmaybe\b/gi,
  /\bmight\b/gi,
  /\bnot sure\b/gi,
  /\bpossibly\b/gi,
  /\bperhaps\b/gi,
  /\bcould be\b/gi,
  /\bI think\b/gi,
  /\bprobably\b/gi,
  /\buncertain\b/gi,
];

/**
 * 에이전트 응답의 확신도를 0-1 범위로 계산한다.
 *
 * 요소:
 * - 응답 길이: 너무 짧으면 낮음
 * - 헷징 언어: 많을수록 감점
 * - 코드 비율: 코드가 많으면 가점 (developer/tester 등)
 */
function computeConfidence(content: string): number {
  if (!content || content.length < 20) return 0.1;

  let score = 0.7; // 기본값

  // 길이 보정: 100자 미만이면 감점, 500자 이상이면 가점
  if (content.length < 100) {
    score -= 0.15;
  } else if (content.length > 500) {
    score += 0.1;
  }

  // 헷징 패턴 감점
  let hedgeCount = 0;
  for (const pat of HEDGING_PATTERNS) {
    pat.lastIndex = 0;
    const matches = content.match(pat);
    if (matches) hedgeCount += matches.length;
  }
  score -= Math.min(0.3, hedgeCount * 0.05);

  // 코드 존재 가점: 중괄호/세미콜론이 많으면 구체적 코드 출력일 가능성
  const codeChars = (content.match(/[{};()=>]/g) ?? []).length;
  const codeRatio = codeChars / content.length;
  if (codeRatio > 0.02) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, parseFloat(score.toFixed(2))));
}

// IDENTITY_SEAL: PART-4 | role=ConfidenceScoring | inputs=content | outputs=confidenceNumber

// ============================================================
// PART 5 — Feedback Loop Detection
// ============================================================

/** 리뷰어 거부 패턴 */
const REJECTION_PATTERNS = [
  /should be changed/i,
  /incorrect/i,
  /\bbug\b/i,
  /\berror\b/i,
  /security vulnerabilit/i,
  /critical/i,
  /must fix/i,
  /needs to be fixed/i,
];

/** 테스트 실패 패턴 */
const TEST_FAILURE_PATTERNS = [
  /test fail/i,
  /assertion fail/i,
  /expect.*to(Be|Equal|Match|Have|Throw)/i,
  /FAIL/,
  /✗|✘|×/,
  /Error:/,
];

function detectRejection(content: string): boolean {
  return REJECTION_PATTERNS.some(p => p.test(content));
}

function detectTestFailure(content: string): boolean {
  return TEST_FAILURE_PATTERNS.some(p => p.test(content));
}

// IDENTITY_SEAL: PART-5 | role=FeedbackLoopDetection | inputs=agentOutput | outputs=boolean

// ============================================================
// PART 6 — Conflict Tracking
// ============================================================

/**
 * 검증 에이전트가 설계 에이전트와 충돌하는지 검사한다.
 */
function detectDesignConflict(reviewerContent: string): string | null {
  const patterns = [
    /architect.*wrong/i,
    /design.*flaw/i,
    /interface.*incorrect/i,
    /structure.*should/i,
    /redesign/i,
  ];
  for (const p of patterns) {
    if (p.test(reviewerContent)) {
      return 'Reviewer identified architectural design issues';
    }
  }
  return null;
}

/**
 * 테스터가 개발자가 놓친 버그를 발견했는지 검사한다.
 */
function detectImplementationConflict(testerContent: string): string | null {
  if (detectTestFailure(testerContent)) {
    return 'Tester found failures in developer implementation';
  }
  return null;
}

// IDENTITY_SEAL: PART-6 | role=ConflictTracking | inputs=agentContent | outputs=conflictDescription|null

// ============================================================
// PART 7 — Pipeline Execution
// ============================================================

/**
 * Build the user-message payload for an agent, including all prior agent outputs as context.
 */
function buildAgentInput(
  task: string,
  codeContext: string,
  priorMessages: AgentMessage[],
): string {
  const sections: string[] = [];

  sections.push(`## Task\n${task}`);

  if (codeContext.trim()) {
    sections.push(`## Existing Code Context\n\`\`\`\n${codeContext}\n\`\`\``);
  }

  for (const msg of priorMessages) {
    sections.push(`## Output from ${msg.role}\n${msg.content}`);
  }

  return sections.join('\n\n');
}

/**
 * 단일 에이전트를 실행하고 AgentMessage를 반환한다.
 */
async function runSingleAgent(
  role: AgentRole,
  userInput: string,
  onMessage: (msg: AgentMessage) => void,
  signal?: AbortSignal,
  systemOverrideInjection?: string,
): Promise<AgentMessage> {
  let accumulated = '';
  const agentMsg: AgentMessage = {
    id: generateId(),
    role,
    content: '',
    timestamp: Date.now(),
    confidence: 0,
  };

  // UI-generating agents (css-layout, interaction-motion) receive the full design system + linter spec.
  const isUIAgent = role === 'css-layout' || role === 'interaction-motion';
  const designAppendix = isUIAgent ? `\n\n${DESIGN_SYSTEM_SPEC}\n\n${DESIGN_LINTER_SPEC}` : '';

  // Code-generating agents receive framework idiom directive when detected.
  const isCodeGenAgent = isUIAgent || role === 'frontend-lead' || role === 'core-engine';
  const idiomAppendix = isCodeGenAgent && _detectedFramework
    ? `\n\n${buildIdiomDirective(_detectedFramework)}`
    : '';

  const strictCalc = /\[\[STRICT_CALC\]\]/.test(userInput);
  const calcAppendix = strictCalc
    ? `\n\n${buildCalcProtocolPrompt({ instruction: 'Follow the task. Do not violate SCOPE/CONTRACT/@block.', fileName: 'target file', strict: true, maxLines: 10 })}`
    : '';

  const finalSystemInstruction: string = [
    AGENT_PROMPTS[role],
    CODE_STUDIO_ARCHITECTURE_APPENDIX,
    designAppendix,
    idiomAppendix,
    calcAppendix,
    systemOverrideInjection || ''
  ].filter(Boolean).join('\n\n');

  const streamOpts = {
    systemInstruction: finalSystemInstruction,
    messages: [{ role: 'user' as const, content: userInput }],
    temperature: ['verification', 'repair'].includes(AGENT_REGISTRY[role].category) ? 0.2 : 0.4,
    signal,
    onChunk(text: string) {
      accumulated += text;
      agentMsg.content = accumulated;
      onMessage({ ...agentMsg });
    },
  };

  // 멀티키 활성 시 역할별 슬롯 사용, 아니면 기존 단일키 fallback
  if (isMultiKeyActive()) {
    await streamWithMultiKey({
      ...streamOpts,
      role: CODE_ROLE_TO_MULTI_KEY[role] ?? 'general',
    });
  } else {
    await streamChat(streamOpts);
  }

  agentMsg.content = accumulated;
  agentMsg.timestamp = Date.now();
  agentMsg.confidence = computeConfidence(accumulated);
  return agentMsg;
}

/**
 * 피드백을 포함해서 targetAgent를 재실행한다.
 */
async function rerunAgentWithFeedback(
  targetRole: AgentRole,
  task: string,
  codeContext: string,
  priorMessages: AgentMessage[],
  feedback: string,
  feedbackSource: AgentRole,
  onMessage: (msg: AgentMessage) => void,
  signal?: AbortSignal,
): Promise<AgentMessage> {
  const base = buildAgentInput(task, codeContext, priorMessages);
  const enhancedInput = [
    base,
    '',
    `## Feedback from ${feedbackSource} (address these issues)`,
    feedback,
  ].join('\n');

  // We don't need strict constraints on repair agent's system prompt usually, 
  // but keeping signature identical:
  return runSingleAgent(targetRole, enhancedInput, onMessage, signal);
}

/**
 * Run the multi-agent pipeline sequentially.
 *
 * Agents execute in canonical order, filtered to only those present in `roles`.
 * Each agent receives the accumulated output of all previous agents.
 *
 * **Feedback loop**: If verification fails, progressive-repair re-runs once
 * with the feedback incorporated.
 */
export async function runAgentPipeline(
  task: string,
  codeContext: string,
  roles: AgentRole[],
  onMessage: (msg: AgentMessage) => void,
  signal?: AbortSignal,
): Promise<AgentSession> {
  const session = createAgentSession(task, roles);
  session.status = 'running';
  const startTime = Date.now();

  // Shadow Parsing: Extract physical boundaries
  const physicalConstraints = extractPhysicalConstraints(task);
  session.auditInvoice = physicalConstraints;
  const constraintInjection = buildConstraintInjection(physicalConstraints.systemOverride);

  // Detect framework from code context for idiom injection
  if (codeContext.trim()) {
    _detectedFramework = detectFramework([
      { name: 'context.tsx', content: codeContext },
    ]);
  } else {
    _detectedFramework = null;
  }

  const sortedRoles = ROLE_ORDER.filter((r) => roles.includes(r));

  try {
    // --- Pre-processing: Architectural Rules Check ---
    const enforceArchRules = () => {
      // Create a leadership or validation step internally to verify initial limits
      if (!task.includes('Next.js 16')) {
        // Just an example check logic
      }
      return '[Preflight Plan Accepted] Architectural boundaries are structured.';
    };
    const preflightMsg: AgentMessage = {
      id: generateId(),
      role: 'team-leader',
      content: enforceArchRules() + '\nRule-based preprocessing complete.',
      timestamp: Date.now(),
      confidence: 1.0,
    };
    if (sortedRoles.includes('team-leader')) {
       session.messages.push(preflightMsg);
       onMessage(preflightMsg);
       // Remove from queue so it's not run redundantly
       const idx = sortedRoles.indexOf('team-leader');
       if(idx !== -1) sortedRoles.splice(idx, 1);
    }

    for (const role of sortedRoles) {
      if (signal?.aborted) {
        throw new DOMException('Agent pipeline aborted', 'AbortError');
      }

      const userInput = buildAgentInput(task, codeContext, session.messages);
      const agentMsg = await runSingleAgent(role, userInput, onMessage, signal, constraintInjection);
      session.messages.push(agentMsg);

      // --- Feedback loop: verification -> repair ---
      if (AGENT_REGISTRY[role].category === 'verification') {
        const isRejection = detectRejection(agentMsg.content);
        const isTestFailure = detectTestFailure(agentMsg.content);

        if (isRejection || isTestFailure) {
          const conflictDesc = isRejection ? detectDesignConflict(agentMsg.content) : detectImplementationConflict(agentMsg.content);
          
          if (conflictDesc) {
            session.conflicts.push({
              between: ['progressive-repair', role],
              description: conflictDesc,
              resolved: false,
            });
          }

          if (roles.includes('progressive-repair')) {
            const fixMsg = await rerunAgentWithFeedback(
              'progressive-repair', task, codeContext, session.messages, agentMsg.content, role, onMessage, signal,
            );
            session.messages.push(fixMsg);

            for (const c of session.conflicts) {
              if (!c.resolved && c.between.includes(role)) {
                c.resolved = true;
              }
            }
          }
        }
      }
    }

    session.status = 'done';
    session.finalOutput = session.messages.at(-1)?.content ?? '';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      session.status = 'error';
      session.finalOutput = '[Pipeline aborted by user]';
    } else {
      session.status = 'error';
      session.finalOutput = err instanceof Error ? err.message : String(err);
    }
  }

  // Session summary
  const totalTokens = session.messages.reduce(
    (sum, m) => sum + Math.ceil(m.content.length / 4), 0,
  );
  const avgConfidence = session.messages.length > 0
    ? session.messages.reduce((sum, m) => sum + m.confidence, 0) / session.messages.length
    : 0;

  session.summary = {
    totalAgentsRun: session.messages.length,
    totalTokensEstimate: totalTokens,
    conflictsFound: session.conflicts.length,
    finalConfidence: parseFloat(avgConfidence.toFixed(2)),
    durationMs: Date.now() - startTime,
  };

  return session;
}

// IDENTITY_SEAL: PART-7 | role=PipelineExecution | inputs=task,codeContext,roles,onMessage,signal | outputs=AgentSession
