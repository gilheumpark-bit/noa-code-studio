/** Studio / API error classification for UI retry flows */

export const StudioErrorCode = {
  KEY_MISSING: "KEY_MISSING",
  KEY_INVALID: "KEY_INVALID",
} as const;

export function classifyAsStudioError(e: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  return { code: "UNKNOWN", message: String(e), retryable: false };
}
