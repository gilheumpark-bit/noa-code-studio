import { logger } from '@/lib/logger';

// ============================================================
// PART 1 — Composer Mode Types & Transition Map
// ============================================================

/**
 * Verification-first Composer state machine.
 *
 * Allowed transitions:
 *   idle       → generating
 *   generating → verifying | error | idle   (idle = user cancel)
 *   verifying  → review | error | idle   (idle = user cancel)
 *   review     → staged | generating | idle
 *   staged     → applied | review
 *   applied    → idle
 *   error      → idle | generating
 */

export type ComposerMode =
  | 'idle'
  | 'generating'
  | 'verifying'
  | 'review'
  | 'staged'
  | 'applied'
  | 'error';

export const ALLOWED_TRANSITIONS: Record<ComposerMode, ComposerMode[]> = {
  idle: ['generating'],
  generating: ['verifying', 'error', 'idle'],
  verifying: ['review', 'error', 'idle'],
  review: ['staged', 'generating', 'idle'],
  staged: ['applied', 'review'],
  applied: ['idle'],
  error: ['idle', 'generating'],
};

// IDENTITY_SEAL: PART-1 | role=type-definitions | inputs=none | outputs=ComposerMode,ALLOWED_TRANSITIONS

// ============================================================
// PART 2 — Transition Guard Functions
// ============================================================

/**
 * Check whether a transition from `from` to `to` is allowed.
 */
export function canTransition(from: ComposerMode, to: ComposerMode): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Create a guarded setter: calling `transitionMode(next)` only applies
 * the transition when the state machine permits it.
 *
 * Returns `true` if the transition succeeded, `false` otherwise.
 */
export function createModeTransition(
  currentMode: ComposerMode,
  setMode: (m: ComposerMode) => void,
) {
  return (nextMode: ComposerMode): boolean => {
    if (!canTransition(currentMode, nextMode)) {
      logger.warn(
        'codeStudio:composer',
        `Invalid transition: ${currentMode} → ${nextMode}`,
      );
      return false;
    }
    setMode(nextMode);
    return true;
  };
}

// IDENTITY_SEAL: PART-2 | role=transition-guards | inputs=ComposerMode | outputs=boolean
