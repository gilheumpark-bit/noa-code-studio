/**
 * Token estimation & message truncation for AI chat routing.
 * Consumed by lib/ai-providers.ts — do not import ai-providers here (cycle).
 */

export const HISTORY_LIMITS = Object.freeze({
  STORAGE: 50,
  CHAT_API: 15,
  STORY_API: 20,
});

function isCJKCodePoint(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  );
}

/** Rough token estimate: Latin ~4 chars/token, CJK ~1.5 tokens/char */
export function estimateTokens(text: string | null | undefined): number {
  if (text == null || text === "") return 0;
  let nonCjk = 0;
  let cjk = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isCJKCodePoint(cp)) cjk += 1;
    else nonCjk += 1;
  }
  return Math.ceil(nonCjk / 4 + cjk * 1.5);
}

const CONTEXT_BY_SUBSTRING: [string, number][] = [
  ["gemini-2.5-pro", 1_048_576],
  ["gpt-4o", 128_000],
  ["claude-sonnet-4", 200_000],
  ["llama-3.3-70b-versatile", 131_072],
  ["qwen-qwq-32b", 32_768],
];

export function getContextLimit(model: string): number {
  const m = model || "";
  for (const [key, limit] of CONTEXT_BY_SUBSTRING) {
    if (m.includes(key)) return limit;
  }
  return 128_000;
}

export function getMaxOutputTokens(
  model: string,
  systemTokens: number,
  messageTokens: number,
): number {
  const limit = getContextLimit(model);
  const reservedCap = Math.min(16_384, Math.max(4096, Math.floor(limit * 0.15)));
  const available = Math.max(0, limit - systemTokens - messageTokens);
  return Math.max(4096, Math.min(reservedCap, available));
}

export function truncateMessages<T extends { role: string; content: string }>(
  systemInstruction: string,
  messages: T[],
  model: string,
): {
  messages: T[];
  truncated: boolean;
  systemTokens: number;
  messageTokens: number;
} {
  const limit = getContextLimit(model);

  function countTotal(sys: string, msgs: T[]): { sysTok: number; msgTok: number; total: number } {
    const sysTok = estimateTokens(sys);
    const msgTok = msgs.reduce((s, m) => s + estimateTokens(m.content), 0);
    return { sysTok, msgTok, total: sysTok + msgTok };
  }

  let sys = systemInstruction;
  let msgs = [...messages];
  let { sysTok, msgTok, total } = countTotal(sys, msgs);
  let truncated = false;

  while (total > limit && msgs.length > 1) {
    msgs.shift();
    truncated = true;
    const c = countTotal(sys, msgs);
    sysTok = c.sysTok;
    msgTok = c.msgTok;
    total = c.total;
  }

  while (total > limit && msgs.length === 1) {
    if (sys.length === 0) {
      truncated = true;
      break;
    }
    sys = sys.slice(Math.floor(sys.length / 10) || 1);
    truncated = true;
    const c = countTotal(sys, msgs);
    sysTok = c.sysTok;
    msgTok = c.msgTok;
    total = c.total;
  }

  if (msgs.length === 1 && total > limit) {
    let content = msgs[0].content;
    while (estimateTokens(sys) + estimateTokens(content) > limit && content.length > 1) {
      content = content.slice(0, Math.floor(content.length * 0.9));
      truncated = true;
    }
    msgs = [{ ...msgs[0], content } as T];
    const c = countTotal(sys, msgs);
    sysTok = c.sysTok;
    msgTok = c.msgTok;
  }

  return {
    messages: msgs,
    truncated,
    systemTokens: sysTok,
    messageTokens: msgTok,
  };
}
