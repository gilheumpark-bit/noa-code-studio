// ============================================================
// EHSU Multi-Key Bridge
// ============================================================
// multi-key-manager ↔ ai-providers 연결.
// 멀티키 설정이 있으면 역할별 슬롯 사용, 없으면 기존 단일키 fallback.

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import {
  type AgentRole,
  type KeySlot,
  loadMultiKeyConfig,
  saveMultiKeyConfig,
  getSlotForRole,
  getSlotsForCrossValidation,
  getActiveSlotCount,
  trackSlotUsage,
  executeParallel,
  evaluateCrossValidation,
  type CrossValidationResult,
} from './multi-key-manager';

import {
  type ProviderId,
  type StreamOptions,
  type ChatMsg,
  streamChat as originalStreamChat,
  getActiveProvider,
  getApiKey,
  setActiveProvider,
  setApiKey,
  getActiveModel,
  setActiveModel,
} from './ai-providers';

// ============================================================
// PART 2 — Slot-aware Streaming
// ============================================================

export interface MultiKeyStreamOptions extends Omit<StreamOptions, 'onChunk'> {
  role?: AgentRole;
  onChunk: (text: string) => void;
  /** 특정 슬롯 강제 지정 (역할 매칭 무시) */
  forceSlotId?: string;
}

/**
 * 멀티키 스트리밍.
 * 1. 멀티키 활성 슬롯이 있으면 역할별 슬롯 사용
 * 2. 없으면 기존 단일키 streamChat fallback
 * 3. 사용량 자동 추적
 */
export async function streamWithMultiKey(opts: MultiKeyStreamOptions): Promise<{
  text: string;
  slotId: string | null;
  provider: ProviderId;
  model: string;
}> {
  const config = loadMultiKeyConfig();
  const activeCount = getActiveSlotCount(config);

  // Fallback: 멀티키 미설정 → 기존 단일키
  if (activeCount === 0) {
    let accumulated = '';
    const text = await originalStreamChat({
      ...opts,
      onChunk: (chunk) => {
        accumulated += chunk;
        opts.onChunk(chunk);
      },
    });
    return {
      text,
      slotId: null,
      provider: getActiveProvider(),
      model: getActiveModel(),
    };
  }

  // 슬롯 결정
  const role = opts.role ?? 'general';
  let slot: KeySlot | null = null;

  if (opts.forceSlotId) {
    slot = config.slots.find((s) => s.id === opts.forceSlotId && s.enabled && s.apiKey) ?? null;
  }
  if (!slot) {
    slot = getSlotForRole(config, role);
  }

  // 슬롯 없으면 fallback
  if (!slot) {
    let accumulated = '';
    const text = await originalStreamChat({
      ...opts,
      onChunk: (chunk) => {
        accumulated += chunk;
        opts.onChunk(chunk);
      },
    });
    return {
      text,
      slotId: null,
      provider: getActiveProvider(),
      model: getActiveModel(),
    };
  }

  // 임시로 활성 프로바이더/모델/키 전환 → streamChat 호출 → 복원
  const prevProvider = getActiveProvider();
  const prevModel = getActiveModel();
  const prevKey = getApiKey(slot.provider);

  setActiveProvider(slot.provider);
  setActiveModel(slot.model);
  setApiKey(slot.provider, slot.apiKey);

  let accumulated = '';
  try {
    const text = await originalStreamChat({
      ...opts,
      onChunk: (chunk) => {
        accumulated += chunk;
        opts.onChunk(chunk);
      },
    });

    // 사용량 추적 (대략적 토큰 추정: 4자 ≈ 1토큰)
    const inputTokens = Math.ceil(
      opts.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
    );
    const outputTokens = Math.ceil(text.length / 4);
    const updatedConfig = trackSlotUsage(config, slot.id, inputTokens, outputTokens);
    saveMultiKeyConfig(updatedConfig);

    return {
      text,
      slotId: slot.id,
      provider: slot.provider,
      model: slot.model,
    };
  } finally {
    // 원래 설정 복원
    setActiveProvider(prevProvider);
    setActiveModel(prevModel);
    if (prevKey !== undefined) setApiKey(slot.provider, prevKey);
  }
}

// ============================================================
// PART 3 — Cross-Validation Streaming
// ============================================================

export interface CrossValidationOptions {
  role: AgentRole;
  systemInstruction: string;
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** 점수 추출 함수: 응답 텍스트 → 0~1 점수 */
  scoreExtractor: (response: string) => number;
}

/**
 * 크로스밸리데이션: 여러 모델에 동일 질문 → 결과 비교.
 * crossValidation이 비활성이거나 후보가 2개 미만이면 단일 호출 fallback.
 */
export async function streamWithCrossValidation(
  opts: CrossValidationOptions
): Promise<CrossValidationResult> {
  const config = loadMultiKeyConfig();

  if (!config.crossValidation) {
    // 단일 호출
    const slot = getSlotForRole(config, opts.role);
    if (!slot) {
      return { consensus: false, results: [], avgScore: 0, divergence: 1 };
    }

    let fullText = '';
    await streamWithMultiKey({
      role: opts.role,
      systemInstruction: opts.systemInstruction,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
      onChunk: (c) => { fullText += c; },
    });

    const score = opts.scoreExtractor(fullText);
    return evaluateCrossValidation([{
      score,
      response: fullText,
      slotId: slot.id,
      provider: slot.provider,
      model: slot.model,
    }]);
  }

  // 병렬 크로스밸리데이션
  const candidates = getSlotsForCrossValidation(config, opts.role);
  if (candidates.length < 2) {
    // 후보 부족 → 단일 호출
    const slot = candidates[0] ?? getSlotForRole(config, opts.role);
    if (!slot) {
      return { consensus: false, results: [], avgScore: 0, divergence: 1 };
    }

    let fullText = '';
    await streamWithMultiKey({
      role: opts.role,
      forceSlotId: slot.id,
      systemInstruction: opts.systemInstruction,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
      onChunk: (c) => { fullText += c; },
    });

    const score = opts.scoreExtractor(fullText);
    return evaluateCrossValidation([{
      score,
      response: fullText,
      slotId: slot.id,
      provider: slot.provider,
      model: slot.model,
    }]);
  }

  // 병렬 실행
  const parallelResults = await executeParallel(
    candidates,
    async (slot) => {
      // 각 슬롯별 독립 호출
      const prevProvider = getActiveProvider();
      const prevModel = getActiveModel();
      const prevKey = getApiKey(slot.provider);

      setActiveProvider(slot.provider);
      setActiveModel(slot.model);
      setApiKey(slot.provider, slot.apiKey);

      try {
        let text = '';
        await originalStreamChat({
          systemInstruction: opts.systemInstruction,
          messages: opts.messages,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          signal: opts.signal,
          onChunk: (c) => { text += c; },
        });

        // 사용량 추적
        const inputTokens = Math.ceil(
          opts.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
        );
        const outputTokens = Math.ceil(text.length / 4);
        const updatedConfig = trackSlotUsage(loadMultiKeyConfig(), slot.id, inputTokens, outputTokens);
        saveMultiKeyConfig(updatedConfig);

        return text;
      } finally {
        setActiveProvider(prevProvider);
        setActiveModel(prevModel);
        if (prevKey !== undefined) setApiKey(slot.provider, prevKey);
      }
    },
    config.maxParallel,
  );

  // 점수 추출 & 평가
  const scored = parallelResults.map((r) => ({
    score: opts.scoreExtractor(r.result),
    response: r.result,
    slotId: r.slotId,
    provider: r.provider,
    model: r.model,
  }));

  return evaluateCrossValidation(scored);
}

// ============================================================
// PART 4 — Utility Exports
// ============================================================

/** 현재 멀티키가 활성 상태인지 */
export function isMultiKeyActive(): boolean {
  const config = loadMultiKeyConfig();
  return getActiveSlotCount(config) > 0;
}

/** 역할에 할당된 슬롯 정보 (UI 표시용) */
export function getSlotInfoForRole(role: AgentRole): {
  available: boolean;
  provider?: ProviderId;
  model?: string;
  label?: string;
} {
  const config = loadMultiKeyConfig();
  const slot = getSlotForRole(config, role);
  if (!slot) return { available: false };
  return {
    available: true,
    provider: slot.provider,
    model: slot.model,
    label: slot.label,
  };
}

/** 모든 활성 슬롯의 역할 매핑 (UI 표시용) */
export function getActiveRoleMap(): Array<{
  slotId: string;
  provider: ProviderId;
  model: string;
  role: AgentRole;
  label: string;
}> {
  const config = loadMultiKeyConfig();
  return config.slots
    .filter((s) => s.enabled && s.apiKey)
    .map((s) => ({
      slotId: s.id,
      provider: s.provider,
      model: s.model,
      role: s.assignedRole,
      label: s.label,
    }));
}

// IDENTITY_SEAL: PART-1 | role=Imports | inputs=none | outputs=types
// IDENTITY_SEAL: PART-2 | role=SlotStreaming | inputs=role,messages | outputs=text,slotId
// IDENTITY_SEAL: PART-3 | role=CrossValidation | inputs=role,messages,scoreExtractor | outputs=CrossValidationResult
// IDENTITY_SEAL: PART-4 | role=Utilities | inputs=role | outputs=slotInfo,roleMap
