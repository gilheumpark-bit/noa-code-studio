// ============================================================
// useAIProvider — Hook bridge for ai-providers lib
// ============================================================
// Components should import from this hook instead of directly
// from '@/lib/ai-providers' to maintain the layer boundary:
//   components/ -> hooks/ -> lib/
// ============================================================

import {
  // Types
  ProviderId,
  ChatMsg,
  StreamOptions,
  ProviderDef,
  ProviderCapabilities,

  // Constants
  PROVIDERS,
  PROVIDER_LIST_UI,

  // Active provider/model getters & setters
  getActiveProvider,
  setActiveProvider,
  getActiveModel,
  setActiveModel,

  // API key management
  getApiKey,
  getApiKeyAsync,
  setApiKey,
  setApiKeyAsync,
  hydrateAllApiKeys,
  testApiKey,
  getKeyAge,
  isKeyExpiringSoon,
  hasStoredApiKey,
  migrateProviderStorage,

  // Model utilities
  isPreviewModel,
  getModelWarning,
  getPreferredModel,

  // Capability checks
  activeSupportsStructured,
  supportsStructuredOutput,
  getCapabilities,

  // Key operations
  encryptKey,
  decryptKey,

  // Streaming
  streamChat,
} from '@/lib/ai-providers';

/**
 * Named exports for utility functions (can be used outside components)
 */
export {
  PROVIDERS,
  PROVIDER_LIST_UI,
  getActiveProvider,
  setActiveProvider,
  getActiveModel,
  setActiveModel,
  getApiKey,
  getApiKeyAsync,
  setApiKey,
  setApiKeyAsync,
  hydrateAllApiKeys,
  testApiKey,
  getKeyAge,
  isKeyExpiringSoon,
  hasStoredApiKey,
  migrateProviderStorage,
  isPreviewModel,
  getModelWarning,
  getPreferredModel,
  activeSupportsStructured,
  supportsStructuredOutput,
  getCapabilities,
  encryptKey,
  decryptKey,
  streamChat,
};

/**
 * useAIProvider hook
 * Provides a standardized interface for AI provider operations.
 * This maintains a clean architectural boundary between UI and Lib.
 */
export const useAIProvider = () => {
  return {
    // Constants
    PROVIDERS,
    PROVIDER_LIST_UI,

    // Active provider/model
    getActiveProvider,
    setActiveProvider,
    getActiveModel,
    setActiveModel,

    // API key management
    getApiKey,
    getApiKeyAsync,
    setApiKey,
    setApiKeyAsync,
    hydrateAllApiKeys,
    testApiKey,
    getKeyAge,
    isKeyExpiringSoon,
    hasStoredApiKey,
    migrateProviderStorage,

    // Model utilities
    isPreviewModel,
    getModelWarning,
    getPreferredModel,

    // Capability checks
    activeSupportsStructured,
    supportsStructuredOutput,
    getCapabilities,

    // Key operations
    encryptKey,
    decryptKey,

    // Streaming
    streamChat,
  };
};

// Re-export types for convenience
export type { ProviderId, ChatMsg, StreamOptions, ProviderDef, ProviderCapabilities };

// IDENTITY_SEAL: PART-3 | role=hook-bridge-final | inputs=@/lib/ai-providers | outputs=hook + named exports
