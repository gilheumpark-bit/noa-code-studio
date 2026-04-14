/**
 * Unit tests for src/lib/token-utils.ts
 * Covers: estimateTokens, getContextLimit, getMaxOutputTokens, truncateMessages, HISTORY_LIMITS
 */

import {
  estimateTokens,
  getContextLimit,
  getMaxOutputTokens,
  truncateMessages,
  HISTORY_LIMITS,
} from '@/lib/token-utils';
import type { ChatMsg } from '@/lib/ai-providers';

// ============================================================
// PART 1 — estimateTokens
// ============================================================

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null-ish input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(estimateTokens(undefined as any)).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(estimateTokens(null as any)).toBe(0);
  });

  it('estimates English text at ~0.25 tokens per char', () => {
    const text = 'Hello world'; // 11 chars, 0 CJK => ceil(11/4) = 3
    expect(estimateTokens(text)).toBe(3);
  });

  it('estimates longer English text correctly', () => {
    const text = 'The quick brown fox jumps over the lazy dog'; // 43 chars => ceil(43/4) = 11
    expect(estimateTokens(text)).toBe(11);
  });

  it('estimates CJK text at ~1.5 tokens per char', () => {
    const text = '안녕하세요'; // 5 CJK chars => ceil(5 * 1.5) = 8
    expect(estimateTokens(text)).toBe(8);
  });

  it('estimates mixed English and CJK text', () => {
    const text = 'Hello 세계'; // 6 non-CJK + 2 CJK => ceil(6/4 + 2*1.5) = ceil(1.5+3) = 5
    expect(estimateTokens(text)).toBe(5);
  });

  it('handles Japanese/Chinese CJK characters', () => {
    const text = '日本語テスト'; // 6 CJK chars => ceil(6 * 1.5) = 9
    expect(estimateTokens(text)).toBe(9);
  });
});

// ============================================================
// PART 2 — getContextLimit
// ============================================================

describe('getContextLimit', () => {
  it('returns correct limit for known Gemini model', () => {
    expect(getContextLimit('gemini-2.5-pro')).toBe(1048576);
  });

  it('returns correct limit for known GPT model', () => {
    expect(getContextLimit('gpt-4o')).toBe(128000);
  });

  it('returns correct limit for known Claude model', () => {
    expect(getContextLimit('claude-sonnet-4-20250514')).toBe(200000);
  });

  it('returns correct limit for known Llama model', () => {
    expect(getContextLimit('llama-3.3-70b-versatile')).toBe(131072);
  });

  it('returns correct limit for Qwen model', () => {
    expect(getContextLimit('qwen-qwq-32b')).toBe(32768);
  });

  it('returns default 128000 for unknown models', () => {
    expect(getContextLimit('unknown-model-xyz')).toBe(128000);
  });

  it('returns default for empty string model', () => {
    expect(getContextLimit('')).toBe(128000);
  });
});

// ============================================================
// PART 3 — getMaxOutputTokens
// ============================================================

describe('getMaxOutputTokens', () => {
  it('returns reserved tokens based on 15% ratio', () => {
    // gpt-4o: limit=128000, 15% = 19200, clamped to MAX=16384
    // used=0, available=128000, result = max(4096, min(16384, 128000)) = 16384
    const result = getMaxOutputTokens('gpt-4o', 0, 0);
    expect(result).toBe(16384);
  });

  it('respects minimum output reserve of 4096', () => {
    // Even with very tight budget, should return at least 4096
    const result = getMaxOutputTokens('gpt-4o', 120000, 5000);
    // available = 128000 - 125000 = 3000, reserved=16384
    // max(4096, min(16384, 3000)) = max(4096, 3000) = 4096
    expect(result).toBe(4096);
  });

  it('clamps to available space when budget is tight', () => {
    // qwen: limit=32768, 15% = 4915, clamped to min(max(4915,4096),16384)=4915
    // used=20000, available=12768
    // max(4096, min(4915, 12768)) = 4915
    const result = getMaxOutputTokens('qwen-qwq-32b', 10000, 10000);
    expect(result).toBe(4915);
  });

  it('works with large context models', () => {
    // gemini: limit=1048576, 15%=157286, clamped to MAX=16384
    const result = getMaxOutputTokens('gemini-2.5-pro', 1000, 1000);
    expect(result).toBe(16384);
  });
});

// ============================================================
// PART 4 — truncateMessages
// ============================================================

describe('truncateMessages', () => {
  const makeMsg = (content: string, role: ChatMsg['role'] = 'user'): ChatMsg => ({
    role,
    content,
  });

  it('keeps all messages when within budget', () => {
    const msgs = [makeMsg('hi'), makeMsg('hello', 'assistant')];
    const result = truncateMessages('system prompt', msgs, 'gpt-4o');
    expect(result.truncated).toBe(false);
    expect(result.messages).toHaveLength(2);
    expect(result.systemTokens).toBeGreaterThan(0);
  });

  it('returns empty array info correctly for empty messages', () => {
    const result = truncateMessages('system', [], 'gpt-4o');
    expect(result.messages).toHaveLength(0);
    expect(result.truncated).toBe(false);
    expect(result.messageTokens).toBe(0);
  });

  it('truncates oldest messages when exceeding budget', () => {
    // Use qwen with small context (32768) and large messages to force truncation
    // Each message ~25000 tokens (100000 chars / 4), budget will overflow
    const bigContent = 'x'.repeat(100000);
    const msgs = [
      makeMsg(bigContent),
      makeMsg(bigContent, 'assistant'),
      makeMsg('latest message'),
    ];
    const result = truncateMessages('sys', msgs, 'qwen-qwq-32b');
    expect(result.truncated).toBe(true);
    // Last message should always be preserved
    expect(result.messages[result.messages.length - 1].content).toBe('latest message');
    expect(result.messages.length).toBeLessThan(msgs.length);
  });

  it('preserves at least the last message even with huge system prompt', () => {
    const hugeSystem = '가'.repeat(200000); // ~300000 tokens, exceeds qwen limit
    const msgs = [makeMsg('A'), makeMsg('B'), makeMsg('C')];
    const result = truncateMessages(hugeSystem, msgs, 'qwen-qwq-32b');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('C');
    expect(result.truncated).toBe(true);
  });

  it('reports correct systemTokens', () => {
    const system = 'Hello world'; // 3 tokens
    const result = truncateMessages(system, [makeMsg('test')], 'gpt-4o');
    expect(result.systemTokens).toBe(3);
  });

  it('single message is never truncated', () => {
    const msgs = [makeMsg('only one')];
    const result = truncateMessages('sys', msgs, 'gpt-4o');
    expect(result.truncated).toBe(false);
    expect(result.messages).toHaveLength(1);
  });
});

// ============================================================
// PART 5 — HISTORY_LIMITS constant shape
// ============================================================

describe('HISTORY_LIMITS', () => {
  it('has STORAGE property as a number', () => {
    expect(typeof HISTORY_LIMITS.STORAGE).toBe('number');
    expect(HISTORY_LIMITS.STORAGE).toBe(50);
  });

  it('has CHAT_API property as a number', () => {
    expect(typeof HISTORY_LIMITS.CHAT_API).toBe('number');
    expect(HISTORY_LIMITS.CHAT_API).toBe(15);
  });

  it('has STORY_API property as a number', () => {
    expect(typeof HISTORY_LIMITS.STORY_API).toBe('number');
    expect(HISTORY_LIMITS.STORY_API).toBe(20);
  });

  it('is a frozen (const) object with exactly 3 keys', () => {
    expect(Object.keys(HISTORY_LIMITS)).toHaveLength(3);
    expect(Object.keys(HISTORY_LIMITS).sort()).toEqual(['CHAT_API', 'STORAGE', 'STORY_API']);
  });
});
