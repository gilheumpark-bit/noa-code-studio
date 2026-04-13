/**
 * apps/desktop/main/ipc/quill.ts
 *
 * Quill verification engine IPC.
 *
 * PART 1 — Types & constants
 * PART 2 — Language detection & file filtering
 * PART 3 — Single-file verify (inline, no worker)
 * PART 4 — Worker pool (real worker_threads)
 * PART 5 — File collection & batching
 * PART 6 — Full project scan (pooled, with progress + cancellation)
 * PART 7 — Auto-watcher integration (file change -> tier A/B verify)
 * PART 8 — Public registrar
 */

import { ipcMain, type WebContents } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';

import {
  runVerify as engineRunVerify,
  ENGINE_VERSION,
  type EngineFinding,
  type VerifyOutcome,
} from '@eh/quill-engine';

// ============================================================
// PART 1 — Types & constants
// ============================================================

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB limit
const POOL_SIZE = Math.max(1, os.cpus().length - 1);
const FLUSH_DEBOUNCE_MS = 300;

interface VerifyFileRequest {
  filePath: string;
  tier?: 'A' | 'B' | 'C';
}

interface VerifyResultIssue {
  ruleId: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  line: number;
  column?: number;
  message: string;
}

interface VerifyResult {
  filePath: string;
  tier: 'A' | 'B' | 'C';
  issues: VerifyResultIssue[];
  durationMs: number;
  engineVersion: string;
  skipped?: boolean;
  skipReason?: string;
  detectedLanguage?: string;
}

interface ScanProgress {
  scanned: number;
  total: number;
  percent: number;
}

interface FullScanResult {
  scanned: number;
  issues: number;
  skipped: number;
  results: VerifyResult[];
  durationMs: number;
  cancelled: boolean;
}

// Worker message types (must match quill-worker.ts)
interface WorkerTask {
  type: 'verify-batch';
  files: string[];
  tier: 'A' | 'B' | 'C';
  batchId: number;
  maxFileSizeBytes: number;
}

interface WorkerFileResult {
  filePath: string;
  tier: 'A' | 'B' | 'C';
  issues: Array<{
    ruleId: string;
    severity: string;
    line: number;
    column?: number;
    message: string;
  }>;
  durationMs: number;
  engineVersion: string;
  skipped?: boolean;
  skipReason?: string;
  detectedLanguage?: string;
}

interface WorkerBatchResult {
  type: 'batch-result';
  batchId: number;
  results: WorkerFileResult[];
}

interface WorkerProgressMsg {
  type: 'progress';
  batchId: number;
  completed: number;
  total: number;
}

// ============================================================
// PART 2 — Language detection & file filtering
// ============================================================

const SCANNABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.rb', '.php', '.cs',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', '__pycache__']);

const SHEBANG_LANG_MAP: Array<[RegExp, string]> = [
  [/\bnode\b/, 'javascript'],
  [/\bts-node\b/, 'typescript'],
  [/\bdeno\b/, 'typescript'],
  [/\bpython[23]?\b/, 'python'],
  [/\bruby\b/, 'ruby'],
  [/\bbash\b/, 'shell'],
  [/\bsh\b/, 'shell'],
];

const CONTENT_PATTERNS: Array<[RegExp, string]> = [
  [/^import\s+.*\s+from\s+['"]|^export\s+(default\s+)?/m, 'javascript'],
  [/^(interface|type)\s+\w+\s*[={<]/m, 'typescript'],
  [/^def\s+\w+\s*\(|^class\s+\w+.*:/m, 'python'],
  [/^package\s+\w+|^func\s+\w+\s*\(/m, 'go'],
  [/^fn\s+\w+|^(pub\s+)?(struct|enum|impl)\s+/m, 'rust'],
];

function detectLanguage(filePath: string, content: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const extMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
    '.rb': 'ruby', '.php': 'php', '.cs': 'csharp',
  };
  if (extMap[ext]) return extMap[ext];

  // Shebang check
  const firstLine = content.slice(0, content.indexOf('\n'));
  if (firstLine.startsWith('#!')) {
    for (const [pattern, lang] of SHEBANG_LANG_MAP) {
      if (pattern.test(firstLine)) return lang;
    }
  }

  // Content patterns (first 2KB)
  const head = content.slice(0, 2048);
  for (const [pattern, lang] of CONTENT_PATTERNS) {
    if (pattern.test(head)) return lang;
  }

  return 'unknown';
}

function isQuillCandidate(filePath: string): boolean {
  return SCANNABLE_EXTS.has(path.extname(filePath).toLowerCase());
}

// ============================================================
// PART 3 — Single-file verify (inline, no worker)
// ============================================================

function findingToIssue(f: EngineFinding): VerifyResultIssue {
  return {
    ruleId: f.ruleId,
    severity: f.severity as VerifyResultIssue['severity'],
    line: f.line,
    column: (f as unknown as { col?: number }).col,
    message: f.message,
  };
}

async function verifyFile(req: VerifyFileRequest): Promise<VerifyResult> {
  const t0 = Date.now();
  const tier = req.tier ?? 'A';

  // Check file size first
  try {
    const stat = await fs.stat(req.filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return {
        filePath: req.filePath,
        tier,
        issues: [],
        durationMs: Date.now() - t0,
        engineVersion: ENGINE_VERSION,
        skipped: true,
        skipReason: `File too large (${Math.round(stat.size / 1024)}KB > ${Math.round(MAX_FILE_SIZE_BYTES / 1024)}KB limit)`,
      };
    }
  } catch {
    // Stat failed — continue to read and let it fail there
  }

  // Load file content
  let content: string;
  try {
    content = await fs.readFile(req.filePath, 'utf-8');
  } catch (err) {
    return {
      filePath: req.filePath,
      tier,
      issues: [{
        ruleId: 'fs-read-error',
        severity: 'P1',
        line: 0,
        message: `Cannot read file: ${(err as Error).message}`,
      }],
      durationMs: Date.now() - t0,
      engineVersion: ENGINE_VERSION,
    };
  }

  const detectedLanguage = detectLanguage(req.filePath, content);

  // Route by tier
  let outcome: VerifyOutcome;
  try {
    outcome = engineRunVerify(content, {
      fileName: path.basename(req.filePath),
      tier,
    });
  } catch (err) {
    return {
      filePath: req.filePath,
      tier,
      issues: [{
        ruleId: 'engine-error',
        severity: 'P1',
        line: 0,
        message: `Quill engine threw: ${(err as Error).message}`,
      }],
      durationMs: Date.now() - t0,
      engineVersion: ENGINE_VERSION,
      detectedLanguage,
    };
  }

  return {
    filePath: req.filePath,
    tier,
    issues: outcome.findings.map(findingToIssue),
    durationMs: Date.now() - t0,
    engineVersion: ENGINE_VERSION,
    detectedLanguage,
  };
}

// ============================================================
// PART 4 — Worker pool (real worker_threads)
// ============================================================

interface PoolWorker {
  worker: Worker;
  busy: boolean;
  taskCount: number;
}

class QuillWorkerPool {
  private workers: PoolWorker[] = [];
  private workerScript: string;
  private poolSize: number;
  private initialized = false;

  constructor(poolSize: number) {
    this.poolSize = poolSize;
    // Resolve worker script path relative to this file
    this.workerScript = path.join(__dirname, '..', 'workers', 'quill-worker.js');
  }

  private ensurePool(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Verify worker script exists; fall back to .ts for ts-node/tsx
    if (!fsSync.existsSync(this.workerScript)) {
      const tsPath = this.workerScript.replace(/\.js$/, '.ts');
      if (fsSync.existsSync(tsPath)) {
        this.workerScript = tsPath;
      } else {
        console.warn('[quill-pool] Worker script not found, falling back to inline verification');
        return;
      }
    }

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(this.workerScript);
        this.workers.push({ worker, busy: false, taskCount: 0 });

        worker.on('error', (err) => {
          console.error(`[quill-pool] Worker ${i} error:`, err.message);
        });
      } catch (err) {
        console.warn(`[quill-pool] Failed to create worker ${i}:`, (err as Error).message);
      }
    }

    if (this.workers.length === 0) {
      console.warn('[quill-pool] No workers created, full-scan will use inline fallback');
    }
  }

  get available(): boolean {
    this.ensurePool();
    return this.workers.length > 0;
  }

  get size(): number {
    return this.workers.length;
  }

  /**
   * Distribute files across workers and run in parallel.
   * Returns aggregated results with progress callback support.
   */
  async runBatched(
    files: string[],
    tier: 'A' | 'B' | 'C',
    onProgress?: (progress: ScanProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<{ results: WorkerFileResult[]; cancelled: boolean }> {
    this.ensurePool();

    if (this.workers.length === 0 || files.length === 0) {
      return { results: [], cancelled: false };
    }

    // Distribute files evenly across workers
    const workerCount = Math.min(this.workers.length, files.length);
    const batches: string[][] = Array.from({ length: workerCount }, () => []);
    for (let i = 0; i < files.length; i++) {
      batches[i % workerCount].push(files[i]);
    }

    const allResults: WorkerFileResult[] = [];
    let totalCompleted = 0;
    let cancelled = false;

    const batchPromises = batches.map((batch, idx) => {
      if (batch.length === 0) return Promise.resolve();

      const pw = this.workers[idx];
      pw.busy = true;
      pw.taskCount++;

      return new Promise<void>((resolve) => {
        const task: WorkerTask = {
          type: 'verify-batch',
          files: batch,
          tier,
          batchId: idx,
          maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        };

        const onMessage = (msg: WorkerBatchResult | WorkerProgressMsg) => {
          if (abortSignal?.aborted) {
            cancelled = true;
            pw.busy = false;
            pw.worker.removeListener('message', onMessage);
            resolve();
            return;
          }

          if (msg.type === 'progress') {
            totalCompleted++;
            if (onProgress) {
              onProgress({
                scanned: totalCompleted,
                total: files.length,
                percent: Math.round((totalCompleted / files.length) * 100),
              });
            }
          } else if (msg.type === 'batch-result') {
            allResults.push(...msg.results);
            pw.busy = false;
            pw.worker.removeListener('message', onMessage);
            resolve();
          }
        };

        pw.worker.on('message', onMessage);
        pw.worker.postMessage(task);
      });
    });

    await Promise.all(batchPromises);

    return { results: allResults, cancelled };
  }

  destroy(): void {
    for (const pw of this.workers) {
      pw.worker.terminate().catch(() => {});
    }
    this.workers = [];
    this.initialized = false;
  }
}

let workerPool: QuillWorkerPool | null = null;

function getPool(): QuillWorkerPool {
  if (!workerPool) {
    workerPool = new QuillWorkerPool(POOL_SIZE);
  }
  return workerPool;
}

// ============================================================
// PART 5 — File collection & batching
// ============================================================

async function collectFiles(dir: string, results: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(full, results);
    } else if (SCANNABLE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

// ============================================================
// PART 6 — Full project scan (pooled, with progress + cancellation)
// ============================================================

// Active scan abort controllers by sessionId
const activeScanAborts = new Map<string, AbortController>();

async function runFullProjectScan(
  rootPath: string,
  tier: 'A' | 'B' | 'C',
  scanId: string,
  webContents?: WebContents
): Promise<FullScanResult> {
  const t0 = Date.now();
  const files = await collectFiles(rootPath);

  if (files.length === 0) {
    return { scanned: 0, issues: 0, skipped: 0, results: [], durationMs: Date.now() - t0, cancelled: false };
  }

  // Set up abort controller
  const abortController = new AbortController();
  activeScanAborts.set(scanId, abortController);

  const onProgress = (progress: ScanProgress): void => {
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('quill:scan-progress', progress);
    }
  };

  const pool = getPool();
  let allResults: VerifyResult[];
  let cancelled = false;

  if (pool.available) {
    // Parallel worker pool scan
    const { results: workerResults, cancelled: wasCancelled } = await pool.runBatched(
      files,
      tier,
      onProgress,
      abortController.signal
    );
    cancelled = wasCancelled;

    allResults = workerResults.map((wr) => ({
      filePath: wr.filePath,
      tier: wr.tier,
      issues: wr.issues.map((i) => ({
        ruleId: i.ruleId,
        severity: i.severity as VerifyResultIssue['severity'],
        line: i.line,
        column: i.column,
        message: i.message,
      })),
      durationMs: wr.durationMs,
      engineVersion: wr.engineVersion,
      skipped: wr.skipped,
      skipReason: wr.skipReason,
      detectedLanguage: wr.detectedLanguage,
    }));
  } else {
    // Inline fallback (no workers)
    allResults = [];
    for (let i = 0; i < files.length; i++) {
      if (abortController.signal.aborted) {
        cancelled = true;
        break;
      }

      try {
        const result = await verifyFile({ filePath: files[i], tier });
        allResults.push(result);
      } catch {
        // Skip files that fail to verify
      }

      onProgress({
        scanned: i + 1,
        total: files.length,
        percent: Math.round(((i + 1) / files.length) * 100),
      });
    }
  }

  activeScanAborts.delete(scanId);

  const totalIssues = allResults.reduce((sum, r) => sum + r.issues.length, 0);
  const totalSkipped = allResults.filter((r) => r.skipped).length;

  return {
    scanned: allResults.length,
    issues: totalIssues,
    skipped: totalSkipped,
    results: allResults,
    durationMs: Date.now() - t0,
    cancelled,
  };
}

// ============================================================
// PART 7 — Auto-watcher integration (file change -> tier A/B verify)
// ============================================================

interface AutoVerifyState {
  rootPath: string;
  webContents: WebContents;
  pending: Set<string>;
  flushTimer: NodeJS.Timeout | null;
  enabled: boolean;
  tier: 'A' | 'B';
}

const autoStates = new Map<string, AutoVerifyState>();

function scheduleFlush(state: AutoVerifyState): void {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    void flushAutoVerify(state);
  }, FLUSH_DEBOUNCE_MS);
}

async function flushAutoVerify(state: AutoVerifyState): Promise<void> {
  state.flushTimer = null;
  if (!state.enabled || state.pending.size === 0) return;

  const files = Array.from(state.pending);
  state.pending.clear();

  for (const filePath of files) {
    if (state.webContents.isDestroyed()) return;

    try {
      const result = await verifyFile({ filePath, tier: state.tier });
      state.webContents.send('quill:auto-report', result);
    } catch (err) {
      state.webContents.send('quill:auto-error', {
        filePath,
        error: (err as Error).message,
      });
    }
  }
}

/** Called by file watcher when a file changes. */
function notifyFileChange(rootPath: string, filePath: string): void {
  for (const state of autoStates.values()) {
    if (state.rootPath !== rootPath) continue;
    if (!state.enabled) continue;
    if (!isQuillCandidate(filePath)) continue;
    state.pending.add(filePath);
    scheduleFlush(state);
  }
}

// ============================================================
// PART 8 — Public registrar
// ============================================================

let registered = false;

export function registerQuillIpc(): void {
  if (registered) return;
  registered = true;

  // -- Single file verify --
  ipcMain.handle('quill:verify', async (_event, req: VerifyFileRequest) =>
    verifyFile(req)
  );

  // -- Engine version --
  ipcMain.handle('quill:engine-version', () => ENGINE_VERSION);

  // -- Pool info --
  ipcMain.handle('quill:pool-info', () => ({
    poolSize: POOL_SIZE,
    cpuCount: os.cpus().length,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    available: getPool().available,
    workerCount: getPool().size,
  }));

  // -- Full project scan (with worker pool, progress, cancellation) --
  ipcMain.handle('quill:full-scan', async (event, opts: {
    rootPath: string;
    tier?: 'A' | 'B' | 'C';
    scanId?: string;
  }) => {
    const tier = opts.tier ?? 'A';
    const scanId = opts.scanId ?? `scan-${Date.now()}`;
    return runFullProjectScan(opts.rootPath, tier, scanId, event.sender);
  });

  // -- Cancel active scan --
  ipcMain.handle('quill:cancel-scan', (_event, scanId: string) => {
    const controller = activeScanAborts.get(scanId);
    if (controller) {
      controller.abort();
      return { ok: true, scanId };
    }
    return { ok: false, error: 'No active scan with that ID' };
  });

  // -- Auto-watcher: start --
  ipcMain.handle('quill:auto-start', (event, opts: {
    rootPath: string;
    sessionId: string;
    tier?: 'A' | 'B';
  }) => {
    const tier = opts.tier ?? 'A';
    const state: AutoVerifyState = {
      rootPath: opts.rootPath,
      webContents: event.sender,
      pending: new Set(),
      flushTimer: null,
      enabled: true,
      tier,
    };
    autoStates.set(opts.sessionId, state);

    event.sender.once('destroyed', () => {
      const s = autoStates.get(opts.sessionId);
      if (s?.flushTimer) clearTimeout(s.flushTimer);
      autoStates.delete(opts.sessionId);
    });

    return { ok: true, sessionId: opts.sessionId, tier };
  });

  // -- Auto-watcher: stop --
  ipcMain.handle('quill:auto-stop', (_event, sessionId: string) => {
    const s = autoStates.get(sessionId);
    if (s?.flushTimer) clearTimeout(s.flushTimer);
    autoStates.delete(sessionId);
    return { ok: true };
  });

  // -- Auto-watcher: pause --
  ipcMain.handle('quill:auto-pause', (_event, sessionId: string) => {
    const s = autoStates.get(sessionId);
    if (s) s.enabled = false;
    return { ok: true };
  });

  // -- Auto-watcher: resume --
  ipcMain.handle('quill:auto-resume', (_event, sessionId: string) => {
    const s = autoStates.get(sessionId);
    if (s) s.enabled = true;
    return { ok: true };
  });
}

// Re-export for file watcher integration
export { notifyFileChange };
