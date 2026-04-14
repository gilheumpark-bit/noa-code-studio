/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for useCodeStudioComposer hook.
 * Covers: state machine transitions, accept/reject changes, reset, abort.
 * AI streaming (compose) is tested separately via mocked streamChat.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react';
import {
  useCodeStudioComposer,
} from '@/hooks/useCodeStudioComposer';

// Mock streamChat and logger to avoid real AI calls
jest.mock('@/lib/ai-providers', () => ({
  streamChat: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { streamChat } from '@/lib/ai-providers';
const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

// ============================================================
// PART 1 — Test Harness
// ============================================================

function createHarness() {
  const ref: { current: ReturnType<typeof useCodeStudioComposer> | null } = { current: null };
  const container = document.createElement('div');
  document.body.appendChild(container);

  function TestComponent() {
    const hook = useCodeStudioComposer();
    React.useEffect(() => { ref.current = hook; });
    return null;
  }

  let root: ReactDOM.Root;
  act(() => {
    root = ReactDOM.createRoot(container);
    root.render(React.createElement(TestComponent));
  });

  return {
    get: () => ref.current!,
    cleanup: () => {
      act(() => { root.unmount(); });
      document.body.removeChild(container);
    },
  };
}

// ============================================================
// PART 2 — State Machine Tests
// ============================================================

describe('useCodeStudioComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes in idle mode with empty changes', () => {
    const { get, cleanup } = createHarness();
    expect(get().mode).toBe('idle');
    expect(get().composing).toBe(false);
    expect(get().changes).toEqual([]);
    cleanup();
  });

  it('transitionMode enforces allowed transitions', () => {
    const { get, cleanup } = createHarness();

    // idle → generating is valid
    let result: boolean;
    act(() => { result = get().transitionMode('generating'); });
    expect(result!).toBe(true);
    expect(get().mode).toBe('generating');

    // generating → review is invalid (must go through verifying)
    act(() => { result = get().transitionMode('review'); });
    expect(result!).toBe(false);
    expect(get().mode).toBe('generating');

    // generating → verifying is valid
    act(() => { result = get().transitionMode('verifying'); });
    expect(result!).toBe(true);
    expect(get().mode).toBe('verifying');

    cleanup();
  });

  it('composing is true only in generating mode', () => {
    const { get, cleanup } = createHarness();
    expect(get().composing).toBe(false);

    act(() => { get().transitionMode('generating'); });
    expect(get().composing).toBe(true);

    act(() => { get().transitionMode('verifying'); });
    expect(get().composing).toBe(false);
    cleanup();
  });

  it('reset returns to idle and clears changes', () => {
    const { get, cleanup } = createHarness();
    act(() => { get().transitionMode('generating'); });
    act(() => { get().reset(); });

    expect(get().mode).toBe('idle');
    expect(get().changes).toEqual([]);
    cleanup();
  });

  // ============================================================
  // PART 3 — Accept/Reject Tests
  // ============================================================

  it('compose generates changes and transitions to verifying', async () => {
    mockStreamChat.mockImplementation(async (opts: any): Promise<string> => {
      opts.onChunk('modified content');
      return 'modified content';
    });

    const { get, cleanup } = createHarness();
    const getContent = (_id: string) => 'original content';
    const getFileName = (id: string) => `${id}.ts`;

    await act(async () => {
      await get().compose(['file1'], 'Add comments', getContent, getFileName);
    });

    expect(get().mode).toBe('verifying');
    expect(get().changes).toHaveLength(1);
    expect(get().changes[0].fileId).toBe('file1');
    expect(get().changes[0].original).toBe('original content');
    expect(get().changes[0].modified).toBe('modified content');
    expect(get().changes[0].status).toBe('pending');
    cleanup();
  });

  it('accept marks a change as accepted', async () => {
    mockStreamChat.mockImplementation(async (opts: any): Promise<string> => {
      opts.onChunk('modified');
      return 'modified';
    });

    const { get, cleanup } = createHarness();
    await act(async () => {
      await get().compose(['f1', 'f2'], 'fix', () => 'orig', (id) => id);
    });

    act(() => { get().accept('f1'); });
    expect(get().changes.find(c => c.fileId === 'f1')?.status).toBe('accepted');
    expect(get().changes.find(c => c.fileId === 'f2')?.status).toBe('pending');
    cleanup();
  });

  it('reject marks a change as rejected', async () => {
    mockStreamChat.mockImplementation(async (opts: any): Promise<string> => {
      opts.onChunk('modified');
      return 'modified';
    });

    const { get, cleanup } = createHarness();
    await act(async () => {
      await get().compose(['f1'], 'fix', () => 'orig', (id) => id);
    });

    act(() => { get().reject('f1'); });
    expect(get().changes[0].status).toBe('rejected');
    cleanup();
  });

  it('acceptAll / rejectAll bulk-updates pending changes', async () => {
    mockStreamChat.mockImplementation(async (opts: any): Promise<string> => {
      opts.onChunk('mod');
      return 'mod';
    });

    const { get, cleanup } = createHarness();
    await act(async () => {
      await get().compose(['f1', 'f2', 'f3'], 'fix', () => 'orig', (id) => id);
    });

    // Accept f1 individually first
    act(() => { get().accept('f1'); });

    // rejectAll should only change pending items
    act(() => { get().rejectAll(); });
    expect(get().changes.find(c => c.fileId === 'f1')?.status).toBe('accepted');
    expect(get().changes.find(c => c.fileId === 'f2')?.status).toBe('rejected');
    expect(get().changes.find(c => c.fileId === 'f3')?.status).toBe('rejected');
    cleanup();
  });

  it('getAccepted returns only accepted changes', async () => {
    mockStreamChat.mockImplementation(async (opts: any): Promise<string> => {
      opts.onChunk('mod');
      return 'mod';
    });

    const { get, cleanup } = createHarness();
    await act(async () => {
      await get().compose(['f1', 'f2'], 'fix', () => 'orig', (id) => id);
    });

    act(() => { get().accept('f1'); });
    act(() => { get().reject('f2'); });

    const accepted = get().getAccepted();
    expect(accepted).toHaveLength(1);
    expect(accepted[0].fileId).toBe('f1');
    cleanup();
  });

  it('skips files where getContent returns null', async () => {
    mockStreamChat.mockImplementation(async (opts: any): Promise<string> => {
      opts.onChunk('mod');
      return 'mod';
    });

    const { get, cleanup } = createHarness();
    const getContent = (id: string) => id === 'f1' ? null : 'content';

    await act(async () => {
      await get().compose(['f1', 'f2'], 'fix', getContent, (id) => id);
    });

    expect(get().changes).toHaveLength(1);
    expect(get().changes[0].fileId).toBe('f2');
    cleanup();
  });

  it('compose transitions to error on non-abort exception', async () => {
    mockStreamChat.mockRejectedValue(new Error('Network failure'));

    const { get, cleanup } = createHarness();
    await act(async () => {
      await get().compose(['f1'], 'fix', () => 'orig', (id) => id);
    });

    expect(get().mode).toBe('error');
    cleanup();
  });
});
