// @ts-nocheck
/**
 * Code Studio — Desktop Project Hook
 *
 * Bridges window.cs.fs (Electron IPC) into the renderer's FileNode model.
 * Handles "Open Local Folder", recursive directory scan, file watching,
 * and persistence back to disk.
 *
 * PART 1 — Types
 * PART 2 — Tree builder (disk → FileNode[])
 * PART 3 — Hook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FileNode } from '@noa/quill-engine/types';
import { detectLanguage } from '@noa/quill-engine/types';

// ============================================================
// PART 1 — Types
// ============================================================

export interface DesktopProjectState {
  rootPath: string | null;
  rootName: string | null;
  tree: FileNode[];
  loading: boolean;
  error: string | null;
}

export interface UseDesktopProjectReturn extends DesktopProjectState {
  openLocalFolder: () => Promise<void>;
  reloadTree: () => Promise<void>;
  closeProject: () => void;
  loadFileContent: (filePath: string) => Promise<string>;
  saveFileContent: (filePath: string, content: string) => Promise<void>;
}

const IGNORED_PREFIXES = ['.git', 'node_modules', '.next', 'dist', 'coverage', 'out', '.turbo'];

// ============================================================
// PART 2 — Tree builder
// ============================================================

function isIgnored(name: string): boolean {
  if (name.startsWith('.DS_Store')) return true;
  return IGNORED_PREFIXES.some((p) => name === p || name.startsWith(`${p}/`));
}

function pathToNodeId(absPath: string): string {
  return `local-${absPath}`;
}

interface FsEntryShape {
  name: string;
  isDirectory: boolean;
  path: string;
}

async function scanDir(absPath: string, depth = 0, maxDepth = 8): Promise<FileNode[]> {
  if (depth > maxDepth) return [];
  const cs = (typeof window !== 'undefined' ? window.cs : undefined) as
    | { fs: { readDir: (p: string) => Promise<FsEntryShape[]> } }
    | undefined;
  if (!cs?.fs) return [];

  let entries: FsEntryShape[];
  try {
    entries = await cs.fs.readDir(absPath);
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    if (entry.isDirectory) {
      const children = await scanDir(entry.path, depth + 1, maxDepth);
      nodes.push({
        id: pathToNodeId(entry.path),
        name: entry.name,
        type: 'folder',
        children,
      } as FileNode);
    } else {
      nodes.push({
        id: pathToNodeId(entry.path),
        name: entry.name,
        type: 'file',
        language: detectLanguage(entry.name),
      } as FileNode);
    }
  }

  // Folders first, then files; both alphabetical
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

// ============================================================
// PART 3 — Hook
// ============================================================

export function useDesktopProject(): UseDesktopProjectReturn {
  const [state, setState] = useState<DesktopProjectState>({
    rootPath: null,
    rootName: null,
    tree: [],
    loading: false,
    error: null,
  });

  const watcherCleanupRef = useRef<(() => void) | null>(null);

  const reloadTree = useCallback(async () => {
    setState((s) => {
      if (!s.rootPath) return s;
      return { ...s, loading: true, error: null };
    });
    try {
      const root = state.rootPath;
      if (!root) return;
      const tree = await scanDir(root);
      setState((s) => ({ ...s, tree, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, [state.rootPath]);

  const openLocalFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !window.cs?.fs) {
      setState((s) => ({ ...s, error: 'Desktop bridge not available' }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const selected = await window.cs.fs.openDirectory();
      if (!selected) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const tree = await scanDir(selected);
      const rootName = selected.split(/[\\/]/).filter(Boolean).pop() ?? selected;

      // Tear down previous watcher
      if (watcherCleanupRef.current) {
        watcherCleanupRef.current();
        watcherCleanupRef.current = null;
      }

      setState({
        rootPath: selected,
        rootName,
        tree,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  const closeProject = useCallback(() => {
    if (watcherCleanupRef.current) {
      watcherCleanupRef.current();
      watcherCleanupRef.current = null;
    }
    setState({ rootPath: null, rootName: null, tree: [], loading: false, error: null });
  }, []);

  const loadFileContent = useCallback(async (filePath: string): Promise<string> => {
    if (typeof window === 'undefined' || !window.cs?.fs) {
      throw new Error('Desktop bridge not available');
    }
    return window.cs.fs.readFile(filePath);
  }, []);

  const saveFileContent = useCallback(async (filePath: string, content: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.cs?.fs) {
      throw new Error('Desktop bridge not available');
    }
    await window.cs.fs.writeFile(filePath, content);
  }, []);

  // Watcher: re-scan tree on changes (debounced naturally by main-side
  // awaitWriteFinish; here we coalesce multiple events into one reload)
  useEffect(() => {
    if (!state.rootPath) return;
    if (typeof window === 'undefined' || !window.cs?.fs) return;

    let pending: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const rootPath = state.rootPath;
    const watchId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let cleanupFn: (() => void) | null = null;

    void window.cs.fs
      .watch({ rootPath, watchId }, () => {
        if (cancelled) return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
          void reloadTree();
        }, 400);
      })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        cleanupFn = cleanup;
        watcherCleanupRef.current = cleanup;
      });

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      if (cleanupFn) cleanupFn();
      watcherCleanupRef.current = null;
    };
  }, [state.rootPath, reloadTree]);

  return {
    ...state,
    openLocalFolder,
    reloadTree,
    closeProject,
    loadFileContent,
    saveFileContent,
  };
}
