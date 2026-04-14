// ============================================================
// PART 1 — Types
// ============================================================

export interface ConsoleEntry {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: number;
  source?: string;
}

export interface Breakpoint {
  id: string;
  file: string;
  line: number;
  enabled: boolean;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ConsoleEntry,Breakpoint

// ============================================================
// PART 2 — Console Output Collector
// ============================================================

let consoleLogs: ConsoleEntry[] = [];
let isCapturing = false;
let messageHandler: ((event: MessageEvent) => void) | null = null;

const MAX_LOG_ENTRIES = 500;

/**
 * Start capturing console output from sandbox/preview iframes.
 * Listens for postMessage events with type "console" from iframe contexts.
 */
export function startConsoleCapture(): void {
  if (isCapturing) return;
  isCapturing = true;

  messageHandler = (event: MessageEvent) => {
    if (event.data == null || typeof event.data !== "object") return;

    const { type, level, message, source } = event.data;
    if (type !== "console") return;

    const validLevel = (["log", "warn", "error"] as const).includes(level) ? level : "log";

    const entry: ConsoleEntry = {
      level: validLevel as ConsoleEntry["level"],
      message: typeof message === "string" ? message : String(message ?? ""),
      timestamp: Date.now(),
      source: typeof source === "string" ? source : undefined,
    };

    consoleLogs.push(entry);

    // Cap size to prevent memory leak
    if (consoleLogs.length > MAX_LOG_ENTRIES) {
      consoleLogs = consoleLogs.slice(-MAX_LOG_ENTRIES);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("message", messageHandler);
  }
}

/**
 * Stop capturing console output.
 */
export function stopConsoleCapture(): void {
  if (!isCapturing) return;
  isCapturing = false;

  if (messageHandler != null && typeof window !== "undefined") {
    window.removeEventListener("message", messageHandler);
    messageHandler = null;
  }
}

/**
 * Get all captured console logs (snapshot copy).
 */
export function getConsoleLogs(): ConsoleEntry[] {
  return [...consoleLogs];
}

/**
 * Clear all captured console logs.
 */
export function clearConsoleLogs(): void {
  consoleLogs = [];
}

// IDENTITY_SEAL: PART-2 | role=ConsoleCollector | inputs=postMessage | outputs=ConsoleEntry[]

// ============================================================
// PART 3 — Breakpoint Manager
// ============================================================

let breakpoints: Breakpoint[] = [];
let nextBpId = 1;

/**
 * Add a breakpoint at a specific file and line.
 * No-op if a breakpoint already exists at that location.
 */
export function addBreakpoint(file: string, line: number): Breakpoint {
  if (!file || line < 1) {
    throw new Error("Invalid breakpoint: file and positive line number required");
  }

  const existing = breakpoints.find((bp) => bp.file === file && bp.line === line);
  if (existing) return existing;

  const bp: Breakpoint = {
    id: `bp-${nextBpId++}`,
    file,
    line,
    enabled: true,
  };
  breakpoints.push(bp);
  return bp;
}

/**
 * Remove a breakpoint at a specific file and line.
 */
export function removeBreakpoint(file: string, line: number): void {
  breakpoints = breakpoints.filter((bp) => !(bp.file === file && bp.line === line));
}

/**
 * Get all breakpoints, optionally filtered by file.
 */
export function getBreakpoints(file?: string): Breakpoint[] {
  if (file != null) {
    return breakpoints.filter((bp) => bp.file === file);
  }
  return [...breakpoints];
}

/**
 * Toggle the enabled state of a breakpoint by its ID.
 */
export function toggleBreakpoint(id: string): void {
  const bp = breakpoints.find((b) => b.id === id);
  if (bp != null) {
    bp.enabled = !bp.enabled;
  }
}

/**
 * Clear all breakpoints.
 */
export function clearBreakpoints(): void {
  breakpoints = [];
}

// IDENTITY_SEAL: PART-3 | role=BreakpointManager | inputs=file,line | outputs=Breakpoint[]

// ============================================================
// PART 4 — Monaco Decoration Integration
// ============================================================

/**
 * Generate Monaco editor decorations for breakpoints in a given file.
 * Returns an array of IModelDeltaDecoration-compatible objects.
 *
 * The caller should apply these via editor.deltaDecorations().
 * Uses a red dot glyph margin decoration for enabled breakpoints,
 * and a grey dot for disabled ones.
 */
export function getBreakpointDecorations(file: string): Array<{
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  options: {
    isWholeLine: boolean;
    glyphMarginClassName: string;
    glyphMarginHoverMessage?: { value: string };
  };
}> {
  const fileBps = getBreakpoints(file);

  return fileBps.map((bp) => ({
    range: {
      startLineNumber: bp.line,
      startColumn: 1,
      endLineNumber: bp.line,
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      glyphMarginClassName: bp.enabled
        ? "eh-breakpoint-enabled"
        : "eh-breakpoint-disabled",
      glyphMarginHoverMessage: {
        value: bp.enabled
          ? `Breakpoint at line ${bp.line}`
          : `Breakpoint at line ${bp.line} (disabled)`,
      },
    },
  }));
}

// IDENTITY_SEAL: PART-4 | role=MonacoDecorations | inputs=file | outputs=IModelDeltaDecoration[]
