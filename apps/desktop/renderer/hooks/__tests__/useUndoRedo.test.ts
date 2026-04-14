/**
 * Unit tests for useUndoRedo hook logic.
 *
 * @testing-library/react is not available, so we test the hook using
 * React's renderHook-equivalent via react-dom/test-utils and a minimal
 * wrapper that exercises the hook's state transitions.
 *
 * Since the hook relies on useState/useRef/useCallback, we simulate it
 * by calling the hook inside a real React component rendered via jsdom.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react';
import { useUndoRedo } from '@/hooks/useUndoRedo';

// ============================================================
// PART 1 — Test harness
// ============================================================

interface HarnessResult<T> {
  state: T;
  canUndo: boolean;
  canRedo: boolean;
  setState: (v: T) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

function createHarness<T>(initialState: T, maxHistory?: number) {
  const ref: { current: HarnessResult<T> | null } = { current: null };
  const container = document.createElement('div');
  document.body.appendChild(container);

  function TestComponent() {
    const hook = useUndoRedo({ initialState, maxHistory });
    React.useEffect(() => { ref.current = hook; });
    return null;
  }

  let root: ReactDOM.Root;
  act(() => {
    root = ReactDOM.createRoot(container);
    root.render(React.createElement(TestComponent));
  });

  function get() {
    return ref.current!;
  }

  function cleanup() {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  }

  return { get, cleanup };
}

// ============================================================
// PART 2 — Tests
// ============================================================

describe('useUndoRedo', () => {
  it('starts with the initial state', () => {
    const { get, cleanup } = createHarness('A');
    expect(get().state).toBe('A');
    expect(get().canUndo).toBe(false);
    expect(get().canRedo).toBe(false);
    cleanup();
  });

  it('tracks state changes and supports undo', () => {
    const { get, cleanup } = createHarness('A');

    act(() => { get().setState('B'); });
    expect(get().state).toBe('B');
    expect(get().canUndo).toBe(true);

    act(() => { get().undo(); });
    expect(get().state).toBe('A');
    expect(get().canUndo).toBe(false);

    cleanup();
  });

  it('supports redo after undo', () => {
    const { get, cleanup } = createHarness('A');

    act(() => { get().setState('B'); });
    act(() => { get().undo(); });
    expect(get().canRedo).toBe(true);

    act(() => { get().redo(); });
    expect(get().state).toBe('B');
    expect(get().canRedo).toBe(false);

    cleanup();
  });

  it('clears future on new state after undo', () => {
    const { get, cleanup } = createHarness('A');

    act(() => { get().setState('B'); });
    act(() => { get().setState('C'); });
    act(() => { get().undo(); }); // back to B
    act(() => { get().setState('D'); }); // new branch, C should be gone

    expect(get().state).toBe('D');
    expect(get().canRedo).toBe(false);

    cleanup();
  });

  it('respects maxHistory limit', () => {
    const { get, cleanup } = createHarness(0, 3);

    act(() => { get().setState(1); });
    act(() => { get().setState(2); });
    act(() => { get().setState(3); });
    act(() => { get().setState(4); });

    // History has max 3 entries; 4 setState calls means oldest is dropped
    // Undo chain: 4 -> 3 -> 2 -> 1 (but only 3 stored, so 4->3->2->1 limited)
    act(() => { get().undo(); });
    act(() => { get().undo(); });
    act(() => { get().undo(); });

    // Should stop here since history is capped at 3
    expect(get().canUndo).toBe(false);

    cleanup();
  });

  it('clearHistory resets undo/redo but keeps current state', () => {
    const { get, cleanup } = createHarness('A');

    act(() => { get().setState('B'); });
    act(() => { get().setState('C'); });
    act(() => { get().clearHistory(); });

    expect(get().state).toBe('C');
    expect(get().canUndo).toBe(false);
    expect(get().canRedo).toBe(false);

    cleanup();
  });

  it('undo on empty past is a no-op', () => {
    const { get, cleanup } = createHarness('X');

    act(() => { get().undo(); });
    expect(get().state).toBe('X');

    cleanup();
  });

  it('redo on empty future is a no-op', () => {
    const { get, cleanup } = createHarness('X');

    act(() => { get().redo(); });
    expect(get().state).toBe('X');

    cleanup();
  });
});
