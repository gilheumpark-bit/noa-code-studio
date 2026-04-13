/**
 * apps/desktop/main/services/crash-reporter.ts
 *
 * Persistent error logging for production builds.
 * Writes to userData/crash-reports/ for post-mortem analysis.
 *
 * PART 1 — Types & constants
 * PART 2 — Session tracking & breadcrumbs
 * PART 3 — Error deduplication (stack fingerprint)
 * PART 4 — Structured JSON logging with rotation
 * PART 5 — Memory usage logging
 * PART 6 — Crash dump (fatal app state snapshot)
 * PART 7 — Auto-upload (disabled by default)
 * PART 8 — Main process error capture
 * PART 9 — Renderer error capture via IPC
 * PART 10 — Public API
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app, ipcMain, type WebContents } from 'electron';

// ============================================================
// PART 1 — Types & constants
// ============================================================

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per log file
const MAX_LOG_FILES = 10;
const MAX_BREADCRUMBS = 5;
const DEDUP_WINDOW_MS = 60_000; // 1 minute dedup window
const MAX_DEDUP_ENTRIES = 500;

type Severity = 'fatal' | 'error' | 'warning' | 'info';

interface CrashEntry {
  ts: string;
  severity: Severity;
  sessionId: string;
  source: 'main' | 'renderer';
  component?: string;
  action?: string;
  kind: string;
  message: string;
  stack?: string;
  fingerprint?: string;
  dedupCount?: number;
  metadata?: Record<string, unknown>;
  memory?: MemorySnapshot;
  breadcrumbs?: Breadcrumb[];
}

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

interface Breadcrumb {
  ts: string;
  action: string;
  detail?: string;
}

interface DedupEntry {
  fingerprint: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

interface UploadConfig {
  enabled: boolean;
  endpoint: string | null;
  headers?: Record<string, string>;
  minSeverity: Severity;
}

interface RendererErrorReport {
  severity?: Severity;
  component?: string;
  action?: string;
  kind: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// PART 2 — Session tracking & breadcrumbs
// ============================================================

const sessionId = crypto.randomUUID();
const breadcrumbs: Breadcrumb[] = [];

function addBreadcrumb(action: string, detail?: string): void {
  breadcrumbs.push({
    ts: new Date().toISOString(),
    action,
    detail,
  });

  // Keep only the last N
  while (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

// ============================================================
// PART 3 — Error deduplication (stack fingerprint)
// ============================================================

const dedupMap = new Map<string, DedupEntry>();

function computeFingerprint(kind: string, message: string, stack?: string): string {
  // Use the first 3 stack frames + kind for grouping
  let stackKey = '';
  if (stack) {
    const frames = stack
      .split('\n')
      .filter((line) => line.trim().startsWith('at '))
      .slice(0, 3)
      .map((line) => line.trim())
      .join('|');
    stackKey = frames;
  }

  const raw = `${kind}::${message.slice(0, 100)}::${stackKey}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Returns null if this error should be written (new or dedup window expired).
 * Returns the dedup entry if this error is a duplicate within the window.
 */
function checkDedup(fingerprint: string): DedupEntry | null {
  const now = Date.now();
  const existing = dedupMap.get(fingerprint);

  if (existing && (now - existing.lastSeen) < DEDUP_WINDOW_MS) {
    existing.count++;
    existing.lastSeen = now;
    return existing;
  }

  // New entry or expired
  dedupMap.set(fingerprint, {
    fingerprint,
    count: 1,
    firstSeen: now,
    lastSeen: now,
  });

  // Prune old entries
  if (dedupMap.size > MAX_DEDUP_ENTRIES) {
    const entries = Array.from(dedupMap.entries())
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [key] of entries.slice(0, entries.length - MAX_DEDUP_ENTRIES)) {
      dedupMap.delete(key);
    }
  }

  return null;
}

// ============================================================
// PART 4 — Structured JSON logging with rotation
// ============================================================

function getLogDir(): string {
  const dir = path.join(app.getPath('userData'), 'crash-reports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(getLogDir(), `crash-${date}.log`);
}

function rotateIfNeeded(logPath: string): void {
  try {
    const stat = fs.statSync(logPath);
    if (stat.size > MAX_LOG_SIZE) {
      const rotated = logPath.replace('.log', `-${Date.now()}.log`);
      fs.renameSync(logPath, rotated);
    }
  } catch {
    // File doesn't exist yet
  }

  // Prune old files
  try {
    const dir = getLogDir();
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('crash-') && f.endsWith('.log'))
      .sort()
      .reverse();
    for (const file of files.slice(MAX_LOG_FILES)) {
      fs.unlinkSync(path.join(dir, file));
    }
  } catch {
    // Best effort
  }
}

const SEVERITY_PRIORITY: Record<Severity, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function writeEntry(entry: CrashEntry): void {
  const logPath = getLogFile();
  rotateIfNeeded(logPath);
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');

  // Auto-upload if configured
  maybeUpload(entry);
}

function buildEntry(opts: {
  severity: Severity;
  source: 'main' | 'renderer';
  kind: string;
  message: string;
  stack?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}): CrashEntry | null {
  const fingerprint = computeFingerprint(opts.kind, opts.message, opts.stack);

  // Dedup check — skip if duplicate within window
  const dup = checkDedup(fingerprint);
  if (dup && dup.count > 1) {
    return null; // Suppressed duplicate
  }

  return {
    ts: new Date().toISOString(),
    severity: opts.severity,
    sessionId,
    source: opts.source,
    component: opts.component,
    action: opts.action,
    kind: opts.kind,
    message: opts.message,
    stack: opts.stack,
    fingerprint,
    metadata: opts.metadata,
    memory: getMemorySnapshot(),
    breadcrumbs: getBreadcrumbs(),
  };
}

// ============================================================
// PART 5 — Memory usage logging
// ============================================================

function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
  };
}

// ============================================================
// PART 6 — Crash dump (fatal app state snapshot)
// ============================================================

function writeCrashDump(entry: CrashEntry): string {
  const dumpDir = path.join(getLogDir(), 'dumps');
  fs.mkdirSync(dumpDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpPath = path.join(dumpDir, `fatal-${timestamp}.json`);

  const dump = {
    entry,
    processInfo: {
      pid: process.pid,
      ppid: process.ppid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron ?? 'unknown',
      uptime: process.uptime(),
    },
    memory: getMemorySnapshot(),
    env: {
      NODE_ENV: process.env.NODE_ENV ?? 'unknown',
    },
    breadcrumbs: getBreadcrumbs(),
    timestamp: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2), 'utf-8');
    console.error(`[crash-reporter] Fatal dump written to: ${dumpPath}`);
  } catch (err) {
    console.error(`[crash-reporter] Failed to write dump: ${(err as Error).message}`);
  }

  return dumpPath;
}

// ============================================================
// PART 7 — Auto-upload (disabled by default)
// ============================================================

const uploadConfig: UploadConfig = {
  enabled: false,
  endpoint: null,
  minSeverity: 'error',
};

function maybeUpload(entry: CrashEntry): void {
  if (!uploadConfig.enabled || !uploadConfig.endpoint) return;

  // Check minimum severity
  if (SEVERITY_PRIORITY[entry.severity] > SEVERITY_PRIORITY[uploadConfig.minSeverity]) return;

  // Fire-and-forget upload
  const payload = JSON.stringify(entry);

  fetch(uploadConfig.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...uploadConfig.headers,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => {
    console.error(`[crash-reporter] Upload failed: ${(err as Error).message}`);
  });
}

// ============================================================
// PART 8 — Main process error capture
// ============================================================

function setupMainProcessCapture(): void {
  process.on('uncaughtException', (err) => {
    const entry = buildEntry({
      severity: 'fatal',
      source: 'main',
      kind: 'uncaughtException',
      message: err.message,
      stack: err.stack,
    });
    if (entry) {
      writeEntry(entry);
      writeCrashDump(entry);
    }
    console.error('[crash-reporter] uncaughtException:', err.message);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    const entry = buildEntry({
      severity: 'error',
      source: 'main',
      kind: 'unhandledRejection',
      message,
      stack,
    });
    if (entry) writeEntry(entry);
    console.error('[crash-reporter] unhandledRejection:', message);
  });
}

// ============================================================
// PART 9 — Renderer error capture via IPC
// ============================================================

function setupRendererCapture(): void {
  // Renderer sends structured error reports
  ipcMain.handle('crash:report', (_event, report: RendererErrorReport) => {
    const entry = buildEntry({
      severity: report.severity ?? 'error',
      source: 'renderer',
      kind: report.kind,
      message: report.message,
      stack: report.stack,
      component: report.component,
      action: report.action,
      metadata: report.metadata,
    });
    if (entry) writeEntry(entry);
    return { ok: true, sessionId };
  });

  // Renderer sends breadcrumb actions
  ipcMain.handle('crash:breadcrumb', (_event, action: string, detail?: string) => {
    addBreadcrumb(action, detail);
    return { ok: true };
  });

  // Get today's logs
  ipcMain.handle('crash:get-logs', (_event, opts?: {
    count?: number;
    minSeverity?: Severity;
  }) => {
    try {
      const logPath = getLogFile();
      if (!fs.existsSync(logPath)) return { logs: [], sessionId };

      const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
      let parsed = lines.map((l) => {
        try { return JSON.parse(l) as CrashEntry; }
        catch { return { raw: l } as unknown as CrashEntry; }
      });

      // Filter by severity if requested
      const minSev = opts?.minSeverity;
      if (minSev) {
        const minPriority = SEVERITY_PRIORITY[minSev];
        parsed = parsed.filter((e) => {
          const sev = (e as CrashEntry).severity;
          return sev != null && SEVERITY_PRIORITY[sev] != null && SEVERITY_PRIORITY[sev] <= minPriority;
        });
      }

      const count = opts?.count ?? 50;
      return { logs: parsed.slice(-count), sessionId };
    } catch {
      return { logs: [], sessionId };
    }
  });

  // Get log directory path
  ipcMain.handle('crash:get-log-path', () => getLogDir());

  // Get current session info
  ipcMain.handle('crash:session-info', () => ({
    sessionId,
    breadcrumbs: getBreadcrumbs(),
    memory: getMemorySnapshot(),
    uptime: process.uptime(),
    dedupEntries: dedupMap.size,
  }));

  // Configure auto-upload
  ipcMain.handle('crash:configure-upload', (_event, config: Partial<UploadConfig>) => {
    if (config.enabled != null) uploadConfig.enabled = config.enabled;
    if (config.endpoint != null) uploadConfig.endpoint = config.endpoint;
    if (config.headers != null) uploadConfig.headers = config.headers;
    if (config.minSeverity != null) uploadConfig.minSeverity = config.minSeverity;
    return { ok: true, config: { ...uploadConfig } };
  });

  // List crash dumps
  ipcMain.handle('crash:list-dumps', () => {
    try {
      const dumpDir = path.join(getLogDir(), 'dumps');
      if (!fs.existsSync(dumpDir)) return { dumps: [] };
      const files = fs.readdirSync(dumpDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 20);
      return { dumps: files.map((f) => path.join(dumpDir, f)) };
    } catch {
      return { dumps: [] };
    }
  });

  // Manual log write (for renderer-side warnings/info)
  ipcMain.handle('crash:log', (_event, opts: {
    severity: Severity;
    component?: string;
    action?: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) => {
    const entry = buildEntry({
      severity: opts.severity,
      source: 'renderer',
      kind: 'manual-log',
      message: opts.message,
      component: opts.component,
      action: opts.action,
      metadata: opts.metadata,
    });
    if (entry) writeEntry(entry);
    return { ok: true, sessionId };
  });
}

// ============================================================
// PART 10 — Public API
// ============================================================

export function initCrashReporter(): void {
  // Log startup
  const startEntry: CrashEntry = {
    ts: new Date().toISOString(),
    severity: 'info',
    sessionId,
    source: 'main',
    kind: 'session-start',
    message: `Session started (pid: ${process.pid})`,
    memory: getMemorySnapshot(),
  };
  writeEntry(startEntry);

  setupMainProcessCapture();
  setupRendererCapture();
}

/**
 * Programmatic error report from main process code.
 * Use when catching errors in main-process services.
 */
export function reportError(opts: {
  severity?: Severity;
  component?: string;
  action?: string;
  kind: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}): void {
  const entry = buildEntry({
    severity: opts.severity ?? 'error',
    source: 'main',
    kind: opts.kind,
    message: opts.message,
    stack: opts.stack,
    component: opts.component,
    action: opts.action,
    metadata: opts.metadata,
  });

  if (entry) {
    writeEntry(entry);
    if (entry.severity === 'fatal') {
      writeCrashDump(entry);
    }
  }
}

/** Get the current session ID for correlation. */
export function getSessionId(): string {
  return sessionId;
}

/** Add a breadcrumb from main-process code. */
export { addBreadcrumb };
