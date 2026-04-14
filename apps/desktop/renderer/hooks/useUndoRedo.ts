// ============================================================
// PART 1 — Types & Imports
// ============================================================

import { useState, useCallback } from 'react';

interface UseUndoRedoOptions<T> {
  initialState: T;
  maxHistory?: number;
}

interface UseUndoRedoReturn<T> {
  state: T;
  setState: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Reset history, keeping current state */
  clearHistory: () => void;
}

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=UseUndoRedoReturn

// ============================================================
// PART 2 — Hook implementation (state-based history for React 19 compat)
// ============================================================

/**
 * Generic undo/redo hook backed by state-based history stacks.
 * @param initialState - Starting value for the managed state
 * @param maxHistory - Maximum number of undo steps to retain (default 20)
 */
export function useUndoRedo<T>({ initialState, maxHistory = 20 }: UseUndoRedoOptions<T>): UseUndoRedoReturn<T> {
  const [state, setStateRaw] = useState<T>(initialState);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const setState = useCallback((newState: T) => {
    setStateRaw(prev => {
      setPast(p => [...p, prev].slice(-maxHistory));
      setFuture([]);
      return newState;
    });
  }, [maxHistory]);

  const undo = useCallback(() => {
    setPast(prevPast => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, -1);
      setStateRaw(current => {
        setFuture(f => [current, ...f].slice(0, maxHistory));
        return previous;
      });
      return newPast;
    });
  }, [maxHistory]);

  const redo = useCallback(() => {
    setFuture(prevFuture => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);
      setStateRaw(current => {
        setPast(p => [...p, current].slice(-maxHistory));
        return next;
      });
      return newFuture;
    });
  }, [maxHistory]);

  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    clearHistory,
  };
}

// IDENTITY_SEAL: PART-2 | role=undo/redo hook | inputs=initialState,maxHistory | outputs=state,undo,redo
