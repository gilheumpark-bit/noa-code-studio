/**
 * apps/desktop/main/ipc/ollama.ts
 *
 * Ollama local model management IPC.
 * Handles model discovery, health checks, pull/delete/copy,
 * custom endpoint, process detection, concurrent pull queue,
 * and RAM compatibility checks.
 *
 * PART 1 — Ollama API helpers + endpoint config
 * PART 2 — Model pull with progress, speed, ETA
 * PART 3 — Concurrent pull queue (max 1 active)
 * PART 4 — Model deletion + copy/rename
 * PART 5 — Process auto-detection
 * PART 6 — RAM compatibility check
 * PART 7 — Tag filtering + search
 * PART 8 — IPC registration
 */

import { ipcMain, type WebContents } from 'electron';
import { execSync } from 'node:child_process';
import { freemem, totalmem, platform } from 'node:os';
import { getKey } from './keystore';

// ============================================================
// PART 1 — Ollama API helpers + endpoint config
// ============================================================

/** Stored custom endpoint. Falls back to localhost:11434 if unset. */
let customEndpoint: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (customEndpoint) return customEndpoint;
  try {
    const stored = await getKey('ollama');
    if (stored) return stored.replace(/\/+$/, '');
  } catch (err) {
    /* intentional: keystore may not be ready at startup */
    console.warn('[ollama]', 'keystore read failed, using default endpoint:', err);
  }
  return 'http://localhost:11434';
}

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama list failed: ${res.status}`);
  const data = (await res.json()) as { models?: OllamaModel[] };
  return data.models ?? [];
}

async function healthCheck(
  baseUrl: string,
): Promise<{ ok: boolean; version?: string; gpuAvailable?: boolean }> {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { version?: string };
    return { ok: true, version: data.version };
  } catch (err) {
    console.warn('[ollama]', 'healthCheck failed:', err);
    return { ok: false };
  }
}

async function modelInfo(
  baseUrl: string,
  modelName: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn('[ollama]', 'modelInfo fetch failed:', err);
    return null;
  }
}

// ============================================================
// PART 2 — Model pull with progress, speed, ETA
// ============================================================

interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
  speedMBps?: number;
  etaSeconds?: number;
}

async function pullModel(
  sender: WebContents,
  baseUrl: string,
  modelName: string,
  requestId: string,
): Promise<void> {
  const controller = new AbortController();
  activePullControllers.set(requestId, controller);

  try {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      sender.send(`ollama:pull-error:${requestId}`, `Pull failed: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastCompletedBytes = 0;
    let lastTimestamp = Date.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const progress = JSON.parse(line) as PullProgress;

          if (progress.total && progress.completed) {
            progress.percent = Math.round((progress.completed / progress.total) * 100);

            // Speed calculation (MB/s)
            const now = Date.now();
            const elapsed = (now - lastTimestamp) / 1000;
            if (elapsed > 0.5) {
              const bytesDelta = progress.completed - lastCompletedBytes;
              progress.speedMBps = Math.round((bytesDelta / elapsed / 1024 / 1024) * 100) / 100;

              // ETA calculation
              const remaining = progress.total - progress.completed;
              if (progress.speedMBps > 0) {
                progress.etaSeconds = Math.round(remaining / (progress.speedMBps * 1024 * 1024));
              }

              lastCompletedBytes = progress.completed;
              lastTimestamp = now;
            }
          }

          if (!sender.isDestroyed()) {
            sender.send(`ollama:pull-progress:${requestId}`, progress);
          }
        } catch (err) {
          /* intentional: malformed JSON line — skip */
          console.warn('[ollama]', 'pull-progress JSON parse skipped:', err);
        }
      }
    }

    if (!sender.isDestroyed()) {
      sender.send(`ollama:pull-done:${requestId}`);
    }
  } catch (err) {
    if (controller.signal.aborted) {
      sender.send(`ollama:pull-error:${requestId}`, 'Pull cancelled');
    } else {
      sender.send(`ollama:pull-error:${requestId}`, (err as Error).message);
    }
  } finally {
    activePullControllers.delete(requestId);
  }
}

// ============================================================
// PART 3 — Concurrent pull queue (max 1 active)
// ============================================================

const activePullControllers = new Map<string, AbortController>();

interface QueuedPull {
  requestId: string;
  sender: WebContents;
  baseUrl: string;
  modelName: string;
}

const pullQueue: QueuedPull[] = [];
let activePullRequestId: string | null = null;

async function enqueuePull(
  sender: WebContents,
  baseUrl: string,
  modelName: string,
): Promise<{ requestId: string; queued: boolean; position: number }> {
  const requestId = `pull-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (activePullRequestId === null) {
    activePullRequestId = requestId;
    void runPull(sender, baseUrl, modelName, requestId);
    return { requestId, queued: false, position: 0 };
  }

  pullQueue.push({ requestId, sender, baseUrl, modelName });
  return { requestId, queued: true, position: pullQueue.length };
}

async function runPull(
  sender: WebContents,
  baseUrl: string,
  modelName: string,
  requestId: string,
): Promise<void> {
  try {
    await pullModel(sender, baseUrl, modelName, requestId);
  } finally {
    activePullRequestId = null;
    drainQueue();
  }
}

function drainQueue(): void {
  const next = pullQueue.shift();
  if (!next) return;
  activePullRequestId = next.requestId;
  void runPull(next.sender, next.baseUrl, next.modelName, next.requestId);
}

// ============================================================
// PART 4 — Model deletion + copy/rename
// ============================================================

async function deleteModel(
  baseUrl: string,
  modelName: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Delete failed (${res.status}): ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function copyModel(
  baseUrl: string,
  source: string,
  destination: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Copy failed (${res.status}): ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ============================================================
// PART 5 — Process auto-detection
// ============================================================

interface ProcessDetectionResult {
  running: boolean;
  pid?: number;
  suggestCommand?: string;
}

function detectOllamaProcess(): ProcessDetectionResult {
  const os = platform();
  try {
    if (os === 'win32') {
      const output = execSync('tasklist /FI "IMAGENAME eq ollama.exe" /FO CSV /NH', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      if (output.includes('ollama.exe')) {
        const parts = output.split(',');
        const pid = parseInt(parts[1]?.replace(/"/g, '') ?? '0', 10);
        return { running: true, pid: pid > 0 ? pid : undefined };
      }
    } else {
      const output = execSync('pgrep -x ollama 2>/dev/null || true', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      const pid = parseInt(output.trim(), 10);
      if (pid > 0) return { running: true, pid };
    }
  } catch (err) {
    /* intentional: command failed — assume not running */
    console.warn('[ollama]', 'process detection command failed:', err);
  }

  const startCmd = os === 'win32'
    ? 'ollama serve'
    : os === 'darwin'
      ? 'ollama serve'
      : 'systemctl start ollama';

  return { running: false, suggestCommand: startCmd };
}

// ============================================================
// PART 6 — RAM compatibility check
// ============================================================

interface CompatibilityResult {
  compatible: boolean;
  availableRamGB: number;
  totalRamGB: number;
  estimatedModelRamGB: number;
  warning?: string;
}

/**
 * Estimate RAM needed for a model based on parameter count and quantization.
 * Rule of thumb: Q4_0 ~0.5GB per billion params, Q8 ~1GB, FP16 ~2GB.
 */
function estimateModelRam(model: OllamaModel): number {
  if (!model.details?.parameter_size) {
    // Fallback: use file size * 1.2 (model files are roughly param data + overhead)
    return (model.size / (1024 * 1024 * 1024)) * 1.2;
  }

  const paramStr = model.details.parameter_size.toLowerCase();
  const billions = parseFloat(paramStr.replace(/[^0-9.]/g, '')) || 0;

  const quant = (model.details.quantization_level ?? '').toLowerCase();
  let bytesPerParam = 0.5; // Q4 default
  if (quant.includes('q8') || quant.includes('8bit')) bytesPerParam = 1.0;
  if (quant.includes('fp16') || quant.includes('f16')) bytesPerParam = 2.0;
  if (quant.includes('q5')) bytesPerParam = 0.625;
  if (quant.includes('q6')) bytesPerParam = 0.75;

  return billions * bytesPerParam;
}

function checkCompatibility(model: OllamaModel): CompatibilityResult {
  const availableRamGB = Math.round((freemem() / (1024 * 1024 * 1024)) * 100) / 100;
  const totalRamGB = Math.round((totalmem() / (1024 * 1024 * 1024)) * 100) / 100;
  const estimatedModelRamGB = Math.round(estimateModelRam(model) * 100) / 100;

  const compatible = availableRamGB >= estimatedModelRamGB;
  let warning: string | undefined;
  if (!compatible) {
    warning = `Model needs ~${estimatedModelRamGB}GB RAM but only ${availableRamGB}GB available (${totalRamGB}GB total).`;
  } else if (availableRamGB < estimatedModelRamGB * 1.5) {
    warning = `Model will use most available RAM (~${estimatedModelRamGB}GB of ${availableRamGB}GB free). Performance may degrade.`;
  }

  return { compatible, availableRamGB, totalRamGB, estimatedModelRamGB, warning };
}

// ============================================================
// PART 7 — Tag filtering + search
// ============================================================

interface ModelSearchResult {
  models: OllamaModel[];
  total: number;
}

function filterModels(
  models: OllamaModel[],
  opts: {
    query?: string;
    family?: string;
    minSizeGB?: number;
    maxSizeGB?: number;
    sortBy?: 'name' | 'size' | 'modified';
    sortDir?: 'asc' | 'desc';
  },
): ModelSearchResult {
  let filtered = [...models];

  // Text search across name, family, quantization
  if (opts.query) {
    const q = opts.query.toLowerCase();
    filtered = filtered.filter((m) => {
      const name = m.name.toLowerCase();
      const family = (m.details?.family ?? '').toLowerCase();
      const quant = (m.details?.quantization_level ?? '').toLowerCase();
      const paramSize = (m.details?.parameter_size ?? '').toLowerCase();
      return name.includes(q) || family.includes(q) || quant.includes(q) || paramSize.includes(q);
    });
  }

  // Family filter
  if (opts.family) {
    const fam = opts.family.toLowerCase();
    filtered = filtered.filter((m) => (m.details?.family ?? '').toLowerCase() === fam);
  }

  // Size range filter (in GB)
  if (opts.minSizeGB !== undefined) {
    const minBytes = opts.minSizeGB * 1024 * 1024 * 1024;
    filtered = filtered.filter((m) => m.size >= minBytes);
  }
  if (opts.maxSizeGB !== undefined) {
    const maxBytes = opts.maxSizeGB * 1024 * 1024 * 1024;
    filtered = filtered.filter((m) => m.size <= maxBytes);
  }

  // Sorting
  const sortBy = opts.sortBy ?? 'name';
  const dir = opts.sortDir === 'desc' ? -1 : 1;
  filtered.sort((a, b) => {
    if (sortBy === 'size') return (a.size - b.size) * dir;
    if (sortBy === 'modified') return (new Date(a.modified_at).getTime() - new Date(b.modified_at).getTime()) * dir;
    return a.name.localeCompare(b.name) * dir;
  });

  return { models: filtered, total: filtered.length };
}

// ============================================================
// PART 8 — IPC registration
// ============================================================

let registered = false;

export function registerOllamaIpc(): void {
  if (registered) return;
  registered = true;

  // --- Health & endpoint ---

  ipcMain.handle('ollama:health-check', async (_event, baseUrl?: string) => {
    return healthCheck(baseUrl ?? (await getBaseUrl()));
  });

  ipcMain.handle('ollama:set-endpoint', (_event, endpoint: string) => {
    const trimmed = endpoint.replace(/\/+$/, '');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return { ok: false, error: 'Endpoint must start with http:// or https://' };
    }
    customEndpoint = trimmed;
    return { ok: true, endpoint: customEndpoint };
  });

  ipcMain.handle('ollama:get-endpoint', async () => {
    return { endpoint: await getBaseUrl() };
  });

  // --- Process detection ---

  ipcMain.handle('ollama:detect-process', () => {
    return detectOllamaProcess();
  });

  // --- Model listing & info ---

  ipcMain.handle('ollama:list-models', async (_event, baseUrl?: string) => {
    try {
      return await listModels(baseUrl ?? (await getBaseUrl()));
    } catch (err) {
      return { error: (err as Error).message, models: [] };
    }
  });

  ipcMain.handle('ollama:model-info', async (_event, modelName: string, baseUrl?: string) => {
    return modelInfo(baseUrl ?? (await getBaseUrl()), modelName);
  });

  // --- Search / filter ---

  ipcMain.handle(
    'ollama:search-models',
    async (
      _event,
      opts: {
        query?: string;
        family?: string;
        minSizeGB?: number;
        maxSizeGB?: number;
        sortBy?: 'name' | 'size' | 'modified';
        sortDir?: 'asc' | 'desc';
        baseUrl?: string;
      },
    ) => {
      try {
        const models = await listModels(opts.baseUrl ?? (await getBaseUrl()));
        return filterModels(models, opts);
      } catch (err) {
        return { error: (err as Error).message, models: [], total: 0 };
      }
    },
  );

  // --- Pull (queued) ---

  ipcMain.handle('ollama:pull-model', async (event, baseUrl: string, modelName: string) => {
    const url = baseUrl || (await getBaseUrl());
    return enqueuePull(event.sender, url, modelName);
  });

  ipcMain.handle('ollama:cancel-pull', (_event, requestId: string) => {
    const controller = activePullControllers.get(requestId);
    if (controller) {
      controller.abort();
      activePullControllers.delete(requestId);
      return { ok: true };
    }
    // Check queue and remove
    const idx = pullQueue.findIndex((q) => q.requestId === requestId);
    if (idx >= 0) {
      pullQueue.splice(idx, 1);
      return { ok: true, removedFromQueue: true };
    }
    return { ok: false, reason: 'not-found' };
  });

  ipcMain.handle('ollama:pull-queue-status', () => {
    return {
      activePull: activePullRequestId,
      queueLength: pullQueue.length,
      queued: pullQueue.map((q) => ({ requestId: q.requestId, model: q.modelName })),
    };
  });

  // --- Delete ---

  ipcMain.handle('ollama:delete-model', async (_event, modelName: string, baseUrl?: string) => {
    return deleteModel(baseUrl ?? (await getBaseUrl()), modelName);
  });

  // --- Copy / Rename ---

  ipcMain.handle(
    'ollama:copy-model',
    async (_event, source: string, destination: string, baseUrl?: string) => {
      return copyModel(baseUrl ?? (await getBaseUrl()), source, destination);
    },
  );

  // --- RAM compatibility ---

  ipcMain.handle('ollama:check-compatibility', async (_event, modelName: string, baseUrl?: string) => {
    try {
      const url = baseUrl ?? (await getBaseUrl());
      const models = await listModels(url);
      const model = models.find((m) => m.name === modelName);
      if (!model) return { error: `Model "${modelName}" not found locally` };
      return checkCompatibility(model);
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  ipcMain.handle('ollama:system-ram', () => {
    return {
      freeGB: Math.round((freemem() / (1024 * 1024 * 1024)) * 100) / 100,
      totalGB: Math.round((totalmem() / (1024 * 1024 * 1024)) * 100) / 100,
    };
  });
}
