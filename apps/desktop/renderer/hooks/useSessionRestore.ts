// ============================================================
// PART 1 — Session Restore Hook
// Persists and restores Code Studio session state via IndexedDB.
// Saves: last project ID, open files, active panel, scroll/cursor.
// ============================================================

"use client";

import { useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────

export interface SessionSnapshot {
  /** ISO timestamp of last save */
  savedAt: string;
  /** Active project ID (from code-studio-store) */
  projectId: string | null;
  /** List of open file paths */
  openFiles: string[];
  /** Currently active file path */
  activeFile: string | null;
  /** Active right panel ID */
  activePanel: string | null;
  /** Sidebar width in px */
  sidebarWidth: number;
}

const DB_NAME = "eh-session-restore";
const STORE_NAME = "sessions";
const SESSION_KEY = "code-studio-last";
const DB_VERSION = 1;

// IDENTITY_SEAL: PART-1 | role=Types+Constants | inputs=none | outputs=SessionSnapshot

// ============================================================
// PART 2 — IndexedDB Helpers
// ============================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSession(snapshot: SessionSnapshot): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(snapshot, SESSION_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable (SSR, incognito, quota) — silently skip
  }
}

async function loadSession(): Promise<SessionSnapshot | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    const result = await new Promise<SessionSnapshot | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

// IDENTITY_SEAL: PART-2 | role=IndexedDB | inputs=SessionSnapshot | outputs=save/load

// ============================================================
// PART 3 — React Hook
// ============================================================

interface UseSessionRestoreOptions {
  /** Current project ID */
  projectId: string | null;
  /** Current open file paths */
  openFiles: string[];
  /** Currently active file */
  activeFile: string | null;
  /** Active right panel */
  activePanel: string | null;
  /** Sidebar width */
  sidebarWidth: number;
  /** Called when a previous session is found on mount */
  onRestore?: (snapshot: SessionSnapshot) => void;
}

/**
 * Persists Code Studio session state to IndexedDB.
 * Auto-saves on changes (debounced 2s).
 * Calls onRestore once on mount if a previous session exists.
 */
export function useSessionRestore({
  projectId,
  openFiles,
  activeFile,
  activePanel,
  sidebarWidth,
  onRestore,
}: UseSessionRestoreOptions) {
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore on mount (once)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    loadSession().then((snapshot) => {
      if (snapshot && onRestore) onRestore(snapshot);
    });
  }, [onRestore]);

  // Auto-save (debounced)
  const save = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const snapshot: SessionSnapshot = {
        savedAt: new Date().toISOString(),
        projectId,
        openFiles,
        activeFile,
        activePanel,
        sidebarWidth,
      };
      saveSession(snapshot);
    }, 2000);
  }, [projectId, openFiles, activeFile, activePanel, sidebarWidth]);

  useEffect(() => {
    save();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [save]);
}

// IDENTITY_SEAL: PART-3 | role=Hook | inputs=session state | outputs=auto-save/restore
