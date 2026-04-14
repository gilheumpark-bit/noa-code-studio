// ============================================================
// AI Providers — Key Management (4-Layer Encryption)
// ============================================================
// Handles API key storage, encryption, decryption, and provider selection.
// Supports 4 encryption layers: v1 (Base64), v2 (XOR), v3 (Salt+XOR), v4 (AES-GCM).

import { PROVIDERS, normalizeProviderId, type ProviderId, supportsStructuredOutput } from './types';

// Re-export for downstream consumers that import key helpers
export { normalizeProviderId } from './types';

// ============================================================
// PART 1 — Encryption Constants & Crypto Helpers
// ============================================================

const _ENCRYPTION_PREFIX_V4 = 'noa:4:';
const _OBFUSCATION_PREFIX_V3 = 'noa:3:';
const _OBFUSCATION_PREFIX = 'noa:2:';
const _LEGACY_PREFIX = 'noa:1:';
const _SALT_LENGTH = 16;
const _IV_LENGTH = 12; // AES-GCM recommended IV size

// #20: Encapsulate CryptoKey cache in closure to prevent module-global exposure
const keyStore = (() => {
  let _key: CryptoKey | null = null;
  return {
    get: () => _key,
    set: (k: CryptoKey) => { _key = k; },
    clear: () => { _key = null; },
  };
})();

function _isSubtleCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.deriveKey === 'function'
  );
}

async function _deriveAesKey(): Promise<CryptoKey> {
  const cached = keyStore.get();
  if (cached) return cached;
  const encoder = new TextEncoder();
  const salt = encoder.encode(
    (typeof window !== 'undefined' ? window.location.origin : 'noa-server') +
    (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : ''),
  );
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode('eh-universe-key-v2'),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const derived = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyStore.set(derived);
  return derived;
}

// IDENTITY_SEAL: PART-1 | role=crypto-primitives | inputs=none | outputs=CryptoKey

// ============================================================
// PART 2 — V4 AES-GCM Encryption / Decryption
// ============================================================

async function _encryptAesGcm(plain: string): Promise<string> {
  const key = await _deriveAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(_IV_LENGTH));
  const encoded = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return _ENCRYPTION_PREFIX_V4 + btoa(String.fromCharCode(...combined));
}

async function _decryptAesGcm(stored: string): Promise<string> {
  const key = await _deriveAesKey();
  const raw = atob(stored.slice(_ENCRYPTION_PREFIX_V4.length));
  const allBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) allBytes[i] = raw.charCodeAt(i);
  const iv = allBytes.slice(0, _IV_LENGTH);
  const ciphertext = allBytes.slice(_IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

// IDENTITY_SEAL: PART-2 | role=v4-aes-gcm | inputs=plaintext | outputs=ciphertext

// ============================================================
// PART 3 — Legacy XOR Helpers (v1/v2/v3 — read-only)
// ============================================================

function _xorMask(): number[] {
  const seed = typeof window !== 'undefined'
    ? `${window.location.origin}:${navigator.userAgent.slice(0, 32)}`
    : 'noa-server-fallback';
  const mask: number[] = [];
  for (let i = 0; i < seed.length; i++) mask.push(seed.charCodeAt(i) & 0xff);
  return mask;
}

function _generateSalt(): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint8Array(_SALT_LENGTH));
  }
  const salt = new Uint8Array(_SALT_LENGTH);
  for (let i = 0; i < _SALT_LENGTH; i++) salt[i] = Math.floor(Math.random() * 256);
  return salt;
}

/** Synchronous v3 fallback (Salt + XOR) — used when SubtleCrypto unavailable */
function _obfuscateKeySync(plain: string): string {
  if (!plain) return '';
  try {
    const baseMask = _xorMask();
    const salt = _generateSalt();
    const combinedMask = baseMask.map((b, i) => b ^ salt[i % salt.length]);
    const bytes = new TextEncoder().encode(plain);
    const xored = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) xored[i] = bytes[i] ^ combinedMask[i % combinedMask.length];
    const combined = new Uint8Array(salt.length + xored.length);
    combined.set(salt, 0);
    combined.set(xored, salt.length);
    return _OBFUSCATION_PREFIX_V3 + btoa(String.fromCharCode(...combined));
  } catch {
    return plain;
  }
}

/** Synchronous decrypt for legacy formats (v1/v2/v3/plaintext) */
function deobfuscateKeySync(stored: string): string {
  if (!stored) return '';
  // v3: Salt + XOR + Base64
  if (stored.startsWith(_OBFUSCATION_PREFIX_V3)) {
    try {
      const baseMask = _xorMask();
      const raw = atob(stored.slice(_OBFUSCATION_PREFIX_V3.length));
      const allBytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) allBytes[i] = raw.charCodeAt(i);
      const salt = allBytes.slice(0, _SALT_LENGTH);
      const xored = allBytes.slice(_SALT_LENGTH);
      const combinedMask = baseMask.map((b, i) => b ^ salt[i % salt.length]);
      const bytes = new Uint8Array(xored.length);
      for (let i = 0; i < xored.length; i++) bytes[i] = xored[i] ^ combinedMask[i % combinedMask.length];
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  }
  // v2: XOR + Base64
  if (stored.startsWith(_OBFUSCATION_PREFIX)) {
    try {
      const mask = _xorMask();
      const raw = atob(stored.slice(_OBFUSCATION_PREFIX.length));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) ^ mask[i % mask.length];
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  }
  // v1: Base64 only
  if (stored.startsWith(_LEGACY_PREFIX)) {
    try {
      return decodeURIComponent(escape(atob(stored.slice(_LEGACY_PREFIX.length))));
    } catch {
      return '';
    }
  }
  // Plaintext
  return stored;
}

// IDENTITY_SEAL: PART-3 | role=legacy-xor | inputs=stored-string | outputs=plaintext

// ============================================================
// PART 4 — Unified Encrypt/Decrypt API
// ============================================================

/** Encrypt: AES-GCM preferred, v3 XOR fallback */
export async function encryptKey(plain: string): Promise<string> {
  if (!plain) return '';
  if (_isSubtleCryptoAvailable()) {
    try {
      return await _encryptAesGcm(plain);
    } catch {
      // SubtleCrypto failed (e.g. insecure context) — fall back to v3
    }
  }
  return _obfuscateKeySync(plain);
}

/** Decrypt: detects version prefix and dispatches accordingly */
export async function decryptKey(stored: string): Promise<string> {
  if (!stored) return '';
  if (stored.startsWith(_ENCRYPTION_PREFIX_V4)) {
    try {
      return await _decryptAesGcm(stored);
    } catch {
      return '';
    }
  }
  return deobfuscateKeySync(stored);
}

// IDENTITY_SEAL: PART-4 | role=unified-crypto | inputs=plaintext|ciphertext | outputs=ciphertext|plaintext

// ============================================================
// PART 5 — Provider Selection & Storage Migration
// ============================================================

const LEGACY_PROVIDER_KEY = "eh-active-provider";
const LEGACY_MODEL_KEY = "eh-active-model";

/**
 * Migrate legacy provider storage keys to the current format.
 * Call once at app init — NOT inside getters.
 */
export function migrateProviderStorage(): void {
  if (typeof window === "undefined") return;
  const legacy = localStorage.getItem(LEGACY_PROVIDER_KEY);
  if (legacy) {
    const resolved = normalizeProviderId(legacy);
    localStorage.setItem("noa_active_provider", resolved);
    localStorage.removeItem(LEGACY_PROVIDER_KEY);
  }
  const main = localStorage.getItem("noa_active_provider");
  if (main != null && main !== "" && normalizeProviderId(main) !== main) {
    localStorage.setItem("noa_active_provider", normalizeProviderId(main));
  }
}

/** @returns Currently active AI provider ID from localStorage, defaults to "gemini" */
export function getActiveProvider(): ProviderId {
  if (typeof window === "undefined") return "gemini";
  const storedMain = localStorage.getItem("noa_active_provider");
  const storedLegacy = localStorage.getItem(LEGACY_PROVIDER_KEY);
  const storedRaw = storedMain ?? storedLegacy;
  let provider = normalizeProviderId(storedRaw);
  if (storedRaw != null && provider !== storedRaw) {
    localStorage.setItem("noa_active_provider", provider);
    localStorage.removeItem(LEGACY_PROVIDER_KEY);
  }
  // 로컬 provider가 활성인데 URL(키)이 비어 있으면 gemini로 폴백
  const def = PROVIDERS[provider];
  if (def && (provider === "ollama" || provider === "lmstudio") && !localStorage.getItem(def.storageKey)) {
    provider = "gemini";
    localStorage.setItem("noa_active_provider", provider);
  }
  return provider;
}

/** Persist the active AI provider selection to localStorage */
export function setActiveProvider(id: ProviderId): void {
  if (typeof window === "undefined") return;
  const resolved = id != null && typeof id === "string" && id in PROVIDERS
    ? (id as ProviderId)
    : normalizeProviderId(String(id));
  localStorage.setItem("noa_active_provider", resolved);
  localStorage.removeItem(LEGACY_PROVIDER_KEY);
}

/** 현재 활성 provider가 structured output을 지원하는지 */
export function activeSupportsStructured(): boolean {
  return supportsStructuredOutput(getActiveProvider());
}

// IDENTITY_SEAL: PART-5 | role=provider-selection | inputs=ProviderId | outputs=ProviderId

// ============================================================
// PART 6 — API Key Storage (sync/async with v4 cache)
// ============================================================

/** In-memory plaintext cache for v4 keys (populated by async operations) */
const _v4PlainCache = new Map<string, string>();

/** localStorage에 값이 있는지(암호문 포함) */
export function hasStoredApiKey(providerId: ProviderId): boolean {
  if (typeof window === "undefined") return false;
  const def = PROVIDERS[providerId];
  if (!def) return false;
  const raw = localStorage.getItem(def.storageKey);
  return typeof raw === "string" && raw.trim().length > 0;
}

export function getApiKey(providerId: ProviderId): string {
  if (typeof window === "undefined") return "";
  const def = PROVIDERS[providerId];
  if (!def) return "";
  const stored = localStorage.getItem(def.storageKey) || "";
  if (stored.startsWith(_ENCRYPTION_PREFIX_V4)) {
    return _v4PlainCache.get(def.storageKey) ?? '';
  }
  return deobfuscateKeySync(stored);
}

export async function getApiKeyAsync(providerId: ProviderId): Promise<string> {
  if (typeof window === "undefined") return "";
  const def = PROVIDERS[providerId];
  if (!def) return "";
  const stored = localStorage.getItem(def.storageKey) || "";
  const plain = await decryptKey(stored);
  if (plain && stored.startsWith(_ENCRYPTION_PREFIX_V4)) {
    _v4PlainCache.set(def.storageKey, plain);
  }
  return plain;
}

export function setApiKey(providerId: ProviderId, key: string): void {
  if (typeof window === "undefined") return;
  const def = PROVIDERS[providerId];
  if (!def) return;
  if (!key) {
    localStorage.removeItem(def.storageKey);
    localStorage.removeItem(`${def.storageKey}_ts`);
  } else {
    localStorage.setItem(def.storageKey, _obfuscateKeySync(key));
    localStorage.setItem(`${def.storageKey}_ts`, String(Date.now()));
  }
  _v4PlainCache.delete(def.storageKey);
  window.dispatchEvent(new Event('noa-keys-changed'));
}

export async function setApiKeyAsync(providerId: ProviderId, key: string): Promise<void> {
  if (typeof window === "undefined") return;
  const def = PROVIDERS[providerId];
  if (!def) return;
  if (!key) {
    localStorage.removeItem(def.storageKey);
    localStorage.removeItem(`${def.storageKey}_ts`);
    _v4PlainCache.delete(def.storageKey);
    window.dispatchEvent(new Event('noa-keys-changed'));
    return;
  }
  const encrypted = await encryptKey(key);
  localStorage.setItem(def.storageKey, encrypted);
  localStorage.setItem(`${def.storageKey}_ts`, String(Date.now()));
  if (encrypted.startsWith(_ENCRYPTION_PREFIX_V4)) {
    _v4PlainCache.set(def.storageKey, key);
  }
  window.dispatchEvent(new Event('noa-keys-changed'));
}

export function getKeyAge(providerId: ProviderId): number | null {
  if (typeof window === 'undefined') return null;
  const def = PROVIDERS[providerId];
  if (!def) return null;
  const ts = localStorage.getItem(`${def.storageKey}_ts`);
  if (!ts) return null;
  const storedAt = parseInt(ts, 10);
  if (isNaN(storedAt)) return null;
  return Math.floor((Date.now() - storedAt) / (1000 * 60 * 60 * 24));
}

export function isKeyExpiringSoon(providerId: ProviderId, thresholdDays = 90): boolean {
  const age = getKeyAge(providerId);
  return age !== null && age > thresholdDays;
}

/**
 * Pre-load v4 AES-GCM keys into memory cache on app start.
 */
export async function hydrateAllApiKeys(): Promise<void> {
  const providers = Object.keys(PROVIDERS) as ProviderId[];
  await Promise.allSettled(providers.map(id => getApiKeyAsync(id)));
}

// IDENTITY_SEAL: PART-6 | role=key-storage | inputs=ProviderId,key | outputs=key,boolean

// ============================================================
// PART 7 — Model Selection
// ============================================================

function getStoredModelForProvider(providerId: ProviderId): string {
  const meta = PROVIDERS[providerId] ?? PROVIDERS.gemini;
  if (typeof window === "undefined") return meta.defaultModel;

  const perProviderKey = `noa_model_${providerId}`;
  const perProvider = localStorage.getItem(perProviderKey);
  if (perProvider && perProvider.length > 0) return perProvider;

  const stored = localStorage.getItem("noa_active_model") || localStorage.getItem(LEGACY_MODEL_KEY);
  const model = stored && (meta.models.includes(stored) || stored.length > 0) ? stored : meta.defaultModel;

  if (providerId === getActiveProvider()) {
    localStorage.setItem(perProviderKey, model);
  }
  localStorage.removeItem(LEGACY_MODEL_KEY);
  return model;
}

/** @returns Stored model name for the currently active provider */
export function getActiveModel(): string {
  return getStoredModelForProvider(getActiveProvider());
}

/** @returns Stored model for a specific provider (not necessarily the active one) */
export function getPreferredModel(providerId: ProviderId): string {
  return getStoredModelForProvider(providerId);
}

/** Persist model selection to both per-provider and global localStorage keys */
export function setActiveModel(model: string): void {
  if (typeof window === "undefined") return;
  const provider = getActiveProvider();
  const meta = PROVIDERS[provider] ?? PROVIDERS.gemini;
  const trimmed = model.trim();
  const value = trimmed || meta.defaultModel;
  localStorage.setItem(`noa_model_${provider}`, value);
  localStorage.setItem("noa_active_model", value);
  localStorage.removeItem(LEGACY_MODEL_KEY);
}

// IDENTITY_SEAL: PART-7 | role=model-selection | inputs=ProviderId,model | outputs=model
