import { GoogleGenAI } from '@google/genai';

// ============================================================
// PART 1: CONSTANTS & CONFIG
// ============================================================

const OPENAI_COMPAT_URLS: Record<string, string> = {
  openai:  'https://api.openai.com/v1/chat/completions',
  groq:    'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};

// ============================================================
// PART 2: TYPES & HELPERS
// ============================================================

export type ServerProviderId = 'openai' | 'gemini' | 'claude' | 'groq' | 'mistral';
export type UserTier = 'free' | 'pro' | 'internal';
export type AdapterMode = 'LEFT_BRAIN' | 'RIGHT_BRAIN';

export function normalizeUserApiKey(key?: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.startsWith('sk-') || trimmed.startsWith('AIza')) return trimmed;
  return '';
}

export function isGeminiAllocationExhaustedError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes('429') || 
    msg.includes('quota') || 
    msg.includes('limit') || 
    msg.includes('exhausted')
  );
}

export function resolveServerProviderKey(provider: string, _clientKey?: string): string | null {
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  return envKey || null;
}

export function hasServerProviderCredentials(provider: string): boolean {
  return !!process.env[`${provider.toUpperCase()}_API_KEY`];
}

export function getTierLimits(tier: string) {
  return { tier, dailyLimit: 500_000 };
}

function createServerGeminiClient(apiKey?: string): GoogleGenAI {
  const explicitApiKey = apiKey?.trim();
  if (explicitApiKey) {
    return new GoogleGenAI({ apiKey: explicitApiKey });
  }

  const envApiKey = process.env.GEMINI_API_KEY?.trim();
  if (envApiKey) {
    return new GoogleGenAI({ apiKey: envApiKey });
  }

  throw new Error('Gemini server credentials are not configured');
}

// ============================================================
// PART 3: STREAMING PREPARATIONS
// ============================================================

async function streamOpenAICompat(
  provider: string, apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[], temperature: number,
  customBaseUrl?: string,
): Promise<ReadableStream> {
  const url = customBaseUrl
    ? `${customBaseUrl.replace(/\/$/, '')}/v1/chat/completions`
    : OPENAI_COMPAT_URLS[provider];
  if (!url) throw new Error(`Unknown provider: ${provider}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && !customBaseUrl) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${provider} API ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('Empty response body');
  return res.body as unknown as ReadableStream;
}

async function streamClaude(
  apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[], temperature: number,
  maxTokens?: number
): Promise<ReadableStream> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens ?? 8192, system, messages, temperature, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('Empty response body');
  return res.body as unknown as ReadableStream;
}

async function streamGemini(
  apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[], temperature: number
): Promise<ReadableStream> {
  const ai = createServerGeminiClient(apiKey);
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
  const streamingResponse = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: system,
      temperature,
      topP: 0.95,
    },
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let emittedText = '';
      try {
        // Handle both object-with-stream and direct-generator patterns (SDK shape varies by version).
        type GeminiChunk = { text?: string };
        type StreamSource = AsyncIterable<GeminiChunk> & { stream?: AsyncIterable<GeminiChunk> };
        const sr = streamingResponse as StreamSource;
        const iterable: AsyncIterable<GeminiChunk> =
          sr.stream ?? sr;
        for await (const chunk of iterable) {
          const rawText = typeof chunk?.text === 'string' ? chunk.text : '';
          if (!rawText) continue;

          const text = rawText.startsWith(emittedText)
            ? rawText.slice(emittedText.length)
            : rawText;

          if (!text) continue;

          emittedText += text;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            candidates: [{ content: { parts: [{ text }] } }],
          })}\n\n`));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ============================================================
// PART 4: SECURITY GATE — NOA Pattern Scanner
// ============================================================

export type NoaSensitivity = 'strict' | 'normal' | 'permissive';

interface NoaResult {
  allowed: boolean;
  tactical: { reason: string };
  auditEntry: { id: string };
}

interface NoaInput {
  text: string;
  domain?: string;
  sourceTier?: number;
  sensitivity?: NoaSensitivity;
}

// --- 4-A: Prompt Injection Patterns ---

const PROMPT_INJECTION_PATTERNS_STRICT: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your)\s+(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an|in)\s+/i,
  /new\s+system\s+prompt/i,
  /override\s+system\s+(prompt|instructions|message)/i,
  /act\s+as\s+(if\s+)?(you\s+have\s+)?no\s+(restrictions|rules|limitations)/i,
  /\bDAN\b.*\bmode\b/i,
  /jailbreak/i,
  /bypass\s+(safety|filter|content|restriction)/i,
  /pretend\s+(you\s+are|to\s+be|you're)\s/i,
  /roleplay\s+as\s+(a\s+)?system/i,
  /\[system\]\s*:/i,
  /<<\s*SYS\s*>>/i,
  /###\s*(system|instruction)\s*(prompt|override)/i,
  /\bsudo\s+mode\b/i,
  /developer\s+mode\s+(enabled|activated|on)/i,
];

const PROMPT_INJECTION_PATTERNS_NORMAL: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /override\s+system\s+(prompt|instructions)/i,
  /\bDAN\b.*\bmode\b/i,
  /jailbreak/i,
  /bypass\s+(safety|filter|content|restriction)/i,
  /\[system\]\s*:/i,
  /<<\s*SYS\s*>>/i,
  /developer\s+mode\s+(enabled|activated|on)/i,
];

// --- 4-B: Code Injection Patterns ---

const CODE_INJECTION_PATTERNS: RegExp[] = [
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\b__import__\s*\(/,
  /\bos\.system\s*\(/,
  /\bsubprocess\.(call|run|Popen)\s*\(/,
  /\bchild_process\b/,
  /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
  /\bspawn\s*\(\s*['"](?:cmd|sh|bash|powershell)['"]/i,
  /\bnew\s+Function\s*\(/,
  /\bprocess\.env\b.*(?:=|delete\s)/,
  /\bfs\.(unlink|rmdir|rm|writeFile)Sync?\s*\(/,
];

// --- 4-C: PII Leakage Patterns ---

const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, label: 'SSN' },
  { pattern: /\b\d{9}\b(?=.*\b(ssn|social)\b)/i, label: 'SSN_CONTEXT' },
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, label: 'CREDIT_CARD' },
  { pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/, label: 'OPENAI_KEY' },
  { pattern: /\b(AIza[a-zA-Z0-9_-]{35})\b/, label: 'GOOGLE_KEY' },
  { pattern: /\b(sk-ant-[a-zA-Z0-9_-]{20,})\b/, label: 'ANTHROPIC_KEY' },
  { pattern: /\b(gsk_[a-zA-Z0-9]{20,})\b/, label: 'GROQ_KEY' },
  { pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/, label: 'GITHUB_TOKEN' },
  { pattern: /\b(xoxb-[0-9]{10,}-[a-zA-Z0-9]+)\b/, label: 'SLACK_TOKEN' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS_ACCESS_KEY' },
];

// --- 4-D: Scanner Engine ---

function scanPromptInjection(text: string, sensitivity: NoaSensitivity): string | null {
  if (sensitivity === 'permissive') return null;
  const patterns = sensitivity === 'strict'
    ? PROMPT_INJECTION_PATTERNS_STRICT
    : PROMPT_INJECTION_PATTERNS_NORMAL;

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return `PROMPT_INJECTION:${pattern.source.slice(0, 40)}`;
    }
  }
  return null;
}

function scanCodeInjection(text: string, sensitivity: NoaSensitivity): string | null {
  if (sensitivity === 'permissive') return null;

  // Only scan inside code fences or the full text in strict mode
  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
  const codeBlocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push(match[0]);
  }

  const targets = sensitivity === 'strict'
    ? [text]
    : codeBlocks;

  if (targets.length === 0) return null;

  for (const target of targets) {
    for (const pattern of CODE_INJECTION_PATTERNS) {
      if (pattern.test(target)) {
        return `CODE_INJECTION:${pattern.source.slice(0, 40)}`;
      }
    }
  }
  return null;
}

function scanPiiLeakage(text: string, sensitivity: NoaSensitivity): string | null {
  // PII scanning applies at all sensitivity levels
  for (const { pattern, label } of PII_PATTERNS) {
    if (pattern.test(text)) {
      // In permissive mode, only block high-confidence PII (credit cards, API keys)
      if (sensitivity === 'permissive') {
        const highConfidence = ['CREDIT_CARD', 'OPENAI_KEY', 'ANTHROPIC_KEY', 'GOOGLE_KEY', 'AWS_ACCESS_KEY'];
        if (!highConfidence.includes(label)) continue;
      }
      return `PII_LEAKAGE:${label}`;
    }
  }
  return null;
}

// --- 4-E: Public Gate ---

export async function runNoa(input: NoaInput): Promise<NoaResult> {
  const MAX_INPUT_LENGTH = 200_000;
  const sensitivity: NoaSensitivity = input.sensitivity ?? 'normal';
  const ts = Date.now();

  // Input validation (preserved from original)
  if (!input.text || input.text.trim().length === 0) {
    return {
      allowed: false,
      tactical: { reason: 'EMPTY_INPUT' },
      auditEntry: { id: `noa-reject-empty-${ts}` },
    };
  }
  if (input.text.length > MAX_INPUT_LENGTH) {
    return {
      allowed: false,
      tactical: { reason: 'INPUT_TOO_LARGE' },
      auditEntry: { id: `noa-reject-size-${ts}` },
    };
  }

  // Gate 1: Prompt injection
  const injectionHit = scanPromptInjection(input.text, sensitivity);
  if (injectionHit) {
    return {
      allowed: false,
      tactical: { reason: injectionHit },
      auditEntry: { id: `noa-block-injection-${ts}` },
    };
  }

  // Gate 2: Code injection
  const codeHit = scanCodeInjection(input.text, sensitivity);
  if (codeHit) {
    return {
      allowed: false,
      tactical: { reason: codeHit },
      auditEntry: { id: `noa-block-code-${ts}` },
    };
  }

  // Gate 3: PII leakage
  const piiHit = scanPiiLeakage(input.text, sensitivity);
  if (piiHit) {
    return {
      allowed: false,
      tactical: { reason: piiHit },
      auditEntry: { id: `noa-block-pii-${ts}` },
    };
  }

  return {
    allowed: true,
    tactical: { reason: 'PASSED_ALL_GATES' },
    auditEntry: { id: `noa-pass-${ts}` },
  };
}

export async function dispatchStream(
  provider: string, apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[],
  temperature: number, maxTokens?: number,
): Promise<{ ok: true; stream: ReadableStream } | { ok: false; error: string }> {
  try {
    switch (provider) {
      case 'gemini':
        return { ok: true, stream: await streamGemini(apiKey, model, system, messages, temperature) };
      case 'openai':
      case 'groq':
      case 'mistral':
        return { ok: true, stream: await streamOpenAICompat(provider, apiKey, model, system, messages, temperature) };
      case 'claude':
        return { ok: true, stream: await streamClaude(apiKey, model, system, messages, temperature, maxTokens) };
      default:
        return { ok: false, error: `Invalid provider [${provider}] for main process.` };
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
