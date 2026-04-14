"use client";

import { useEffect } from "react";
import {
  migrateProviderStorage,
  getApiKeyAsync,
  PROVIDERS,
  type ProviderId,
} from "@/lib/ai-providers";

/**
 * Warms AES-GCM v4 key cache so synchronous `getApiKey()` works after first paint.
 */
export default function ApiKeyHydrator() {
  useEffect(() => {
    migrateProviderStorage();
    const ids = Object.keys(PROVIDERS) as ProviderId[];
    void Promise.all(ids.map((id) => getApiKeyAsync(id))).catch((err) => console.warn('[ApiKeyHydrator] hydrate:', err));
  }, []);

  return null;
}
