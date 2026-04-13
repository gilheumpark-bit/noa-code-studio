/**
 * @noa/shared-types — types shared by quill-engine, quill-cli, and desktop.
 *
 * Rule: Types only. No runtime code, no Node API imports.
 */

// ============================================================
// PART 1 — i18n
// ============================================================

export type AppLanguage = 'KO' | 'EN' | 'JP' | 'CN';

// ============================================================
// PART 2 — Verify report contract
// ============================================================

export type Severity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface VerifyIssue {
  ruleId: string;          // e.g. 'sec-001', 'api-014'
  severity: Severity;
  file: string;            // absolute or workspace-relative
  line: number;
  column?: number;
  message: string;
  category: 'security' | 'api' | 'runtime' | 'typing' | 'logging' | 'performance' | 'complexity' | 'style' | 'test' | 'resource' | 'error' | 'config' | 'aip' | 'syntax' | 'asyn' | 'var' | 'res';
  fix?: VerifyFix;
}

export interface VerifyFix {
  kind: 'replace' | 'insert' | 'delete';
  start: { line: number; column: number };
  end: { line: number; column: number };
  text?: string;
  description: string;
}

export interface VerifyReport {
  file: string;
  issues: VerifyIssue[];
  durationMs: number;
  detectorVersion: string;
  passedRules: number;
  totalRules: number;
}

// ============================================================
// PART 3 — Provider / AI shapes
// ============================================================

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'groq' | 'ollama' | 'lmstudio';
export type LocalAIProvider = 'ollama' | 'lmstudio';
export function isLocalProvider(p: AIProvider): p is LocalAIProvider {
  return p === 'ollama' || p === 'lmstudio';
}

export interface AIChatRequest {
  provider: AIProvider;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AIChatChunk {
  type: 'text' | 'done' | 'error';
  text?: string;
  error?: string;
}

// ============================================================
// PART 4 — Scope policy
// ============================================================

export type ScopeLevel = 'global' | 'workspace' | 'module';

export interface ScopePolicy {
  level: ScopeLevel;
  ruleOverrides?: Record<string, 'on' | 'off' | Severity>;
  excludePatterns?: string[];
}

// ============================================================
// PART 5 — ARI circuit breaker
// ============================================================

export interface ARIState {
  provider: AIProvider;
  ema: number;              // exponential moving average score
  consecutiveFailures: number;
  lastFailureAt: number;    // unix ms
  state: 'closed' | 'open' | 'half-open';
}
