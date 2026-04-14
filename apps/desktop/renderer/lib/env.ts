// ============================================================
// PART 1 — Environment Variable Validation
// ============================================================

import { logger } from '@/lib/logger';

/**
 * Validates required environment variables at module load time.
 * Import this module early (e.g., in layout or middleware) to get
 * clear error messages for missing configuration.
 */

interface EnvVarDef {
  key: string;
  required: boolean;
  /** true = NEXT_PUBLIC_ prefix expected (client-side available) */
  isPublic: boolean;
}

const ENV_VARS: EnvVarDef[] = [
  // Firebase (public — embedded in client bundle)
  { key: 'NEXT_PUBLIC_FIREBASE_ENV', required: false, isPublic: true },
  { key: 'NEXT_PUBLIC_FIREBASE_TEST_API_KEY', required: false, isPublic: true },
  { key: 'NEXT_PUBLIC_FIREBASE_TEST_AUTH_DOMAIN', required: false, isPublic: true },
  { key: 'NEXT_PUBLIC_FIREBASE_TEST_PROJECT_ID', required: false, isPublic: true },
  { key: 'NEXT_PUBLIC_FIREBASE_TEST_STORAGE_BUCKET', required: false, isPublic: true },
  { key: 'NEXT_PUBLIC_FIREBASE_TEST_MESSAGING_SENDER_ID', required: false, isPublic: true },
  { key: 'NEXT_PUBLIC_FIREBASE_TEST_APP_ID', required: false, isPublic: true },
];

// IDENTITY_SEAL: PART-1 | role=env validation | inputs=process.env | outputs=warnings to console

// ============================================================
// PART 2 — Validation Runner
// ============================================================

export function validateEnv(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const value = typeof process !== 'undefined' ? process.env[v.key] : undefined;
    if (v.required && !value) {
      warnings.push(`[env] MISSING REQUIRED: ${v.key}`);
    }
  }

  // Log warnings at startup (server-side only)
  if (typeof window === 'undefined' && warnings.length > 0) {
    for (const w of warnings) {
      logger.warn('env', w);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/** Call once at app startup */
export const envResult = validateEnv();

// IDENTITY_SEAL: PART-2 | role=validation execution | inputs=ENV_VARS | outputs=envResult
