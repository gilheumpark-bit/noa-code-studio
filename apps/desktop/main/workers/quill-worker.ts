/**
 * apps/desktop/main/workers/quill-worker.ts
 *
 * Worker thread for Quill verification engine.
 * Receives file batches from the pool, runs verification, posts results back.
 *
 * PART 1 — Message types
 * PART 2 — Language detection (shebang + content patterns)
 * PART 3 — Worker message loop
 */

import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';

import {
  runVerify as engineRunVerify,
  ENGINE_VERSION,
  type EngineFinding,
  type VerifyOutcome,
} from '@eh/quill-engine';

// ============================================================
// PART 1 — Message types
// ============================================================

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

interface WorkerResponse {
  type: 'batch-result';
  batchId: number;
  results: WorkerFileResult[];
}

interface WorkerProgress {
  type: 'progress';
  batchId: number;
  completed: number;
  total: number;
}

// ============================================================
// PART 2 — Language detection (shebang + content patterns)
// ============================================================

const EXTENSION_LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
};

const SHEBANG_LANG_MAP: Array<[RegExp, string]> = [
  [/\bnode\b/, 'javascript'],
  [/\bts-node\b/, 'typescript'],
  [/\bdeno\b/, 'typescript'],
  [/\bpython[23]?\b/, 'python'],
  [/\bruby\b/, 'ruby'],
  [/\bperl\b/, 'perl'],
  [/\bbash\b/, 'shell'],
  [/\bzsh\b/, 'shell'],
  [/\bsh\b/, 'shell'],
  [/\bphp\b/, 'php'],
];

const CONTENT_PATTERNS: Array<[RegExp, string]> = [
  [/^import\s+.*\s+from\s+['"]|^export\s+(default\s+)?/m, 'javascript'],
  [/^(interface|type)\s+\w+\s*[={<]/m, 'typescript'],
  [/^def\s+\w+\s*\(|^class\s+\w+.*:/m, 'python'],
  [/^package\s+\w+|^func\s+\w+\s*\(/m, 'go'],
  [/^fn\s+\w+|^(pub\s+)?(struct|enum|impl)\s+/m, 'rust'],
  [/^(public|private|protected)\s+(static\s+)?(class|void|int|String)/m, 'java'],
];

function detectLanguage(filePath: string, content: string): string {
  // 1. Extension-based
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (EXTENSION_LANG_MAP[ext]) return EXTENSION_LANG_MAP[ext];

  // 2. Shebang-based (first line)
  const firstLine = content.slice(0, content.indexOf('\n'));
  if (firstLine.startsWith('#!')) {
    for (const [pattern, lang] of SHEBANG_LANG_MAP) {
      if (pattern.test(firstLine)) return lang;
    }
  }

  // 3. Content pattern matching (check first 2KB)
  const head = content.slice(0, 2048);
  for (const [pattern, lang] of CONTENT_PATTERNS) {
    if (pattern.test(head)) return lang;
  }

  return 'unknown';
}

// ============================================================
// PART 3 — Worker message loop
// ============================================================

function findingToIssue(f: EngineFinding): WorkerFileResult['issues'][number] {
  return {
    ruleId: f.ruleId,
    severity: f.severity as string,
    line: f.line,
    column: (f as unknown as { col?: number }).col,
    message: f.message,
  };
}

function verifyOneFile(filePath: string, tier: 'A' | 'B' | 'C', maxSize: number): WorkerFileResult {
  const t0 = Date.now();

  // Check file size
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return {
      filePath, tier,
      issues: [{ ruleId: 'fs-stat-error', severity: 'P1', line: 0, message: `Cannot stat: ${(err as Error).message}` }],
      durationMs: Date.now() - t0,
      engineVersion: ENGINE_VERSION,
    };
  }

  if (stat.size > maxSize) {
    return {
      filePath, tier,
      issues: [],
      durationMs: Date.now() - t0,
      engineVersion: ENGINE_VERSION,
      skipped: true,
      skipReason: `File too large (${Math.round(stat.size / 1024)}KB > ${Math.round(maxSize / 1024)}KB limit)`,
    };
  }

  // Read content
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      filePath, tier,
      issues: [{ ruleId: 'fs-read-error', severity: 'P1', line: 0, message: `Cannot read: ${(err as Error).message}` }],
      durationMs: Date.now() - t0,
      engineVersion: ENGINE_VERSION,
    };
  }

  const detectedLanguage = detectLanguage(filePath, content);
  const fileName = filePath.slice(filePath.lastIndexOf('/') + 1).replace(/\\/g, '/').split('/').pop() ?? filePath;

  // Run engine
  let outcome: VerifyOutcome;
  try {
    outcome = engineRunVerify(content, { fileName, tier });
  } catch (err) {
    return {
      filePath, tier,
      issues: [{ ruleId: 'engine-error', severity: 'P1', line: 0, message: `Engine threw: ${(err as Error).message}` }],
      durationMs: Date.now() - t0,
      engineVersion: ENGINE_VERSION,
      detectedLanguage,
    };
  }

  return {
    filePath, tier,
    issues: outcome.findings.map(findingToIssue),
    durationMs: Date.now() - t0,
    engineVersion: ENGINE_VERSION,
    detectedLanguage,
  };
}

if (parentPort) {
  const port = parentPort;

  port.on('message', (task: WorkerTask) => {
    if (task.type !== 'verify-batch') return;

    const results: WorkerFileResult[] = [];
    const total = task.files.length;

    for (let i = 0; i < total; i++) {
      const result = verifyOneFile(task.files[i], task.tier, task.maxFileSizeBytes);
      results.push(result);

      // Report progress every file
      const progress: WorkerProgress = {
        type: 'progress',
        batchId: task.batchId,
        completed: i + 1,
        total,
      };
      port.postMessage(progress);
    }

    const response: WorkerResponse = {
      type: 'batch-result',
      batchId: task.batchId,
      results,
    };
    port.postMessage(response);
  });
}
