// ============================================================
// EHSU BYOK Multi-Key Manager
// ============================================================
// 최대 7개 API 키 슬롯. 에이전트별 키 할당. 병렬 처리. 과금 투명성.

import { encryptKey, decryptKey } from './ai-providers';

// ============================================================
// PART 1 — Types
// ============================================================

export type ProviderId = 'gemini' | 'openai' | 'claude' | 'groq' | 'mistral' | 'ollama' | 'lmstudio';

export type AgentRole =
  | 'writer'        // 집필 (소설 생성)
  | 'reviewer'      // 리뷰 (품질 평가)
  | 'translator'    // 번역
  | 'worldbuilder'  // 세계관 설계
  | 'coder'         // 코드 생성
  | 'analyst'       // 분석/채점
  | 'general';      // 범용

export interface KeySlot {
  id: string;                // 슬롯 ID (slot-1 ~ slot-7)
  provider: ProviderId;
  model: string;
  label: string;             // 사용자 지정 라벨 (e.g. "빠른 생성용", "고품질 리뷰")
  apiKey: string;             // 암호화 저장 (obfuscated)
  assignedRole: AgentRole;
  enabled: boolean;
  usage: SlotUsage;
}

export interface SlotUsage {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUsed: number | null;
  estimatedCostUSD: number;   // 대략적 비용 추정
}

export interface MultiKeyConfig {
  slots: KeySlot[];
  crossValidation: boolean;   // 크로스밸리데이션: 2개 이상 모델로 검증
  parallelExecution: boolean; // 병렬 실행 허용
  maxParallel: number;        // 최대 동시 호출 수
}

// ============================================================
// PART 2 — Default Config & Factory
// ============================================================

const STORAGE_KEY = 'ehsu_multi_key_config';

const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-2.5-pro',
  openai: 'gpt-5.4',
  claude: 'claude-sonnet-4-6',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-medium-3-latest',
  ollama: 'llama3.1',
  lmstudio: 'openai/gpt-oss-20b',
};

// 토큰당 대략적 비용 (USD, 출력 기준)
const COST_PER_1K_OUTPUT: Record<ProviderId, number> = {
  gemini: 0.002,
  openai: 0.015,
  claude: 0.015,
  groq: 0.0008,
  mistral: 0.002,
  ollama: 0,
  lmstudio: 0,
};

export function createEmptySlot(index: number): KeySlot {
  return {
    id: `slot-${index}`,
    provider: 'gemini',
    model: DEFAULT_MODELS.gemini,
    label: `Slot ${index}`,
    apiKey: '',
    assignedRole: 'general',
    enabled: false,
    usage: { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, lastUsed: null, estimatedCostUSD: 0 },
  };
}

export function createDefaultConfig(): MultiKeyConfig {
  return {
    slots: Array.from({ length: 7 }, (_, i) => createEmptySlot(i + 1)),
    crossValidation: false,
    parallelExecution: true,
    maxParallel: 3,
  };
}

// ============================================================
// PART 3 — Persistence (localStorage)
// ============================================================

export function saveMultiKeyConfig(config: MultiKeyConfig): void {
  if (typeof window === 'undefined') return;
  try {
    // API 키는 간단한 난독화 적용
    const serializable = {
      ...config,
      slots: config.slots.map((s) => ({
        ...s,
        apiKey: s.apiKey ? obfuscate(s.apiKey) : '',
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch { /* quota */ }
}

export function loadMultiKeyConfig(): MultiKeyConfig {
  if (typeof window === 'undefined') return createDefaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultConfig();
    const parsed = JSON.parse(raw) as MultiKeyConfig;
    // 복호화
    parsed.slots = parsed.slots.map((s) => ({
      ...s,
      apiKey: s.apiKey ? deobfuscate(s.apiKey) : '',
    }));
    // 7개 슬롯 보장
    while (parsed.slots.length < 7) {
      parsed.slots.push(createEmptySlot(parsed.slots.length + 1));
    }
    return parsed;
  } catch { return createDefaultConfig(); }
}

/**
 * Legacy XOR obfuscation — kept for backward-compatible reads of existing
 * `mk:`-prefixed values in localStorage. New writes go through AES-GCM via
 * the async save/load variants below.
 */
function obfuscate(key: string): string {
  const salt = 'ehsu';
  return 'mk:' + btoa(key.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length))).join(''));
}

function deobfuscate(encoded: string): string {
  if (!encoded.startsWith('mk:')) return encoded;
  const salt = 'ehsu';
  const decoded = atob(encoded.slice(3));
  return decoded.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length))).join('');
}

// ── AES-GCM async variants (v4 migration) ──
// Uses the same AES-GCM flow as ai-providers.ts encryptKey/decryptKey.
// decryptKey auto-detects format (v4 AES-GCM, v3 XOR, legacy, plaintext),
// so existing mk:-prefixed or plaintext values are transparently upgraded
// on the next async save cycle.

/** Async save — encrypts API keys with AES-GCM (v4). Preferred over saveMultiKeyConfig. */
export async function saveMultiKeyConfigAsync(config: MultiKeyConfig): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const encryptedSlots = await Promise.all(
      config.slots.map(async (s) => ({
        ...s,
        apiKey: s.apiKey ? await encryptKey(s.apiKey) : '',
      })),
    );
    const serializable = { ...config, slots: encryptedSlots };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch { /* quota or crypto failure — silent */ }
}

/** Async load — decrypts API keys (supports v4 AES-GCM + legacy mk: + plaintext). */
export async function loadMultiKeyConfigAsync(): Promise<MultiKeyConfig> {
  if (typeof window === 'undefined') return createDefaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultConfig();
    const parsed = JSON.parse(raw) as MultiKeyConfig;
    parsed.slots = await Promise.all(
      parsed.slots.map(async (s) => {
        if (!s.apiKey) return { ...s, apiKey: '' };
        // decryptKey handles v4 (noa:4:), v3 (noa:3:), and plaintext.
        // For legacy mk: prefix, fall back to local deobfuscate.
        const key = s.apiKey.startsWith('mk:')
          ? deobfuscate(s.apiKey)
          : await decryptKey(s.apiKey);
        return { ...s, apiKey: key };
      }),
    );
    while (parsed.slots.length < 7) {
      parsed.slots.push(createEmptySlot(parsed.slots.length + 1));
    }
    return parsed;
  } catch { return createDefaultConfig(); }
}

// ============================================================
// PART 4 — Slot Lookup & Assignment
// ============================================================

/** 역할에 할당된 활성 슬롯 가져오기 */
export function getSlotForRole(config: MultiKeyConfig, role: AgentRole): KeySlot | null {
  // 정확한 역할 매칭 우선
  const exact = config.slots.find((s) => s.enabled && s.apiKey && s.assignedRole === role);
  if (exact) return exact;
  // general fallback
  const general = config.slots.find((s) => s.enabled && s.apiKey && s.assignedRole === 'general');
  return general ?? null;
}

/** 크로스밸리데이션용: 같은 역할 또는 general인 슬롯 2개 이상 */
export function getSlotsForCrossValidation(config: MultiKeyConfig, role: AgentRole): KeySlot[] {
  const candidates = config.slots.filter((s) => s.enabled && s.apiKey && (s.assignedRole === role || s.assignedRole === 'general'));
  return candidates.slice(0, 3); // 최대 3개
}

/** 활성 슬롯 수 */
export function getActiveSlotCount(config: MultiKeyConfig): number {
  return config.slots.filter((s) => s.enabled && s.apiKey).length;
}

/** 전체 사용량 요약 */
export function getTotalUsage(config: MultiKeyConfig): { calls: number; tokens: number; cost: number } {
  return config.slots.reduce((acc, s) => ({
    calls: acc.calls + s.usage.totalCalls,
    tokens: acc.tokens + s.usage.totalInputTokens + s.usage.totalOutputTokens,
    cost: acc.cost + s.usage.estimatedCostUSD,
  }), { calls: 0, tokens: 0, cost: 0 });
}

// ============================================================
// PART 5 — Usage Tracking
// ============================================================

/** 슬롯 사용 기록 업데이트 */
export function trackSlotUsage(
  config: MultiKeyConfig,
  slotId: string,
  inputTokens: number,
  outputTokens: number,
): MultiKeyConfig {
  return {
    ...config,
    slots: config.slots.map((s) => {
      if (s.id !== slotId) return s;
      const costPer1K = COST_PER_1K_OUTPUT[s.provider] ?? 0;
      return {
        ...s,
        usage: {
          totalCalls: s.usage.totalCalls + 1,
          totalInputTokens: s.usage.totalInputTokens + inputTokens,
          totalOutputTokens: s.usage.totalOutputTokens + outputTokens,
          lastUsed: Date.now(),
          estimatedCostUSD: s.usage.estimatedCostUSD + (outputTokens / 1000) * costPer1K,
        },
      };
    }),
  };
}

/** 사용량 초기화 */
export function resetSlotUsage(config: MultiKeyConfig, slotId: string): MultiKeyConfig {
  return {
    ...config,
    slots: config.slots.map((s) =>
      s.id === slotId
        ? { ...s, usage: { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, lastUsed: null, estimatedCostUSD: 0 } }
        : s
    ),
  };
}

// ============================================================
// PART 6 — Parallel Execution Engine
// ============================================================

export interface ParallelResult<T> {
  slotId: string;
  provider: ProviderId;
  model: string;
  result: T;
  durationMs: number;
}

/**
 * 여러 슬롯에서 동시에 같은 작업 실행 (크로스밸리데이션용).
 * 각 슬롯의 결과를 모아서 반환.
 */
export async function executeParallel<T>(
  slots: KeySlot[],
  task: (slot: KeySlot) => Promise<T>,
  maxParallel: number = 3,
): Promise<ParallelResult<T>[]> {
  const limited = slots.slice(0, maxParallel);
  const results = await Promise.allSettled(
    limited.map(async (slot) => {
      const start = Date.now();
      const result = await task(slot);
      return {
        slotId: slot.id,
        provider: slot.provider,
        model: slot.model,
        result,
        durationMs: Date.now() - start,
      };
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<ParallelResult<T>>).value);
}

// ============================================================
// PART 7 — Cross-Validation
// ============================================================

export interface CrossValidationResult {
  consensus: boolean;         // 결과 합의 여부
  results: Array<{
    slotId: string;
    provider: ProviderId;
    model: string;
    score: number;            // 0~1
    response: string;
  }>;
  avgScore: number;
  divergence: number;         // 결과 차이 정도 (0=일치, 1=완전 불일치)
}

/**
 * 크로스밸리데이션: 여러 모델에 같은 질문 → 결과 비교.
 * 점수형 응답을 기대하는 경우에 적합.
 */
export function evaluateCrossValidation(
  results: Array<{ score: number; response: string; slotId: string; provider: ProviderId; model: string }>,
): CrossValidationResult {
  if (results.length === 0) {
    return { consensus: false, results: [], avgScore: 0, divergence: 1 };
  }

  const scores = results.map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxDiff = Math.max(...scores) - Math.min(...scores);
  const consensus = maxDiff < 0.2; // 20% 이내면 합의

  return {
    consensus,
    results,
    avgScore: Math.round(avg * 1000) / 1000,
    divergence: Math.round(maxDiff * 1000) / 1000,
  };
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=KeySlot,MultiKeyConfig
// IDENTITY_SEAL: PART-2 | role=Factory | inputs=none | outputs=defaults
// IDENTITY_SEAL: PART-3 | role=Persistence | inputs=config | outputs=localStorage
// IDENTITY_SEAL: PART-4 | role=SlotLookup | inputs=config,role | outputs=KeySlot
// IDENTITY_SEAL: PART-5 | role=UsageTracking | inputs=config,tokens | outputs=updated config
// IDENTITY_SEAL: PART-6 | role=ParallelExec | inputs=slots,task | outputs=ParallelResult[]
// IDENTITY_SEAL: PART-7 | role=CrossValidation | inputs=results | outputs=CrossValidationResult
