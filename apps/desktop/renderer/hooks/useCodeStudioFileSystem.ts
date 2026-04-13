// @ts-nocheck
// ============================================================
// Code Studio — File System Hook
// CRUD operations on FileNode tree, undo/redo file changes,
// watch for changes, persist to IndexedDB.
// ============================================================

// ============================================================
// PART 1 — Types
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { FileNode } from '@noa/quill-engine/types';
import { detectLanguage } from '@noa/quill-engine/types';
import { saveFileTree, loadFileTree } from '@/lib/code-studio/core/store';

interface UseCodeStudioFileSystemReturn {
  tree: FileNode[];
  setTree: (tree: FileNode[] | ((prev: FileNode[]) => FileNode[])) => void;
  createFile: (parentId: string | null, name: string, content?: string) => FileNode;
  createFolder: (parentId: string | null, name: string) => FileNode;
  deleteNode: (id: string) => void;
  renameNode: (id: string, newName: string) => void;
  updateContent: (id: string, content: string) => void;
  moveNode: (id: string, newParentId: string | null) => void;
  findNode: (id: string) => FileNode | null;
  findByPath: (path: string) => FileNode | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  persist: () => Promise<void>;
  load: () => Promise<void>;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=UseCodeStudioFileSystemReturn

// ============================================================
// PART 2 — Tree Utilities
// ============================================================

function generateId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findInTree(nodes: FileNode[], id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findByPathInTree(nodes: FileNode[], path: string): FileNode | null {
  const parts = path.split('/');
  let current = nodes;
  for (let i = 0; i < parts.length; i++) {
    const match = current.find((n) => n.name === parts[i]);
    if (!match) return null;
    if (i === parts.length - 1) return match;
    if (!match.children) return null;
    current = match.children;
  }
  return null;
}

function removeFromTree(nodes: FileNode[], id: string): FileNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({
      ...n,
      children: n.children ? removeFromTree(n.children, id) : undefined,
    }));
}

function insertIntoTree(nodes: FileNode[], parentId: string | null, newNode: FileNode): FileNode[] {
  if (parentId === null) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.id === parentId && n.type === 'folder') {
      return { ...n, children: [...(n.children ?? []), newNode] };
    }
    return {
      ...n,
      children: n.children ? insertIntoTree(n.children, parentId, newNode) : undefined,
    };
  });
}

function updateInTree(nodes: FileNode[], id: string, updater: (node: FileNode) => FileNode): FileNode[] {
  return nodes.map((n) => {
    if (n.id === id) return updater(n);
    return {
      ...n,
      children: n.children ? updateInTree(n.children, id, updater) : undefined,
    };
  });
}

// IDENTITY_SEAL: PART-2 | role=TreeUtils | inputs=FileNode[],id | outputs=FileNode[]

// ============================================================
// PART 3 — Hook
// ============================================================

const MAX_UNDO = 50;

/** Virtual file system hook: CRUD on FileNode tree with undo/redo stacks and IndexedDB persistence */
export function useCodeStudioFileSystem(initialTree: FileNode[] = []): UseCodeStudioFileSystemReturn {
  const [tree, setTreeState] = useState<FileNode[]>(initialTree);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStack = useRef<FileNode[][]>([]);
  const redoStack = useRef<FileNode[][]>([]);

  const syncStackFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const pushUndo = useCallback((current: FileNode[]) => {
    undoStack.current.push(structuredClone(current));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    syncStackFlags();
  }, [syncStackFlags]);

  const setTree = useCallback((newTreeOrUpdater: FileNode[] | ((prev: FileNode[]) => FileNode[])) => {
    setTreeState((prev) => {
      pushUndo(prev);
      return typeof newTreeOrUpdater === 'function' ? newTreeOrUpdater(prev) : newTreeOrUpdater;
    });
  }, [pushUndo]);

  const createFile = useCallback((parentId: string | null, name: string, content = ''): FileNode => {
    const node: FileNode = {
      id: generateId(),
      name,
      type: 'file',
      content,
      language: detectLanguage(name),
    };
    setTreeState((prev) => {
      pushUndo(prev);
      return insertIntoTree(prev, parentId, node);
    });
    return node;
  }, [pushUndo]);

  const createFolder = useCallback((parentId: string | null, name: string): FileNode => {
    const node: FileNode = {
      id: generateId(),
      name,
      type: 'folder',
      children: [],
    };
    setTreeState((prev) => {
      pushUndo(prev);
      return insertIntoTree(prev, parentId, node);
    });
    return node;
  }, [pushUndo]);

  const deleteNode = useCallback((id: string) => {
    setTreeState((prev) => {
      pushUndo(prev);
      return removeFromTree(prev, id);
    });
  }, [pushUndo]);

  const renameNode = useCallback((id: string, newName: string) => {
    setTreeState((prev) => {
      pushUndo(prev);
      return updateInTree(prev, id, (n) => ({
        ...n,
        name: newName,
        language: n.type === 'file' ? detectLanguage(newName) : n.language,
      }));
    });
  }, [pushUndo]);

  const updateContent = useCallback(async (id: string, content: string) => {
    // Content updates don't push undo (too frequent). Use file-level version history instead.
    setTreeState((prev) =>
      updateInTree(prev, id, (n) => ({ ...n, content })),
    );

    // If Electron and local path
    if (id.startsWith('local-')) {
      const filePath = id.replace('local-', '');
      if (typeof window !== 'undefined' && window.electron) {
        await window.electron.fs.writeFile(filePath, content);
      }
    }
  }, []);

  const moveNode = useCallback((id: string, newParentId: string | null) => {
    setTreeState((prev) => {
      const node = findInTree(prev, id);
      if (!node) return prev;
      pushUndo(prev);
      const cleaned = removeFromTree(prev, id);
      return insertIntoTree(cleaned, newParentId, node);
    });
  }, [pushUndo]);

  const findNode = useCallback((id: string): FileNode | null => {
    return findInTree(tree, id);
  }, [tree]);

  const findByPath = useCallback((path: string): FileNode | null => {
    return findByPathInTree(tree, path);
  }, [tree]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    setTreeState((prev) => {
      redoStack.current.push(structuredClone(prev));
      const restored = undoStack.current.pop()!;
      syncStackFlags();
      return restored;
    });
  }, [syncStackFlags]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    setTreeState((prev) => {
      undoStack.current.push(structuredClone(prev));
      const restored = redoStack.current.pop()!;
      syncStackFlags();
      return restored;
    });
  }, [syncStackFlags]);

  const persist = useCallback(async () => {
    await saveFileTree(tree);
  }, [tree]);

  const load = useCallback(async () => {
    const loaded = await loadFileTree();
    if (loaded) setTreeState(loaded);
  }, []);

  return {
    tree,
    setTree,
    createFile,
    createFolder,
    deleteNode,
    renameNode,
    updateContent,
    moveNode,
    findNode,
    findByPath,
    undo,
    redo,
    canUndo,
    canRedo,
    persist,
    load,
  };
}

// IDENTITY_SEAL: PART-3 | role=FileSystemHook | inputs=initialTree | outputs=CRUD+undo/redo
