// ============================================================
// PART 1 — Constants, Cache & Acceptance Tracking
// ============================================================
//
// Monaco의 InlineCompletionProvider를 사용하여 커서 위치에서
// AI가 코드를 인라인으로 제안한다.
// Tab으로 수락, Escape로 거부.

import { streamChat, getApiKey, getActiveProvider } from '@/lib/ai-providers';
import { createWebGpuWorker } from '@/lib/code-studio/ai/worker-loader';
import { ollamaFIM, shouldFallbackToCloud, recordLatency } from '@/lib/code-studio/ai/ollama-fim';

// 디바운스 + 취소 제어
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let abortController: AbortController | null = null;
let lastContext = '';

const DEFAULT_DEBOUNCE_MS = 1500; // AI-2 Damper: 휴지기(Idle) 1.5초 강제 적용
const MAX_CONTEXT_CHARS = 1500;

// 완성 캐시 (같은 컨텍스트에 재요청 방지)
const completionCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

// 수락률 추적
let totalSuggestions = 0;
let acceptedSuggestions = 0;

export function getAcceptanceRate(): number {
  return totalSuggestions > 0 ? acceptedSuggestions / totalSuggestions : 0;
}

export function trackAccepted(): void {
  acceptedSuggestions++;
  learnFromAccepted();
}

export function trackSuggested(): void {
  totalSuggestions++;
}

// IDENTITY_SEAL: PART-1 | role=constants-cache-tracking | inputs=none | outputs=getAcceptanceRate,trackAccepted,trackSuggested

// ============================================================
// PART 2 — Style Learning
// ============================================================

const STYLE_STORAGE_KEY = 'code_ghost_style_profile';

interface StyleProfile {
  avgLineLength: number;
  namingStyle: 'camel' | 'snake' | 'kebab' | 'unknown';
  useSemicolons: 'yes' | 'no' | 'unknown';
  sampleCount: number;
}

function getDefaultStyleProfile(): StyleProfile {
  return {
    avgLineLength: 60,
    namingStyle: 'unknown',
    useSemicolons: 'unknown',
    sampleCount: 0,
  };
}

/**
 * Load the persisted style profile from localStorage.
 */
export function loadStyleProfile(): StyleProfile {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY);
    if (!raw) return getDefaultStyleProfile();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return getDefaultStyleProfile();
    return {
      avgLineLength: Number(parsed.avgLineLength) || 60,
      namingStyle: ['camel', 'snake', 'kebab'].includes(parsed.namingStyle) ? parsed.namingStyle : 'unknown',
      useSemicolons: ['yes', 'no'].includes(parsed.useSemicolons) ? parsed.useSemicolons : 'unknown',
      sampleCount: Number(parsed.sampleCount) || 0,
    };
  } catch {
    return getDefaultStyleProfile();
  }
}

function saveStyleProfile(profile: StyleProfile): void {
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/**
 * Detect naming convention from an accepted completion.
 */
function detectNamingStyle(text: string): 'camel' | 'snake' | 'kebab' | 'unknown' {
  const identifiers = text.match(/\b[a-zA-Z_$][a-zA-Z0-9_$-]*\b/g) ?? [];
  let camelCount = 0;
  let snakeCount = 0;
  let kebabCount = 0;

  for (const id of identifiers) {
    if (id.length < 4) continue; // Too short to tell
    if (id.includes('_')) snakeCount++;
    else if (id.includes('-')) kebabCount++;
    else if (/[a-z][A-Z]/.test(id)) camelCount++;
  }

  if (camelCount >= snakeCount && camelCount >= kebabCount && camelCount > 0) return 'camel';
  if (snakeCount >= camelCount && snakeCount >= kebabCount && snakeCount > 0) return 'snake';
  if (kebabCount > 0) return 'kebab';
  return 'unknown';
}

/** Track the last accepted completion text for style learning */
let lastAcceptedText = '';

export function setLastAcceptedText(text: string): void {
  lastAcceptedText = text;
}

/**
 * Called when a suggestion is accepted. Updates the style profile
 * based on the accepted text.
 */
function learnFromAccepted(): void {
  if (!lastAcceptedText) return;

  const text = lastAcceptedText;
  lastAcceptedText = '';

  const profile = loadStyleProfile();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  // Average line length (exponential moving average)
  if (lines.length > 0) {
    const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
    const weight = Math.min(profile.sampleCount, 20);
    profile.avgLineLength = (profile.avgLineLength * weight + avgLen) / (weight + 1);
  }

  // Naming style
  const detected = detectNamingStyle(text);
  if (detected !== 'unknown') {
    profile.namingStyle = detected;
  }

  // Semicolons
  const hasSemi = /;\s*$/.test(text.trim());
  const noSemi = lines.length > 0 && lines.every((l) => !l.trim().endsWith(';'));
  if (hasSemi) profile.useSemicolons = 'yes';
  else if (noSemi && lines.length >= 2) profile.useSemicolons = 'no';

  profile.sampleCount++;
  saveStyleProfile(profile);
}

/**
 * Build style hint text for the AI prompt.
 */
function buildStyleHint(): string {
  const profile = loadStyleProfile();
  if (profile.sampleCount < 3) return '';

  const parts: string[] = [];
  parts.push(`Preferred avg line length: ~${Math.round(profile.avgLineLength)} chars.`);
  if (profile.namingStyle !== 'unknown') {
    parts.push(`Naming convention: ${profile.namingStyle}Case.`);
  }
  if (profile.useSemicolons !== 'unknown') {
    parts.push(`Semicolons: ${profile.useSemicolons === 'yes' ? 'always use' : 'omit'}.`);
  }
  return '\nUser code style preferences:\n' + parts.join(' ');
}

// IDENTITY_SEAL: PART-2 | role=style-learning | inputs=accepted completions | outputs=StyleProfile in localStorage

// ============================================================
// PART 3 — Adaptive Aggressiveness
// ============================================================

/**
 * Determine debounce delay based on acceptance rate.
 *  - rate > 60%  → 400ms (aggressive)
 *  - rate 30-60% → 600ms (normal)
 *  - rate < 30%  → 1000ms (conservative)
 */
function getAdaptiveDebounceMs(): number {
  const rate = getAcceptanceRate();
  const hasLocal = !!getApiKey('ollama');

  if (totalSuggestions < 5) return hasLocal ? 500 : DEFAULT_DEBOUNCE_MS;

  if (hasLocal && !shouldFallbackToCloud()) {
    // Local model: much shorter debounce (sub-200ms inference)
    if (rate > 0.6) return 300;
    if (rate >= 0.3) return 500;
    return 800;
  }

  // Cloud: conservative debounce
  if (rate > 0.6) return 1000;
  if (rate >= 0.3) return 1500;
  return 2000;
}

/**
 * Determine max completion tokens based on acceptance rate.
 *  - rate > 60%  → 200 tokens (allow longer suggestions)
 *  - rate 30-60% → 150 tokens (normal)
 *  - rate < 30%  → 80 tokens (shorter suggestions)
 */
function getAdaptiveMaxTokens(): number {
  const rate = getAcceptanceRate();
  if (totalSuggestions < 5) return 150;

  if (rate > 0.6) return 200;
  if (rate >= 0.3) return 150;
  return 80;
}

// IDENTITY_SEAL: PART-3 | role=adaptive-aggressiveness | inputs=acceptanceRate | outputs=debounceMs,maxTokens

// ============================================================
// PART 4 — Multi-line Completion Support
// ============================================================

/**
 * Detect if the cursor is at the end of an incomplete block.
 * Returns the type of block opening detected, or null.
 */
function detectIncompleteBlock(codeBefore: string): string | null {
  const lastLines = codeBefore.split('\n').slice(-5);
  const lastNonEmpty = [...lastLines].reverse().find((l) => l.trim().length > 0);
  if (!lastNonEmpty) return null;

  const trimmed = lastNonEmpty.trim();

  // function/method opening
  if (/(?:function\s+\w+|=>)\s*\(\s*[^)]*\)\s*\{?\s*$/.test(trimmed)) return 'function';
  if (/(?:function\s+\w+|=>\s*)\s*$/.test(trimmed)) return 'function';

  // Lines ending with { — a block is opening
  if (trimmed.endsWith('{')) {
    if (/\bfunction\b/.test(trimmed)) return 'function';
    if (/\bclass\b/.test(trimmed)) return 'class';
    if (/\bif\b/.test(trimmed)) return 'if';
    if (/\bfor\b/.test(trimmed)) return 'for';
    if (/\bwhile\b/.test(trimmed)) return 'while';
    if (/\bswitch\b/.test(trimmed)) return 'switch';
    return 'block';
  }

  // Class without body yet
  if (/\bclass\s+\w+/.test(trimmed) && !trimmed.includes('{')) return 'class';

  return null;
}

/**
 * Apply the current indentation level to all lines of a multi-line completion.
 */
function applyIndentation(completion: string, codeBefore: string): string {
  const lines = codeBefore.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  const currentIndent = lastLine.match(/^(\s*)/)?.[1] ?? '';

  const completionLines = completion.split('\n');
  if (completionLines.length <= 1) return completion;

  // First line: no extra indent (appended to current line)
  // Subsequent lines: rebase to current indentation level
  const firstLineIndent = completionLines[0].match(/^(\s*)/)?.[1] ?? '';

  return completionLines
    .map((line, i) => {
      if (i === 0) return line;
      if (line.trim() === '') return '';

      const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
      // Calculate relative indent from first line
      const relative = lineIndent.length - firstLineIndent.length;
      const targetIndent = currentIndent + ' '.repeat(Math.max(0, relative + 2));
      return targetIndent + line.trim();
    })
    .join('\n');
}

// IDENTITY_SEAL: PART-4 | role=multi-line-completion | inputs=codeBefore | outputs=blockType,indentedCompletion

// ============================================================
// PART 5 — Core Completion Engine
// ============================================================

const GHOST_SYSTEM = `You are a code completion engine. Output ONLY the code that should be inserted at the cursor position.
Rules:
- No explanations, no markdown, no backticks
- Output raw code only
- Can be multi-line if appropriate
- Match the existing code style (indentation, naming conventions)
- If unsure, output nothing

Negative examples (DO NOT output these):
- Import statements when cursor is inside a function body
- Duplicate of existing code above or below cursor
- Comments explaining obvious code
- Closing braces/brackets that already exist

Example:
Context: function calculateTotal(items: Item[]) {\\n  let total = 0;\\n  for (const item of items) {\\n    |
Completion: total += item.price * item.quantity;\\n  }\\n  return total;\\n}`;

/** Ghost Text 취소 */
export function cancelGhostText(): void {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = undefined; }
  if (abortController) { abortController.abort(); abortController = null; }
}

let vWorker: Worker | null = null;
let vCount = 0;
const vReqs = new Map<number, (res: string | null) => void>();

function initVWorker() {
  if (typeof window === 'undefined' || vWorker) return;
  try {
    vWorker = createWebGpuWorker();
    vWorker.postMessage({ type: 'INIT' });
    vWorker.onmessage = (e) => {
      const { type, reqId, completion, error } = e.data;
      if (type === 'FIM_SUCCESS' && vReqs.has(reqId)) {
        vReqs.get(reqId)!(completion);
        vReqs.delete(reqId);
      } else if (type === 'FIM_FALLBACK' && vReqs.has(reqId)) {
        vReqs.get(reqId)!(null);
        vReqs.delete(reqId);
      } else if (type === 'FIM_ERROR' && vReqs.has(reqId)) {
        console.error('V-Core Error:', error);
        vReqs.get(reqId)!(null);
        vReqs.delete(reqId);
      }
    };
  } catch (e) {
    console.warn('V-Core Worker init err:', e);
  }
}

/** Ghost Text 완성 요청 */
export async function requestGhostCompletion(
  codeBefore: string,
  codeAfter: string,
  language: string,
  signal?: AbortSignal,
): Promise<string> {
  const provider = getActiveProvider();
  const apiKey = getApiKey(provider);
  if (!apiKey) return '';

  // 컨텍스트 제한
  const before = codeBefore.slice(-MAX_CONTEXT_CHARS);
  const after = codeAfter.slice(0, 500);

  // 디듀플리케이션 + 캐시
  const contextKey = `${before}|${after}`;
  if (contextKey === lastContext) return '';
  lastContext = contextKey;

  // 캐시 히트
  const cached = completionCache.get(contextKey);
  if (cached) { trackSuggested(); return cached; }

  initVWorker();
  let result = '';
  let vCoreSuccess = false;
  
  if (vWorker) {
    const reqId = ++vCount;
    const localResult = await new Promise<string | null>((resolve) => {
      vReqs.set(reqId, resolve);
      vWorker!.postMessage({ type: 'FIM_REQUEST', payload: { codeBefore: before, codeAfter: after, language, reqId } });
      // 안전 장치: 1.5초 초과 시 클라우드로 우회
      setTimeout(() => {
        if (vReqs.has(reqId)) {
          console.warn('[V-Core] Timeout, switching to Cloud API');
          vReqs.delete(reqId);
          resolve(null);
        }
      }, 1500);
    });

    if (localResult !== null) {
      result = localResult;
      vCoreSuccess = true;
    }
  }

  // Tier 2: Ollama FIM (direct HTTP, no IPC overhead, sub-200ms target)
  if (!vCoreSuccess) {
    const ollamaUrl = getApiKey('ollama');
    if (ollamaUrl && !shouldFallbackToCloud()) {
      try {
        const preferredModel = (typeof localStorage !== 'undefined' && localStorage.getItem('noa_ollama_fim_model'))
          || localStorage.getItem('noa_active_model_ollama')
          || 'codellama:7b-code';
        const fimResult = await ollamaFIM({
          baseUrl: ollamaUrl,
          model: preferredModel,
          codeBefore: before,
          codeAfter: after,
          language,
          maxTokens: getAdaptiveMaxTokens(),
          signal,
        });
        recordLatency(fimResult.latencyMs);
        if (fimResult.completion) {
          result = fimResult.completion;
          vCoreSuccess = true;
        }
      } catch {
        // Fall through to cloud
      }
    }
  }

  // Tier 3: Cloud fallback (streamChat)
  if (!vCoreSuccess) {
    const blockType = detectIncompleteBlock(before);
    const multiLineHint = blockType
      ? `\nThe cursor is at the end of an incomplete ${blockType} block. Provide a multi-line completion (up to 10 lines) to complete the block.`
      : '';

    const styleHint = buildStyleHint();
    const maxTokens = getAdaptiveMaxTokens();

    const prompt = `Language: ${language}${styleHint}
Code before cursor:
\`\`\`
${before}
\`\`\`

Code after cursor:
\`\`\`
${after}
\`\`\`
${multiLineHint}
Complete the code at the cursor position:`;

    try {
      await streamChat({
        systemInstruction: GHOST_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens,
        signal,
        onChunk: (text: string) => { result += text; },
      });
    } catch {
      return '';
    }
  }

  // 클린업: 백틱/마크다운 제거
  let cleaned = result
    .replace(/^```\w*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Apply indentation for multi-line completions
  if (cleaned.includes('\n')) {
    cleaned = applyIndentation(cleaned, codeBefore);
  }

  // 캐시 저장
  if (cleaned) {
    if (completionCache.size >= MAX_CACHE_SIZE) {
      const firstKey = completionCache.keys().next().value;
      if (firstKey) completionCache.delete(firstKey);
    }
    completionCache.set(contextKey, cleaned);
    trackSuggested();
  }

  return cleaned;
}

// IDENTITY_SEAL: PART-5 | role=core-completion-engine | inputs=codeBefore,codeAfter,language | outputs=completion string

// ============================================================
// PART 6 — Monaco Provider Registration
// ============================================================

/**
 * Monaco InlineCompletionProvider 등록.
 * editor.onMount에서 호출한다.
 */
export function registerGhostTextProvider(
  monaco: typeof import('monaco-editor'),
  language: string = '*',
): import('monaco-editor').IDisposable {
  return monaco.languages.registerInlineCompletionsProvider(language, {
    provideInlineCompletions: async (model: import('monaco-editor').editor.ITextModel, position: import('monaco-editor').Position, _context: unknown, token: import('monaco-editor').CancellationToken) => {
      cancelGhostText();

      // API 키 없으면 스킵
      if (!getApiKey(getActiveProvider())) return { items: [] };

      const debounceMs = getAdaptiveDebounceMs();

      return new Promise((resolve) => {
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) { resolve({ items: [] }); return; }

          const controller = new AbortController();
          abortController = controller;

          // 커서 전후 코드 추출
          const fullText = model.getValue();
          const offset = model.getOffsetAt(position);
          const codeBefore = fullText.slice(0, offset);
          const codeAfter = fullText.slice(offset);
          const lang = model.getLanguageId();

          try {
            const completion = await requestGhostCompletion(codeBefore, codeAfter, lang, controller.signal);
            if (!completion || token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            // Store for style learning when accepted
            setLastAcceptedText(completion);

            // Calculate end position for multi-line completions
            const completionLines = completion.split('\n');
            const endLineNumber = position.lineNumber + completionLines.length - 1;
            const endColumn =
              completionLines.length === 1
                ? position.column + completion.length
                : completionLines[completionLines.length - 1].length + 1;

            resolve({
              items: [{
                insertText: completion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber,
                  endColumn: completionLines.length === 1 ? position.column : endColumn,
                },
              }],
            });
          } catch {
            resolve({ items: [] });
          }
        }, debounceMs);
      });
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// IDENTITY_SEAL: PART-6 | role=monaco-provider-registration | inputs=monaco,language | outputs=inline completion provider
