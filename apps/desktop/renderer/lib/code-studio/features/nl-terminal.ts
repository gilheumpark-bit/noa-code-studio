// ============================================================
// PART 1 — Types
// ============================================================

export type NLCommandResult =
  | { type: "shell"; terminalId: number | null; command: string }
  | { type: "action"; action: string; params: Record<string, string> }
  | { type: "unknown"; original: string };

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=NLCommandResult

// ============================================================
// PART 2 — Pattern Definitions (KO + EN)
// ============================================================

interface PatternRule {
  /** Regex to match user input */
  pattern: RegExp;
  /** Builder that returns the NLCommandResult from regex match groups */
  build: (match: RegExpMatchArray) => NLCommandResult;
}

/**
 * Terminal ID extraction patterns.
 * Matches "1번 터미널에서", "terminal 2에서", "in terminal 3", etc.
 */
const TERMINAL_ID_PATTERNS: RegExp[] = [
  /(\d+)번\s*터미널/,
  /terminal\s*(\d+)/i,
  /in\s+term(?:inal)?\s*(\d+)/i,
];

function extractTerminalId(input: string): number | null {
  for (const re of TERMINAL_ID_PATTERNS) {
    const m = input.match(re);
    if (m?.[1] != null) {
      const id = parseInt(m[1], 10);
      if (!Number.isNaN(id) && id >= 1) return id - 1; // 0-indexed
    }
  }
  return null;
}

/**
 * Ordered list of NL patterns. First match wins.
 * Each pattern is tested against the cleaned input (terminal ID prefix stripped).
 */
const PATTERNS: PatternRule[] = [
  // ── Direct shell passthrough: user typed an actual command ──
  {
    pattern: /^(npm\s+\S+.*|npx\s+\S+.*|yarn\s+\S+.*|pnpm\s+\S+.*|node\s+\S+.*|git\s+\S+.*|cd\s+\S+.*|mkdir\s+\S+.*|rm\s+\S+.*|ls\b.*|cat\s+\S+.*|echo\s+.*)$/i,
    build: (m) => ({ type: "shell", terminalId: null, command: m[1].trim() }),
  },

  // ── Korean: npm 설치 ──
  {
    pattern: /npm\s*설치(?:해줘|해|하자|좀)?\s+(.+)/i,
    build: (m) => ({ type: "shell", terminalId: null, command: `npm install ${m[1].trim()}` }),
  },
  {
    pattern: /(.+?)\s*설치(?:해줘|해|하자|좀)?$/i,
    build: (m) => ({ type: "shell", terminalId: null, command: `npm install ${m[1].trim()}` }),
  },

  // ── Korean: 서버/빌드/테스트 ──
  {
    pattern: /서버\s*(?:실행|시작|켜|돌려|띄워)/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run dev" }),
  },
  {
    pattern: /서버\s*(?:중지|멈춰|꺼|종료|정지)/i,
    build: () => ({ type: "shell", terminalId: null, command: "Ctrl+C" }),
  },
  {
    pattern: /빌드\s*(?:해|하자|해줘|돌려|실행)?/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run build" }),
  },
  {
    pattern: /테스트\s*(?:해|하자|해줘|돌려|실행)?/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm test" }),
  },
  {
    pattern: /린트\s*(?:해|하자|해줘|돌려|실행)?/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run lint" }),
  },
  {
    pattern: /포맷\s*(?:해|하자|해줘|돌려|실행)?/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run format" }),
  },

  // ── English: run/start/stop ──
  {
    pattern: /^(?:run|start)\s+(?:the\s+)?dev\s*(?:server)?$/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run dev" }),
  },
  {
    pattern: /^(?:stop|kill|quit)\s+(?:the\s+)?(?:dev\s*)?server$/i,
    build: () => ({ type: "shell", terminalId: null, command: "Ctrl+C" }),
  },
  {
    pattern: /^build(?:\s+(?:the\s+)?project)?$/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run build" }),
  },
  {
    pattern: /^(?:run\s+)?tests?$/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm test" }),
  },
  {
    pattern: /^lint$/i,
    build: () => ({ type: "shell", terminalId: null, command: "npm run lint" }),
  },

  // ── English: install ──
  {
    pattern: /^install\s+(.+)/i,
    build: (m) => ({ type: "shell", terminalId: null, command: `npm install ${m[1].trim()}` }),
  },

  // ── English: list files ──
  {
    pattern: /^list\s+files$/i,
    build: () => ({ type: "shell", terminalId: null, command: "ls" }),
  },
  {
    pattern: /^(?:파일\s*(?:목록|리스트)|파일들?\s*보여)/i,
    build: () => ({ type: "shell", terminalId: null, command: "ls" }),
  },

  // ── File actions ──
  {
    pattern: /^create\s+(?:a\s+)?(?:new\s+)?file\s+(?:called\s+)?(.+)/i,
    build: (m) => ({ type: "action", action: "createFile", params: { name: m[1].trim() } }),
  },
  {
    pattern: /^(?:새\s*)?파일\s*(?:만들어|생성)(?:줘)?\s+(.+)/i,
    build: (m) => ({ type: "action", action: "createFile", params: { name: m[1].trim() } }),
  },
  {
    pattern: /^(.+?)\s*파일\s*(?:만들어|생성)(?:줘)?$/i,
    build: (m) => ({ type: "action", action: "createFile", params: { name: m[1].trim() } }),
  },

  // ── Delete file ──
  {
    pattern: /^delete\s+(?:the\s+)?file\s+(.+)/i,
    build: (m) => ({ type: "action", action: "deleteFile", params: { name: m[1].trim() } }),
  },
  {
    pattern: /^(.+?)\s*파일\s*(?:삭제|지워)(?:줘)?$/i,
    build: (m) => ({ type: "action", action: "deleteFile", params: { name: m[1].trim() } }),
  },
];

// IDENTITY_SEAL: PART-2 | role=Patterns | inputs=none | outputs=PATTERNS,extractTerminalId

// ============================================================
// PART 3 — Parser Entry Point
// ============================================================

/**
 * Parse a natural language command input and return a structured result.
 *
 * Supports Korean and English.
 * Extracts terminal ID references like "1번 터미널에서" or "terminal 2".
 */
export function parseNLCommand(input: string): NLCommandResult {
  if (!input || typeof input !== "string") {
    return { type: "unknown", original: input ?? "" };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { type: "unknown", original: "" };
  }

  // Extract terminal ID first
  const terminalId = extractTerminalId(trimmed);

  // Strip terminal ID prefix from input for cleaner pattern matching
  let cleaned = trimmed;
  for (const re of TERMINAL_ID_PATTERNS) {
    cleaned = cleaned.replace(re, "").trim();
  }
  // Remove Korean postpositions left over: 에서, 에, 에다
  cleaned = cleaned.replace(/^에서\s*/, "").replace(/^에\s*/, "").trim();

  // Try each pattern
  for (const rule of PATTERNS) {
    const match = cleaned.match(rule.pattern);
    if (match) {
      const result = rule.build(match);
      // Inject terminal ID if extracted and result is shell type
      if (result.type === "shell" && terminalId !== null) {
        return { ...result, terminalId };
      }
      return result;
    }
  }

  return { type: "unknown", original: trimmed };
}

// IDENTITY_SEAL: PART-3 | role=Parser | inputs=string | outputs=NLCommandResult
