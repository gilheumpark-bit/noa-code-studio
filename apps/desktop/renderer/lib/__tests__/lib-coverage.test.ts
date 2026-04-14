/**
 * lib-coverage.test.ts
 * Boost test coverage for lib services:
 *   1. ai-providers  (4 tests)
 *   2. code-studio/core/types  (4 tests)
 *   3. code-studio/core/panel-registry  (3 tests)
 *   4. code-studio/editor/editor-features  (3 tests)
 *   5. code-studio/ai/ari-engine  (5 tests)
 *   6. code-studio/core/scope-policy  (4 tests)
 *   7. i18n  (2 tests)
 */

// ============================================================
// 1. ai-providers
// ============================================================

import {
  PROVIDER_LIST,
  getCapabilities,
  supportsStructuredOutput,
  getModelWarning,
} from '../ai-providers';

describe('ai-providers extended', () => {
  it('getCapabilities returns config for each provider', () => {
    const cap = getCapabilities('gemini');
    expect(cap).toBeDefined();
    expect(cap.streaming).toBe(true);
    expect(cap.maxContextTokens).toBeGreaterThan(0);
  });

  it('supportsStructuredOutput reflects provider capability', () => {
    expect(supportsStructuredOutput('gemini')).toBe(true);
    expect(supportsStructuredOutput('ollama')).toBe(false);
  });

  it('getModelWarning returns warning for preview models', () => {
    const warning = getModelWarning('gemini-3.1-pro-preview', 'en');
    expect(warning).not.toBeNull();
    expect(warning).toContain('preview');
  });

  it('PROVIDER_LIST includes all 7 defined providers', () => {
    const ids = PROVIDER_LIST.map((p) => p.id);
    expect(ids).toContain('gemini');
    expect(ids).toContain('openai');
    expect(ids).toContain('claude');
    expect(ids).toContain('groq');
    expect(ids).toContain('mistral');
    expect(ids).toContain('ollama');
    expect(ids).toContain('lmstudio');
  });
});

// ============================================================
// 2. code-studio/core/types
// ============================================================

import { detectLanguage, fileIconColor } from '../code-studio/core/types';

describe('detectLanguage', () => {
  it('maps .ts to typescript', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
  });

  it('maps .js to javascript', () => {
    expect(detectLanguage('app.js')).toBe('javascript');
  });

  it('maps .py to python', () => {
    expect(detectLanguage('main.py')).toBe('python');
  });

  it('maps .md to markdown', () => {
    expect(detectLanguage('README.md')).toBe('markdown');
  });
});

describe('fileIconColor', () => {
  it('returns blue for .ts files', () => {
    expect(fileIconColor('index.ts')).toBe('text-blue-400');
  });

  it('returns yellow for .js files', () => {
    expect(fileIconColor('app.js')).toBe('text-yellow-400');
  });

  it('returns fallback for unknown extension', () => {
    expect(fileIconColor('data.xyz')).toBe('text-text-tertiary');
  });

  it('returns green for .py files', () => {
    expect(fileIconColor('main.py')).toBe('text-green-400');
  });
});

// ============================================================
// 3. code-studio/core/panel-registry
// ============================================================

import {
  PANEL_REGISTRY,
  getPanelDef,
  getVisiblePanels,
} from '../code-studio/core/panel-registry';

describe('panel-registry', () => {
  it('PANEL_REGISTRY has 51 entries', () => {
    expect(PANEL_REGISTRY).toHaveLength(51);
  });

  it('getPanelDef finds a panel by id', () => {
    const chat = getPanelDef('chat');
    expect(chat).toBeDefined();
    expect(chat!.label).toBe('AI Chat');
    expect(chat!.group).toBe('editing');
  });

  it('getVisiblePanels(false) filters to essential panels only', () => {
    const essential = getVisiblePanels(false);
    expect(essential.length).toBeLessThan(PANEL_REGISTRY.length);
    essential.forEach((p) => {
      expect(p.isEssential).toBe(true);
    });
  });
});

// ============================================================
// 4. code-studio/editor/editor-features
// ============================================================

import { registerEditorFeatures } from '../code-studio/editor/editor-features';

describe('editor-features', () => {
  it('registerEditorFeatures is a function', () => {
    expect(typeof registerEditorFeatures).toBe('function');
  });

  it('module exports registerEditorFeatures as its main entry', async () => {
    const mod = await import('../code-studio/editor/editor-features');
    expect(mod).toHaveProperty('registerEditorFeatures');
  });

  it('module loads without throwing', async () => {
    await expect(import('../code-studio/editor/editor-features')).resolves.toBeDefined();
  });
});

// ============================================================
// 5. code-studio/ai/ari-engine
// ============================================================

import { ARIManager } from '../code-studio/ai/ari-engine';

describe('ARIManager', () => {
  let ari: ARIManager;

  beforeEach(() => {
    ari = new ARIManager();
  });

  it('updateAfterCall increases score on success', () => {
    const before = ari.getScore('test-provider');
    ari.updateAfterCall('test-provider', true, 500);
    const after = ari.getScore('test-provider');
    expect(after).toBeGreaterThan(before);
  });

  it('updateAfterCall decreases score on failure', () => {
    const before = ari.getScore('test-provider');
    ari.updateAfterCall('test-provider', false, 500);
    const after = ari.getScore('test-provider');
    expect(after).toBeLessThan(before);
  });

  it('getBestProvider returns highest-score available provider', () => {
    ari.updateAfterCall('fast', true, 100);
    ari.updateAfterCall('fast', true, 100);
    ari.updateAfterCall('slow', false, 5000);
    const best = ari.getBestProvider(['fast', 'slow']);
    expect(best).toBe('fast');
  });

  it('isAvailable returns true for fresh provider (closed circuit)', () => {
    expect(ari.isAvailable('new-provider')).toBe(true);
  });

  it('circuit opens when score drops below threshold', () => {
    // Drive score below 30 via repeated failures
    for (let i = 0; i < 10; i++) {
      ari.updateAfterCall('failing', false, 500);
    }
    expect(ari.getCircuitState('failing')).toBe('open');
    expect(ari.isAvailable('failing')).toBe(false);
  });
});

// ============================================================
// 6. code-studio/core/scope-policy
// ============================================================

import { PolicyManager } from '../code-studio/core/scope-policy';

describe('PolicyManager', () => {
  beforeEach(() => {
    PolicyManager.resetInstance();
  });

  it('setGlobalRule stores and retrieves global rule', () => {
    const pm = PolicyManager.getInstance();
    pm.setGlobalRule('no-eval', 'enforce');
    const resolved = pm.resolve('no-eval', '/src/app.ts');
    expect(resolved.scope).toBe('global');
    expect(resolved.action).toBe('enforce');
  });

  it('global rule overrides workspace and module rules', () => {
    const pm = PolicyManager.getInstance();
    pm.setModuleRule('/src/app.ts', 'rule-1', 'suppress');
    pm.setWorkspaceRule('rule-1', 'warn');
    pm.setGlobalRule('rule-1', 'enforce');
    const resolved = pm.resolve('rule-1', '/src/app.ts');
    expect(resolved.scope).toBe('global');
    expect(resolved.action).toBe('enforce');
  });

  it('workspace rule overrides module rule when no global exists', () => {
    const pm = PolicyManager.getInstance();
    pm.setModuleRule('/src/utils.ts', 'rule-2', 'suppress');
    pm.setWorkspaceRule('rule-2', 'warn');
    const resolved = pm.resolve('rule-2', '/src/utils.ts');
    expect(resolved.scope).toBe('workspace');
    expect(resolved.action).toBe('warn');
  });

  it('onGlobalUpdate invalidates effective cache', () => {
    const pm = PolicyManager.getInstance();
    pm.setModuleRule('/src/a.ts', 'rule-x', 'suppress');
    // Prime cache
    pm.getEffective('/src/a.ts');
    // Global update clears cache, next resolve should include global
    pm.setGlobalRule('rule-x', 'enforce');
    const effective = pm.getEffective('/src/a.ts');
    const ruleX = effective.find((r) => r.ruleId === 'rule-x');
    expect(ruleX).toBeDefined();
    expect(ruleX!.scope).toBe('global');
  });
});

// ============================================================
// 7. i18n
// ============================================================

import { L4 } from '../i18n';

describe('L4 i18n helper', () => {
  it('returns Korean text for KO language', () => {
    const result = L4('KO', { ko: '안녕', en: 'Hello' });
    expect(result).toBe('안녕');
  });

  it('returns English text for EN language', () => {
    const result = L4('EN', { ko: '안녕', en: 'Hello' });
    expect(result).toBe('Hello');
  });
});
