import {
  PROVIDERS,
  PROVIDER_LIST,
  isPreviewModel,
  getModelWarning,
  setApiKey,
  getApiKey,
  getApiKeyAsync,
  normalizeProviderId,
  getActiveProvider,
  setActiveProvider,
  migrateProviderStorage,
} from '../ai-providers';

describe('normalizeProviderId', () => {
  it('maps CLI/legacy aliases to canonical ids', () => {
    expect(normalizeProviderId('anthropic')).toBe('claude');
    expect(normalizeProviderId('google')).toBe('gemini');
    expect(normalizeProviderId('lm-studio')).toBe('lmstudio');
  });

  it('passes through official ids', () => {
    expect(normalizeProviderId('gemini')).toBe('gemini');
    expect(normalizeProviderId('claude')).toBe('claude');
  });

  it('falls back to gemini for garbage', () => {
    expect(normalizeProviderId('not-a-provider')).toBe('gemini');
    expect(normalizeProviderId(null)).toBe('gemini');
    expect(normalizeProviderId('')).toBe('gemini');
  });
});

describe('getActiveProvider + storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rewrites anthropic in localStorage to claude', () => {
    localStorage.setItem('noa_active_provider', 'anthropic');
    expect(getActiveProvider()).toBe('claude');
    expect(localStorage.getItem('noa_active_provider')).toBe('claude');
  });

  it('setActiveProvider rejects unknown id via normalization', () => {
    setActiveProvider('anthropic' as unknown as Parameters<typeof setActiveProvider>[0]);
    expect(localStorage.getItem('noa_active_provider')).toBe('claude');
  });

  it('migrateProviderStorage rewrites alias in noa_active_provider', () => {
    localStorage.setItem('noa_active_provider', 'google');
    migrateProviderStorage();
    expect(localStorage.getItem('noa_active_provider')).toBe('gemini');
  });
});

describe('PROVIDERS', () => {
  it('has 7 providers (cloud + local)', () => {
    expect(PROVIDER_LIST).toHaveLength(7);
  });

  it('each provider has required fields', () => {
    PROVIDER_LIST.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.color).toMatch(/^#/);
      expect(p.defaultModel).toBeTruthy();
      expect(p.models.length).toBeGreaterThan(0);
      expect(p.storageKey).toBeTruthy();
    });
  });

  it('gemini is default recommended', () => {
    expect(PROVIDERS.gemini.defaultModel).toBe('gemini-2.5-pro');
  });

  it('all providers have unique storage keys', () => {
    const keys = PROVIDER_LIST.map(p => p.storageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isPreviewModel', () => {
  it('detects preview models', () => {
    expect(isPreviewModel('gemini-3.1-pro-preview')).toBe(true);
    expect(isPreviewModel('gpt-5.4-nano')).toBe(true);
    expect(isPreviewModel('some-experimental-model')).toBe(true);
  });

  it('stable models are not preview', () => {
    expect(isPreviewModel('gemini-2.5-pro')).toBe(false);
    expect(isPreviewModel('gpt-5.4')).toBe(false);
    expect(isPreviewModel('claude-sonnet-4-20250514')).toBe(false);
  });
});

describe('getModelWarning', () => {
  it('returns null for stable models', () => {
    expect(getModelWarning('gemini-2.5-pro')).toBeNull();
  });

  it('returns warning for preview models (KO)', () => {
    const warning = getModelWarning('gemini-3.1-pro-preview', 'ko');
    expect(warning).toContain('프리뷰');
  });

  it('returns warning for preview models (EN)', () => {
    const warning = getModelWarning('gemini-3.1-pro-preview', 'en');
    expect(warning).toContain('preview');
  });
});

describe('API key obfuscation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves keys correctly', () => {
    setApiKey('gemini', 'AIzaSyTest123');
    expect(getApiKey('gemini')).toBe('AIzaSyTest123');
  });

  it('does not store key in plaintext', () => {
    setApiKey('openai', 'sk-test-abc');
    const raw = localStorage.getItem('noa_openai_key');
    expect(raw).not.toBe('sk-test-abc');
    expect(raw).toMatch(/^noa:\d+:/); // obfuscation prefix (any version)
  });

  it('handles empty key', () => {
    setApiKey('claude', '');
    expect(getApiKey('claude')).toBe('');
  });

  it('reads legacy plaintext keys (backward compat)', () => {
    localStorage.setItem('noa_api_key', 'AIzaPlaintext');
    expect(getApiKey('gemini')).toBe('AIzaPlaintext');
  });

  it('handles unicode in key values', () => {
    setApiKey('groq', 'gsk_테스트키');
    expect(getApiKey('groq')).toBe('gsk_테스트키');
  });
});

describe('v4 key hydration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getApiKeyAsync returns value for v3 format (set via setApiKey)', async () => {
    setApiKey('gemini', 'AIzaSyAsyncTest456');
    const result = await getApiKeyAsync('gemini');
    expect(result).toBe('AIzaSyAsyncTest456');
  });

  it('getApiKeyAsync returns empty string for missing key', async () => {
    const result = await getApiKeyAsync('openai');
    expect(result).toBe('');
  });

  it('getApiKeyAsync result matches sync getApiKey for v3 keys', async () => {
    setApiKey('claude', 'sk-ant-test-789');
    const syncResult = getApiKey('claude');
    const asyncResult = await getApiKeyAsync('claude');
    expect(asyncResult).toBe(syncResult);
  });
});
