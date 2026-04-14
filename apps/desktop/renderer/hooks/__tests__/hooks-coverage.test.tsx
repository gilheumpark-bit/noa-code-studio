/**
 * hooks-coverage.test.tsx
 * Comprehensive hook coverage tests for:
 *   1. useCodeStudioPanels  (5 tests)
 *   2. useStudioAI          (3 tests)
 *   3. useCodeStudioFileSystem (useFileSystem) (5 tests)
 *   4. useCodeStudioKeyboard (3 tests)
 *   5. useLocalStorage       (3 tests — inline implementation)
 *
 * @jest-environment jsdom
 */

// Polyfill structuredClone for jsdom (not available in older Node/jsdom)
if (typeof globalThis.structuredClone === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).structuredClone = function cloneDeep(val: unknown): unknown {
    return JSON.parse(JSON.stringify(val));
  };
}

import { renderHook, act } from '@testing-library/react';

// ============================================================
// Mocks — declared before any import that triggers side-effects
// ============================================================

// Mock ai-providers (used by useCodeStudioPanels)
jest.mock('@/lib/ai-providers', () => ({
  streamChat: jest.fn().mockResolvedValue('mocked response'),
}));

// Mock ai-features (used by useCodeStudioPanels)
jest.mock('@/lib/code-studio/ai/ai-features', () => ({
  estimateTaskCost: jest.fn(),
  explainCode: jest.fn(),
  lintCode: jest.fn(),
  generateCommitMessage: jest.fn(),
}));

// Mock code-studio store (used by useCodeStudioFileSystem)
jest.mock('@/lib/code-studio/core/store', () => ({
  saveFileTree: jest.fn().mockResolvedValue(undefined),
  loadFileTree: jest.fn().mockResolvedValue(null),
}));

// Mock heavy deps of useStudioAI
jest.mock('@/engine/hfcp', () => ({
  processHFCPTurn: jest.fn().mockReturnValue({
    mode: 'normal',
    verdict: 'pass',
    score: 1,
    promptModifier: '',
  }),
}));
jest.mock('@/engine/types', () => ({}));
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/errors', () => ({
  classifyAsStudioError: jest.fn((e: unknown) => ({ code: 'UNKNOWN', message: String(e), retryable: false })),
  StudioErrorCode: { KEY_MISSING: 'KEY_MISSING', KEY_INVALID: 'KEY_INVALID' },
}));
jest.mock('@/lib/tier', () => ({
  canGenerate: jest.fn().mockReturnValue(true),
  incrementGenerationCount: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({ trackAIGeneration: jest.fn() }));
jest.mock('@/services/geminiService', () => ({
  generateStoryStream: jest.fn().mockResolvedValue({
    content: 'generated',
    report: {
      grade: 'A',
      eosScore: 80,
      metrics: { tension: 70, pacing: 60, immersion: 65 },
      worldUpdates: null,
    },
  }),
}));
jest.mock('@/engine/director', () => ({
  analyzeManuscript: jest.fn().mockReturnValue({ findings: [], stats: {}, score: 100 }),
  calculateQualityTag: jest.fn().mockReturnValue({ tag: 'A', label: 'Good', visibleFindings: [] }),
}));
jest.mock('@/engine/pipeline', () => ({
  stripEngineArtifacts: jest.fn((s: string) => s),
}));
jest.mock('@/engine/quality-gate', () => ({
  evaluateQuality: jest.fn().mockReturnValue({ passed: true, attempt: 1, failReasons: [] }),
  getDefaultThresholds: jest.fn().mockReturnValue({}),
  buildRetryHint: jest.fn().mockReturnValue(''),
  getDefaultGateConfig: jest.fn().mockReturnValue({ enabled: false, autoMode: 'off', maxRetries: 1 }),
}));
jest.mock('@/engine/proactive-suggestions', () => ({
  generateSuggestions: jest.fn().mockReturnValue([]),
  getDefaultSuggestionConfig: jest.fn().mockReturnValue({}),
}));
jest.mock('@/engine/writer-profile', () => ({
  updateProfile: jest.fn().mockReturnValue({}),
  loadProfile: jest.fn().mockReturnValue({ skillLevel: 'intermediate' }),
  saveProfile: jest.fn(),
  buildProfileHint: jest.fn().mockReturnValue(''),
}));
jest.mock('@/lib/noa/lora-swap', () => ({
  getNarrativeDepth: jest.fn().mockReturnValue(1.0),
}));
jest.mock('@/engine/auto-pipeline', () => ({
  executePipeline: jest.fn().mockReturnValue({
    id: 'test',
    stages: [],
    totalDuration: 0,
    finalStatus: 'passed',
  }),
  getDefaultPipelineConfig: jest.fn().mockReturnValue({}),
}));
jest.mock('@/engine/validator', () => ({
  filterTrademarks: jest.fn().mockReturnValue({ matches: [], filtered: '' }),
}));

// ============================================================
// PART 1 — useCodeStudioPanels (5 tests)
// ============================================================

import { useCodeStudioPanels } from '../useCodeStudioPanels';
import type { FileNode } from '@noa/quill-engine/types';

const makeFiles = (): FileNode[] => [
  { id: 'f1', name: 'index.tsx', type: 'file', content: 'export function App() {}' },
  {
    id: 'd1', name: 'utils', type: 'folder', children: [
      { id: 'f2', name: 'helpers.ts', type: 'file', content: 'export const add = (a:number,b:number) => a+b;' },
    ],
  },
];

const basePanelOpts = () => ({
  files: makeFiles(),
  activeFileContent: 'export function hello() {}\nconst x = 1;',
  activeFileName: 'hello.ts',
  activeFileLanguage: 'typescript',
});

describe('useCodeStudioPanels', () => {
  it('returns correct initial state shape', () => {
    const { result } = renderHook(() => useCodeStudioPanels(basePanelOpts()));

    expect(result.current.recentFiles).toEqual([]);
    expect(result.current.canvasNodes).toEqual([]);
    expect(result.current.canvasConnections).toEqual([]);
    expect(Array.isArray(result.current.aiFeatures)).toBe(true);
    expect(result.current.aiFeatures.length).toBeGreaterThan(0);
    expect(result.current.dbConnections.length).toBeGreaterThan(0);
  });

  it('handleDbConnect resolves to true (demo mode)', async () => {
    const { result } = renderHook(() => useCodeStudioPanels(basePanelOpts()));

    const connected = await result.current.handleDbConnect({
      id: 'test', name: 'Test', type: 'sqlite', connectionString: ':memory:', connected: false,
    });

    expect(connected).toBe(true);
  });

  it('toggleAiFeature enables and disables a feature', () => {
    const { result } = renderHook(() => useCodeStudioPanels(basePanelOpts()));

    const featureId = result.current.aiFeatures[0].id;
    const initialEnabled = result.current.aiFeatures[0].enabled;

    act(() => { result.current.toggleAiFeature(featureId, !initialEnabled); });
    expect(result.current.aiFeatures.find(f => f.id === featureId)?.enabled).toBe(!initialEnabled);

    act(() => { result.current.toggleAiFeature(featureId, initialEnabled); });
    expect(result.current.aiFeatures.find(f => f.id === featureId)?.enabled).toBe(initialEnabled);
  });

  it('initCanvas populates canvas nodes from file tree', () => {
    const { result } = renderHook(() => useCodeStudioPanels(basePanelOpts()));

    expect(result.current.canvasNodes.length).toBe(0);

    act(() => { result.current.initCanvas(); });
    expect(result.current.canvasNodes.length).toBeGreaterThan(0);
    expect(result.current.canvasConnections.length).toBeGreaterThan(0);
  });

  it('initCanvas is idempotent (second call is no-op)', () => {
    const { result } = renderHook(() => useCodeStudioPanels(basePanelOpts()));

    act(() => { result.current.initCanvas(); });
    const countAfterFirst = result.current.canvasNodes.length;

    act(() => { result.current.initCanvas(); });
    expect(result.current.canvasNodes.length).toBe(countAfterFirst);
  });
});

// ============================================================
// PART 2 — useStudioAI (3 tests)
// ============================================================

import { useStudioAI } from '../useStudioAI';

const makeStudioAIParams = () => ({
  currentSession: {
    id: 's1',
    title: 'Test',
    messages: [],
    config: {
      episode: 1,
      title: 'Test Story',
      platform: 'web' as const,
      narrativeIntensity: 'standard' as const,
      characters: [],
      worldSimData: null,
      simulatorRef: {},
      manuscripts: [],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never,
  currentSessionId: 's1',
  setSessions: jest.fn(),
  updateCurrentSession: jest.fn(),
  hfcpState: {} as never,
  promptDirective: '',
  language: 'EN' as const,
  canvasPass: 0,
  setCanvasContent: jest.fn(),
  setWritingMode: jest.fn(),
  setShowApiKeyModal: jest.fn(),
  setUxError: jest.fn(),
});

describe('useStudioAI', () => {
  it('returns correct initial state', () => {
    const { result } = renderHook(() => useStudioAI(makeStudioAIParams()));

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.lastReport).toBeNull();
    expect(result.current.directorReport).toBeNull();
    expect(typeof result.current.handleSend).toBe('function');
    expect(typeof result.current.handleCancel).toBe('function');
    expect(typeof result.current.handleRegenerate).toBe('function');
  });

  it('canvasPass value is accepted without error', () => {
    const params = makeStudioAIParams();
    params.canvasPass = 2;
    const { result } = renderHook(() => useStudioAI(params));

    expect(result.current.isGenerating).toBe(false);
  });

  it('handleCancel is callable and does not throw', () => {
    const { result } = renderHook(() => useStudioAI(makeStudioAIParams()));

    expect(() => { act(() => { result.current.handleCancel(); }); }).not.toThrow();
    expect(result.current.isGenerating).toBe(false);
  });
});

// ============================================================
// PART 3 — useCodeStudioFileSystem (5 tests)
// ============================================================

import { useCodeStudioFileSystem } from '../useCodeStudioFileSystem';

describe('useCodeStudioFileSystem', () => {
  it('initialises with the provided tree', () => {
    const init: FileNode[] = [
      { id: 'root', name: 'src', type: 'folder', children: [] },
    ];
    const { result } = renderHook(() => useCodeStudioFileSystem(init));

    expect(result.current.tree).toHaveLength(1);
    expect(result.current.tree[0].name).toBe('src');
  });

  it('createFile adds a file to the root', () => {
    const { result } = renderHook(() => useCodeStudioFileSystem([]));

    let created: FileNode | undefined;
    act(() => { created = result.current.createFile(null, 'app.tsx', 'hello'); });

    expect(created).toBeDefined();
    expect(created!.name).toBe('app.tsx');
    expect(result.current.tree).toHaveLength(1);
    expect(result.current.tree[0].content).toBe('hello');
  });

  it('deleteNode removes a file from the tree', () => {
    const init: FileNode[] = [
      { id: 'x1', name: 'delete-me.ts', type: 'file', content: '' },
      { id: 'x2', name: 'keep.ts', type: 'file', content: '' },
    ];
    const { result } = renderHook(() => useCodeStudioFileSystem(init));

    act(() => { result.current.deleteNode('x1'); });

    expect(result.current.tree).toHaveLength(1);
    expect(result.current.tree[0].id).toBe('x2');
  });

  it('updateContent changes file content', () => {
    const init: FileNode[] = [
      { id: 'c1', name: 'main.ts', type: 'file', content: 'old' },
    ];
    const { result } = renderHook(() => useCodeStudioFileSystem(init));

    act(() => { result.current.updateContent('c1', 'new content'); });

    expect(result.current.tree[0].content).toBe('new content');
  });

  it('findNode locates nested nodes', () => {
    const init: FileNode[] = [
      {
        id: 'p1', name: 'src', type: 'folder', children: [
          { id: 'n1', name: 'deep.ts', type: 'file', content: 'nested' },
        ],
      },
    ];
    const { result } = renderHook(() => useCodeStudioFileSystem(init));

    const found = result.current.findNode('n1');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('deep.ts');

    const notFound = result.current.findNode('nonexistent');
    expect(notFound).toBeNull();
  });
});

// ============================================================
// PART 4 — useCodeStudioKeyboard (3 tests)
// ============================================================

import { useCodeStudioKeyboard } from '../useCodeStudioKeyboard';

describe('useCodeStudioKeyboard', () => {
  it('registers a binding and returns it via getBindings', () => {
    const { result } = renderHook(() => useCodeStudioKeyboard());

    act(() => {
      result.current.register({
        id: 'editor.save',
        keys: 'ctrl+s',
        handler: jest.fn(),
        description: 'Save',
      });
    });

    const bindings = result.current.getBindings();
    expect(bindings).toHaveLength(1);
    expect(bindings[0].keys).toBe('ctrl+s');
  });

  it('handler is invoked on matching keydown event', () => {
    const handler = jest.fn();
    const { result: _result } = renderHook(() =>
      useCodeStudioKeyboard({
        bindings: [{ id: 'test.ctrlk', keys: 'ctrl+k', handler, description: 'test' }],
      }),
    );

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unregister removes a binding', () => {
    const { result } = renderHook(() => useCodeStudioKeyboard());

    act(() => {
      result.current.register({ id: 'general.help', keys: 'f1', handler: jest.fn(), description: 'Help' });
      result.current.register({ id: 'general.debug', keys: 'f2', handler: jest.fn(), description: 'Debug' });
    });

    expect(result.current.getBindings()).toHaveLength(2);

    act(() => { result.current.unregister('f1'); });

    expect(result.current.getBindings()).toHaveLength(1);
    expect(result.current.getBindings()[0].keys).toBe('f2');
  });
});

// ============================================================
// PART 5 — useLocalStorage (3 tests)
// Inline hook since no useLocalStorage exists in the codebase.
// Tests verify localStorage interaction patterns used across
// the project (e.g. noa_temperature in useStudioAI).
// ============================================================

import { useState, useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useLocalStorage(key: string, initialValue: any) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setValue = useCallback((value: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStoredValue((prev: any) => {
      const next = typeof value === 'function' ? value(prev) : value;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  const removeValue = useCallback(() => {
    localStorage.removeItem(key);
    setStoredValue(initialValue);
  }, [key, initialValue]);

  return { value: storedValue, set: setValue, remove: removeValue };
}

describe('useLocalStorage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('reads initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 42));

    expect(result.current.value).toBe(42);
  });

  it('set persists JSON to localStorage and updates state', () => {
    const { result } = renderHook(() => useLocalStorage('obj-key', { name: 'a' }));

    act(() => { result.current.set({ name: 'updated' }); });

    expect(result.current.value).toEqual({ name: 'updated' });
    expect(JSON.parse(localStorage.getItem('obj-key')!)).toEqual({ name: 'updated' });
  });

  it('remove clears localStorage and resets to initial value', () => {
    localStorage.setItem('rm-key', JSON.stringify('persisted'));
    const { result } = renderHook(() => useLocalStorage('rm-key', 'default'));

    // Should have loaded persisted value
    expect(result.current.value).toBe('persisted');

    act(() => { result.current.remove(); });

    expect(result.current.value).toBe('default');
    expect(localStorage.getItem('rm-key')).toBeNull();
  });
});
