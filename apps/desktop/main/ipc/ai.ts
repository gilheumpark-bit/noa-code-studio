/**
 * apps/desktop/main/ipc/ai.ts
 *
 * AI chat IPC. Renderer never sees API keys — main process pulls
 * them from the keystore at request time.
 *
 * PART 1 — Provider registry + endpoint mapping
 * PART 2 — ARI circuit breaker (in-memory state)
 * PART 3 — Token estimation per provider
 * PART 4 — Request deduplication cache
 * PART 5 — Retry + fallback logic
 * PART 6 — Stream chunk forwarding with AbortController
 * PART 7 — Public registrar
 */

import { ipcMain, type WebContents } from 'electron';
import { randomUUID, createHash } from 'node:crypto';

import type { AIProvider, AIChatRequest, ARIState } from '@noa/shared-types';
import { getKey } from './keystore';
import { handleAiChatRequest, type ChatRequest } from '../services/ai-service';

// ============================================================
// PART 1 — Provider registry
// ============================================================

interface ProviderConfig {
  endpoint: string;
  authHeader: (key: string) => Record<string, string>;
  buildBody: (req: AIChatRequest) => Record<string, unknown>;
}

/** Ordered fallback priority: if the primary provider's circuit is open, try these in order */
const FALLBACK_PRIORITY: AIProvider[] = ['gemini', 'openai', 'claude', 'groq', 'ollama', 'lmstudio'];

const providers: Record<AIProvider, ProviderConfig> = {
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    authHeader: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    buildBody: (req) => ({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      messages: req.messages.filter((m) => m.role !== 'system'),
      system: req.messages.find((m) => m.role === 'system')?.content,
      stream: req.stream ?? true,
    }),
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    buildBody: (req) => ({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: req.stream ?? true,
    }),
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    authHeader: () => ({}), // gemini uses ?key= query param
    buildBody: (req) => ({
      contents: req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      systemInstruction: req.messages.find((m) => m.role === 'system')
        ? { parts: [{ text: req.messages.find((m) => m.role === 'system')!.content }] }
        : undefined,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096,
      },
    }),
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    buildBody: (req) => ({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: req.stream ?? true,
    }),
  },
  ollama: {
    endpoint: '', // dynamic: read from keystore (URL, not API key)
    authHeader: () => ({}), // no auth for local Ollama
    buildBody: (req) => ({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: req.stream ?? true,
    }),
  },
  lmstudio: {
    endpoint: '', // dynamic: read from keystore (URL)
    authHeader: () => ({}),
    buildBody: (req) => ({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream: req.stream ?? true,
    }),
  },
};

// ============================================================
// PART 2 — ARI Circuit Breaker (in-memory)
// ============================================================

const EMA_ALPHA = 0.3;
const FAILURE_THRESHOLD = 0.4;       // close-to-open if EMA drops below
const RECOVERY_THRESHOLD = 0.7;      // half-open to closed if EMA rises above
const OPEN_COOLDOWN_MS = 30_000;

const ari = new Map<AIProvider, ARIState>();

function getState(provider: AIProvider): ARIState {
  let s = ari.get(provider);
  if (!s) {
    s = {
      provider,
      ema: 1.0,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      state: 'closed',
    };
    ari.set(provider, s);
  }
  return s;
}

function recordSuccess(provider: AIProvider): void {
  const s = getState(provider);
  s.ema = EMA_ALPHA * 1.0 + (1 - EMA_ALPHA) * s.ema;
  s.consecutiveFailures = 0;
  if (s.state === 'half-open' && s.ema >= RECOVERY_THRESHOLD) {
    s.state = 'closed';
  }
}

function recordFailure(provider: AIProvider): void {
  const s = getState(provider);
  s.ema = EMA_ALPHA * 0.0 + (1 - EMA_ALPHA) * s.ema;
  s.consecutiveFailures += 1;
  s.lastFailureAt = Date.now();
  if (s.state === 'closed' && s.ema < FAILURE_THRESHOLD) {
    s.state = 'open';
  }
}

function canCall(provider: AIProvider): boolean {
  const s = getState(provider);
  if (s.state === 'closed') return true;
  if (s.state === 'half-open') return true;
  // open
  if (Date.now() - s.lastFailureAt > OPEN_COOLDOWN_MS) {
    s.state = 'half-open';
    return true;
  }
  return false;
}

// ============================================================
// PART 3 — Token estimation per provider
// ============================================================

interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  provider: AIProvider;
}

/**
 * Estimate input token count based on character analysis.
 * Claude/OpenAI/Groq: ~4 chars/token (English), ~2 chars/token (CJK).
 * Gemini/Ollama/LMStudio: similar heuristic.
 */
function estimateInputTokens(req: AIChatRequest): number {
  let totalChars = 0;
  for (const msg of req.messages) {
    totalChars += msg.content.length;
    totalChars += 4; // role overhead per message
  }

  const sampleText = req.messages.map((m) => m.content).join('');
  const cjkRegex = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g;
  const cjkMatches = sampleText.match(cjkRegex);
  const cjkRatio = sampleText.length > 0 && cjkMatches
    ? cjkMatches.length / sampleText.length
    : 0;
  const charsPerToken = cjkRatio > 0.3 ? 2 : 4;

  return Math.ceil(totalChars / charsPerToken);
}

function estimateOutputTokens(totalBytes: number, provider: AIProvider): number {
  // SSE overhead varies by provider format
  const overheadRatio: Record<AIProvider, number> = {
    claude: 0.35,
    openai: 0.40,
    gemini: 0.45,
    groq: 0.40,
    ollama: 0.30,
    lmstudio: 0.30,
  };
  const contentBytes = totalBytes * (1 - (overheadRatio[provider] ?? 0.35));
  return Math.ceil(contentBytes / 4);
}

// ============================================================
// PART 4 — Request deduplication cache
// ============================================================

const DEDUP_TTL_MS = 5_000;

interface DedupEntry {
  requestId: string;
  createdAt: number;
  chunks: string[];
  completed: boolean;
}

const dedupCache = new Map<string, DedupEntry>();

function pruneDedupCache(): void {
  const now = Date.now();
  for (const [hash, entry] of dedupCache) {
    if (now - entry.createdAt > DEDUP_TTL_MS * 2) {
      dedupCache.delete(hash);
    }
  }
}

function hashRequest(req: AIChatRequest): string {
  const payload = JSON.stringify({
    provider: req.provider,
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Replay cached chunks if an identical request was completed within the TTL.
 * Returns the requestId if replay succeeded, or null if no cache hit.
 */
function tryReplayDedup(
  sender: WebContents,
  req: AIChatRequest,
  newRequestId: string,
): string | null {
  pruneDedupCache();

  const hash = hashRequest(req);
  const cached = dedupCache.get(hash);
  if (!cached || !cached.completed) return null;
  if (Date.now() - cached.createdAt > DEDUP_TTL_MS) {
    dedupCache.delete(hash);
    return null;
  }

  const channels = makeChannels(newRequestId);
  for (const chunk of cached.chunks) {
    if (sender.isDestroyed()) break;
    sender.send(channels.chunk, chunk);
  }
  if (!sender.isDestroyed()) {
    sender.send(channels.end);
  }
  return newRequestId;
}

// ============================================================
// PART 5 — Retry + fallback logic
// ============================================================

const RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

async function findFallbackProvider(original: AIProvider): Promise<AIProvider | null> {
  for (const candidate of FALLBACK_PRIORITY) {
    if (candidate === original) continue;
    if (!canCall(candidate)) continue;
    const key = await getKey(candidate);
    if (key) return candidate;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// PART 6 — Streaming chat with AbortController
// ============================================================

/** Active AbortControllers keyed by requestId for cancellation support */
const activeControllers = new Map<string, AbortController>();

interface StreamChannels {
  chunk: string;
  error: string;
  end: string;
}

function makeChannels(requestId: string): StreamChannels {
  return {
    chunk: `ai:chat-chunk:${requestId}`,
    error: `ai:chat-error:${requestId}`,
    end: `ai:chat-end:${requestId}`,
  };
}

function cleanupRequest(requestId: string): void {
  activeControllers.delete(requestId);
}

interface CallResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  tokenEstimate?: TokenEstimate;
}

/**
 * Single attempt to call a provider. Does NOT handle retry/fallback.
 */
async function callProviderOnce(
  sender: WebContents,
  requestId: string,
  req: AIChatRequest,
  controller: AbortController,
): Promise<CallResult> {
  const channels = makeChannels(requestId);
  const dedupHash = hashRequest(req);

  if (!canCall(req.provider)) {
    return { ok: false, error: 'circuit-open' };
  }

  const config = providers[req.provider];
  if (!config) {
    return { ok: false, error: 'unknown-provider' };
  }

  const isLocal = req.provider === 'ollama' || req.provider === 'lmstudio';
  const key = await getKey(req.provider);
  if (!key) {
    sender.send(channels.error, {
      reason: 'no-key',
      provider: req.provider,
      message: isLocal
        ? `No URL configured for ${req.provider}. Add one in Settings.`
        : `No API key registered for ${req.provider}. Add one in Settings.`,
    });
    sender.send(channels.end);
    cleanupRequest(requestId);
    return { ok: false, error: 'no-key' };
  }

  try {
    let url: string;
    if (isLocal) {
      const baseUrl = key.replace(/\/+$/, '');
      url = `${baseUrl}/v1/chat/completions`;
    } else if (req.provider === 'gemini') {
      url = `${config.endpoint}/${req.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    } else {
      url = config.endpoint;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.authHeader(key),
    };

    const FETCH_TIMEOUT_MS = 30_000;
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort();
    }, FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(config.buildBody(req)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      recordFailure(req.provider);
      return { ok: false, error: `http ${res.status}`, httpStatus: res.status };
    }

    if (!res.body) {
      recordFailure(req.provider);
      return { ok: false, error: 'empty-body' };
    }

    // Prepare dedup cache entry
    const dedupEntry: DedupEntry = {
      requestId,
      createdAt: Date.now(),
      chunks: [],
      completed: false,
    };
    dedupCache.set(dedupHash, dedupEntry);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;

    try {
      while (true) {
        if (controller.signal.aborted) {
          try { await reader.cancel(); } catch { /* noop */ }
          cleanupRequest(requestId);
          sender.send(channels.error, { reason: 'cancelled', message: 'Request cancelled by user' });
          sender.send(channels.end);
          return { ok: false, error: 'cancelled' };
        }
        if (sender.isDestroyed()) {
          try { await reader.cancel(); } catch { /* noop */ }
          cleanupRequest(requestId);
          return { ok: false, error: 'sender-destroyed' };
        }

        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        const chunk = decoder.decode(value, { stream: true });
        sender.send(channels.chunk, chunk);
        dedupEntry.chunks.push(chunk);
      }
    } catch (readErr) {
      if (controller.signal.aborted) {
        cleanupRequest(requestId);
        sender.send(channels.error, { reason: 'cancelled', message: 'Request cancelled by user' });
        sender.send(channels.end);
        return { ok: false, error: 'cancelled' };
      }
      throw readErr;
    }

    dedupEntry.completed = true;
    recordSuccess(req.provider);

    const inputTokens = estimateInputTokens(req);
    const outputTokens = estimateOutputTokens(totalBytes, req.provider);

    const { recordTokenUsage } = await import('../services/ai-service');
    recordTokenUsage(inputTokens + outputTokens);

    sender.send(channels.end);
    cleanupRequest(requestId);

    return {
      ok: true,
      tokenEstimate: { inputTokens, outputTokens, provider: req.provider },
    };
  } catch (err) {
    cleanupRequest(requestId);

    if (controller.signal.aborted) {
      sender.send(channels.error, { reason: 'cancelled', message: 'Request cancelled by user' });
      sender.send(channels.end);
      return { ok: false, error: 'cancelled' };
    }

    recordFailure(req.provider);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Full provider call with dedup replay, retry on 429/503, and fallback.
 */
async function callProvider(
  sender: WebContents,
  requestId: string,
  req: AIChatRequest,
): Promise<CallResult> {
  const channels = makeChannels(requestId);
  const controller = new AbortController();
  activeControllers.set(requestId, controller);

  // 1. Try dedup replay
  const dedupHit = tryReplayDedup(sender, req, requestId);
  if (dedupHit !== null) {
    cleanupRequest(requestId);
    return { ok: true };
  }

  // 2. Primary provider attempt
  let result = await callProviderOnce(sender, requestId, req, controller);

  // 3. Retry once on 429/503
  if (
    !result.ok &&
    result.httpStatus !== undefined &&
    RETRYABLE_STATUS_CODES.has(result.httpStatus) &&
    !controller.signal.aborted
  ) {
    await sleep(RETRY_DELAY_MS);
    if (!controller.signal.aborted && !sender.isDestroyed()) {
      const retryController = new AbortController();
      activeControllers.set(requestId, retryController);
      result = await callProviderOnce(sender, requestId, req, retryController);
    }
  }

  // 4. Fallback provider if primary circuit is open
  if (!result.ok && result.error === 'circuit-open' && !controller.signal.aborted) {
    const fallback = await findFallbackProvider(req.provider);
    if (fallback && !sender.isDestroyed()) {
      const fallbackReq: AIChatRequest = { ...req, provider: fallback };
      const fallbackController = new AbortController();
      activeControllers.set(requestId, fallbackController);
      sender.send(channels.chunk, `[Falling back to ${fallback}]\n`);
      result = await callProviderOnce(sender, requestId, fallbackReq, fallbackController);
    }
  }

  // 5. Send error if all attempts failed
  if (!result.ok && result.error !== 'cancelled' && result.error !== 'no-key') {
    if (!sender.isDestroyed()) {
      sender.send(channels.error, {
        reason: result.error ?? 'unknown',
        provider: req.provider,
        message: result.error ?? 'Request failed after retry and fallback.',
      });
      sender.send(channels.end);
    }
  }

  cleanupRequest(requestId);
  return result;
}

// ============================================================
// PART 7 — Public registrar
// ============================================================

let registered = false;

export function registerAiIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('ai:chat-stream', async (event, req: AIChatRequest) => {
    const requestId = randomUUID();
    void callProvider(event.sender, requestId, req);
    return { requestId };
  });

  /** Cancel an in-flight streaming request by requestId */
  ipcMain.handle('ai:cancel-request', (_event, requestId: string) => {
    const controller = activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeControllers.delete(requestId);
      return { ok: true, cancelled: true };
    }
    return { ok: false, cancelled: false, reason: 'no-active-request' };
  });

  ipcMain.handle('ai:chat-request', async (event, request: ChatRequest) => {
    return handleAiChatRequest(event.sender, request);
  });

  ipcMain.handle('ai:ari-state', () => {
    return Array.from(ari.values()).map((s) => ({ ...s }));
  });

  ipcMain.handle('ai:ari-reset', (_event, provider?: AIProvider) => {
    if (provider) {
      ari.delete(provider);
    } else {
      ari.clear();
    }
    return { ok: true };
  });

  /** Expose active request count for debugging/monitoring */
  ipcMain.handle('ai:active-requests', () => {
    return { count: activeControllers.size, ids: Array.from(activeControllers.keys()) };
  });
}
