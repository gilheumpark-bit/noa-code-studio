/**
 * snapshot-manager.ts — File content snapshot system with IndexedDB persistence,
 * line-level diff computation, named snapshots, LRU eviction, and export/import.
 */

import { logger } from '@/lib/logger';

// ============================================================
// PART 1 — Types & Constants
// ============================================================

/** Metadata attached to every snapshot */
export interface SnapshotMeta {
  description: string;
  author: string;
  tags: string[];
}

/** A single file's content at snapshot time */
export interface SnapshotFileEntry {
  fileId: string;
  content: string;
  /** byte-length at capture time (for quick size display) */
  size: number;
}

/** Full snapshot record */
export interface Snapshot {
  id: string;
  /** Optional user-chosen name (null = auto-generated) */
  name: string | null;
  timestamp: number;
  instruction: string;
  meta: SnapshotMeta;
  files: Map<string, string>;
  /** Tracks last-access for LRU eviction */
  lastAccessedAt: number;
}

/** Serializable form for IndexedDB / JSON export */
export interface SerializedSnapshot {
  id: string;
  name: string | null;
  timestamp: number;
  instruction: string;
  meta: SnapshotMeta;
  files: Array<{ fileId: string; content: string }>;
  lastAccessedAt: number;
}

/** Line-level diff entry */
export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number;
  content: string;
}

/** Aggregated comparison stats between two snapshots */
export interface SnapshotComparison {
  additions: number;
  deletions: number;
  modifications: number;
  unchangedFiles: number;
  /** Per-file diff keyed by fileId */
  fileDiffs: Map<string, DiffLine[]>;
}

/** Export envelope wrapping multiple snapshots */
export interface SnapshotExport {
  version: 1;
  exportedAt: number;
  snapshots: SerializedSnapshot[];
}

const MAX_SNAPSHOTS = 50;
const DB_NAME = 'eh-code-studio';
const DB_VERSION = 3;
const STORE_SNAPSHOTS = 'snapshots';

// ============================================================
// PART 2 — IndexedDB Persistence Layer
// ============================================================

function openSnapshotDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('No IndexedDB in SSR'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
      }
      // Preserve existing stores from store.ts (DB_VERSION bump is safe —
      // onupgradeneeded only creates missing stores)
      const requiredStores = ['files', 'settings', 'chat', 'versions', 'projects', 'recent'];
      for (const name of requiredStores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<SerializedSnapshot[]> {
  const db = await openSnapshotDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
    const req = tx.objectStore(STORE_SNAPSHOTS).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as SerializedSnapshot[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutSnapshot(snap: SerializedSnapshot): Promise<void> {
  const db = await openSnapshotDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
    tx.objectStore(STORE_SNAPSHOTS).put(snap);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteSnapshot(id: string): Promise<void> {
  const db = await openSnapshotDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
    tx.objectStore(STORE_SNAPSHOTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClearSnapshots(): Promise<void> {
  const db = await openSnapshotDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
    tx.objectStore(STORE_SNAPSHOTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// PART 3 — Serialization Helpers
// ============================================================

function serialize(snap: Snapshot): SerializedSnapshot {
  const files: Array<{ fileId: string; content: string }> = [];
  for (const [fileId, content] of snap.files) {
    files.push({ fileId, content });
  }
  return {
    id: snap.id,
    name: snap.name,
    timestamp: snap.timestamp,
    instruction: snap.instruction,
    meta: { ...snap.meta },
    files,
    lastAccessedAt: snap.lastAccessedAt,
  };
}

function deserialize(raw: SerializedSnapshot): Snapshot {
  const files = new Map<string, string>();
  for (const entry of raw.files) {
    files.set(entry.fileId, entry.content);
  }
  return {
    id: raw.id,
    name: raw.name,
    timestamp: raw.timestamp,
    instruction: raw.instruction,
    meta: raw.meta ?? { description: '', author: '', tags: [] },
    files,
    lastAccessedAt: raw.lastAccessedAt ?? raw.timestamp,
  };
}

// ============================================================
// PART 4 — Diff Engine (line-by-line LCS)
// ============================================================

/**
 * Compute line-level diff between two strings using a simplified
 * longest-common-subsequence approach. Returns DiffLine array.
 */
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS length table (O(m*n) but bounded by file size)
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', lineNumber: j, content: newLines[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', lineNumber: j, content: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: 'removed', lineNumber: i, content: oldLines[i - 1] });
      i--;
    }
  }

  // Reverse since we built from bottom-right
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }
  return result;
}

// ============================================================
// PART 5 — Snapshot Manager Implementation
// ============================================================

class SnapshotManagerImpl {
  private snapshots: Snapshot[] = [];
  private initialized = false;

  // ── Init / Load ──────────────────────────────────────────

  /** Load snapshots from IndexedDB into memory. Safe to call multiple times. */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const raw = await dbGetAll();
      this.snapshots = raw.map(deserialize).sort((a, b) => a.timestamp - b.timestamp);
      this.initialized = true;
      logger.info('snapshot-manager', 'init', `Loaded ${this.snapshots.length} snapshots`);
    } catch (err) {
      logger.error('snapshot-manager', 'init', err);
      this.snapshots = [];
      this.initialized = true;
    }
  }

  // ── Create ───────────────────────────────────────────────

  async create(
    fileIds: string[],
    getContent: (id: string) => string | null,
    instruction: string,
    options?: {
      name?: string;
      description?: string;
      author?: string;
      tags?: string[];
    },
  ): Promise<Snapshot> {
    await this.init();

    const files = new Map<string, string>();
    for (const id of fileIds) {
      const content = getContent(id);
      if (content !== null) files.set(id, content);
    }

    const now = Date.now();
    const snapshot: Snapshot = {
      id: `snap-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: options?.name ?? null,
      timestamp: now,
      instruction,
      meta: {
        description: options?.description ?? instruction,
        author: options?.author ?? 'system',
        tags: options?.tags ?? [],
      },
      files,
      lastAccessedAt: now,
    };

    this.snapshots.push(snapshot);

    // LRU eviction: remove least-recently-accessed when over limit
    while (this.snapshots.length > MAX_SNAPSHOTS) {
      const lruIndex = this.findLRUIndex();
      const evicted = this.snapshots.splice(lruIndex, 1)[0];
      try {
        await dbDeleteSnapshot(evicted.id);
      } catch (err) {
        logger.error('snapshot-manager', 'evict', err);
      }
    }

    // Persist
    try {
      await dbPutSnapshot(serialize(snapshot));
    } catch (err) {
      logger.error('snapshot-manager', 'persist-create', err);
    }

    return snapshot;
  }

  // ── Rollback ─────────────────────────────────────────────

  /** Atomically restore all files from the given snapshot ID. */
  async rollbackTo(
    snapshotId: string,
    writeContent: (fileId: string, content: string) => void,
  ): Promise<{ restoredCount: number; snapshot: Snapshot } | null> {
    await this.init();
    const snap = this.snapshots.find((s) => s.id === snapshotId);
    if (snap == null) return null;

    // Collect all writes first, then apply atomically
    const writes: Array<{ fileId: string; content: string }> = [];
    for (const [fileId, content] of snap.files) {
      writes.push({ fileId, content });
    }

    let count = 0;
    for (const w of writes) {
      writeContent(w.fileId, w.content);
      count++;
    }

    // Touch access time
    snap.lastAccessedAt = Date.now();
    try {
      await dbPutSnapshot(serialize(snap));
    } catch (err) {
      logger.error('snapshot-manager', 'rollback-persist', err);
    }

    return { restoredCount: count, snapshot: snap };
  }

  /** Legacy compat: rollback using Snapshot object directly */
  rollback(
    snapshot: Snapshot,
    writeContent: (fileId: string, content: string) => void,
  ): { restoredCount: number } {
    let count = 0;
    for (const [fileId, content] of snapshot.files) {
      writeContent(fileId, content);
      count++;
    }
    return { restoredCount: count };
  }

  // ── Query ────────────────────────────────────────────────

  getLatest(): Snapshot | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;
  }

  getById(id: string): Snapshot | null {
    const snap = this.snapshots.find((s) => s.id === id) ?? null;
    if (snap != null) {
      snap.lastAccessedAt = Date.now();
    }
    return snap;
  }

  getByName(name: string): Snapshot | null {
    return this.snapshots.find((s) => s.name === name) ?? null;
  }

  list(): Array<{
    id: string;
    name: string | null;
    timestamp: number;
    instruction: string;
    description: string;
    author: string;
    fileCount: number;
    tags: string[];
  }> {
    return this.snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      timestamp: s.timestamp,
      instruction: s.instruction,
      description: s.meta.description,
      author: s.meta.author,
      fileCount: s.files.size,
      tags: s.meta.tags,
    }));
  }

  /** Rename a snapshot */
  async rename(id: string, newName: string): Promise<boolean> {
    const snap = this.snapshots.find((s) => s.id === id);
    if (snap == null) return false;
    snap.name = newName;
    try {
      await dbPutSnapshot(serialize(snap));
    } catch (err) {
      logger.error('snapshot-manager', 'rename', err);
    }
    return true;
  }

  // ── Diff / Comparison ────────────────────────────────────

  /** Compute line-level diff between two snapshots */
  compare(snapshotIdA: string, snapshotIdB: string): SnapshotComparison | null {
    const a = this.getById(snapshotIdA);
    const b = this.getById(snapshotIdB);
    if (a == null || b == null) return null;

    const fileDiffs = new Map<string, DiffLine[]>();
    let additions = 0;
    let deletions = 0;
    let modifications = 0;
    let unchangedFiles = 0;

    // All file IDs across both snapshots
    const allFileIds = new Set<string>([...a.files.keys(), ...b.files.keys()]);

    for (const fileId of allFileIds) {
      const contentA = a.files.get(fileId) ?? '';
      const contentB = b.files.get(fileId) ?? '';

      if (contentA === contentB) {
        unchangedFiles++;
        continue;
      }

      const diff = computeLineDiff(contentA, contentB);
      fileDiffs.set(fileId, diff);

      const fileAdded = diff.filter((d) => d.type === 'added').length;
      const fileRemoved = diff.filter((d) => d.type === 'removed').length;

      additions += fileAdded;
      deletions += fileRemoved;

      // A file is "modified" if it exists in both but has changes
      if (a.files.has(fileId) && b.files.has(fileId)) {
        modifications++;
      }
    }

    return { additions, deletions, modifications, unchangedFiles, fileDiffs };
  }

  /** Diff a single file between its current content and a snapshot */
  diffFile(snapshotId: string, fileId: string, currentContent: string): DiffLine[] | null {
    const snap = this.getById(snapshotId);
    if (snap == null) return null;
    const snappedContent = snap.files.get(fileId) ?? '';
    return computeLineDiff(snappedContent, currentContent);
  }

  // ── Eviction / Cleanup ───────────────────────────────────

  prune(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.snapshots.length;
    const toRemove = this.snapshots.filter((s) => s.timestamp <= cutoff);
    this.snapshots = this.snapshots.filter((s) => s.timestamp > cutoff);

    // Background cleanup of IndexedDB
    for (const snap of toRemove) {
      dbDeleteSnapshot(snap.id).catch((err) =>
        logger.error('snapshot-manager', 'prune-persist', err),
      );
    }

    return before - this.snapshots.length;
  }

  async clear(): Promise<void> {
    this.snapshots = [];
    try {
      await dbClearSnapshots();
    } catch (err) {
      logger.error('snapshot-manager', 'clear', err);
    }
  }

  // ── Export / Import ──────────────────────────────────────

  exportAll(): SnapshotExport {
    return {
      version: 1,
      exportedAt: Date.now(),
      snapshots: this.snapshots.map(serialize),
    };
  }

  exportOne(id: string): SnapshotExport | null {
    const snap = this.getById(id);
    if (snap == null) return null;
    return {
      version: 1,
      exportedAt: Date.now(),
      snapshots: [serialize(snap)],
    };
  }

  async importSnapshots(data: SnapshotExport): Promise<{ imported: number; skipped: number }> {
    await this.init();

    if (data.version !== 1) {
      logger.error('snapshot-manager', 'import', `Unsupported version: ${data.version}`);
      return { imported: 0, skipped: 0 };
    }

    let imported = 0;
    let skipped = 0;
    const existingIds = new Set(this.snapshots.map((s) => s.id));

    for (const raw of data.snapshots) {
      if (existingIds.has(raw.id)) {
        skipped++;
        continue;
      }

      const snap = deserialize(raw);
      this.snapshots.push(snap);
      imported++;

      try {
        await dbPutSnapshot(raw);
      } catch (err) {
        logger.error('snapshot-manager', 'import-persist', err);
      }
    }

    // Sort by timestamp after import
    this.snapshots.sort((a, b) => a.timestamp - b.timestamp);

    // Evict if over limit
    while (this.snapshots.length > MAX_SNAPSHOTS) {
      const lruIndex = this.findLRUIndex();
      const evicted = this.snapshots.splice(lruIndex, 1)[0];
      dbDeleteSnapshot(evicted.id).catch((err) =>
        logger.error('snapshot-manager', 'import-evict', err),
      );
    }

    return { imported, skipped };
  }

  // ── Helpers ──────────────────────────────────────────────

  get count(): number {
    return this.snapshots.length;
  }

  private findLRUIndex(): number {
    let minAccess = Infinity;
    let minIdx = 0;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (this.snapshots[i].lastAccessedAt < minAccess) {
        minAccess = this.snapshots[i].lastAccessedAt;
        minIdx = i;
      }
    }
    return minIdx;
  }
}

// ============================================================
// PART 6 — Singleton Export
// ============================================================

export const snapshotManager = new SnapshotManagerImpl();
