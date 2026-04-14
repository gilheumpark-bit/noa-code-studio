/**
 * Unit tests for src/lib/code-studio-composer-state.ts
 * Covers: canTransition, createModeTransition, all valid/invalid state transitions
 */

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { logger } from '@/lib/logger';
import {
  canTransition,
  createModeTransition,
  ALLOWED_TRANSITIONS,
  type ComposerMode,
} from '../code-studio/core/composer-state';

// ============================================================
// PART 1 — canTransition: Valid Transitions
// ============================================================

describe('ComposerState', () => {
  describe('canTransition — valid transitions', () => {
    test.each([
      ['idle', 'generating'],
      ['generating', 'verifying'],
      ['generating', 'error'],
      ['generating', 'idle'],
      ['verifying', 'review'],
      ['verifying', 'error'],
      ['verifying', 'idle'],
      ['review', 'staged'],
      ['review', 'generating'],
      ['review', 'idle'],
      ['staged', 'applied'],
      ['staged', 'review'],
      ['applied', 'idle'],
      ['error', 'idle'],
      ['error', 'generating'],
    ] as [ComposerMode, ComposerMode][])('%s -> %s should be valid', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  // ============================================================
  // PART 2 — canTransition: Invalid Transitions
  // ============================================================

  describe('canTransition — invalid transitions', () => {
    test.each([
      ['idle', 'review'],
      ['idle', 'staged'],
      ['idle', 'applied'],
      ['idle', 'error'],
      ['idle', 'verifying'],
      ['generating', 'staged'],
      ['generating', 'applied'],
      ['generating', 'review'],
      ['verifying', 'staged'],
      ['verifying', 'applied'],
      ['verifying', 'generating'],
      ['review', 'applied'],
      ['review', 'error'],
      ['review', 'verifying'],
      ['staged', 'idle'],
      ['staged', 'generating'],
      ['staged', 'error'],
      ['staged', 'verifying'],
      ['applied', 'generating'],
      ['applied', 'staged'],
      ['applied', 'error'],
      ['applied', 'review'],
      ['applied', 'verifying'],
      ['error', 'staged'],
      ['error', 'applied'],
      ['error', 'review'],
      ['error', 'verifying'],
    ] as [ComposerMode, ComposerMode][])('%s -> %s should be INVALID', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  // ============================================================
  // PART 3 — canTransition: Self-transitions
  // ============================================================

  describe('canTransition — self-transitions are invalid', () => {
    const allModes: ComposerMode[] = [
      'idle', 'generating', 'verifying', 'review', 'staged', 'applied', 'error',
    ];

    test.each(allModes)('%s -> %s (self) should be INVALID', (mode) => {
      expect(canTransition(mode, mode)).toBe(false);
    });
  });

  // ============================================================
  // PART 4 — ALLOWED_TRANSITIONS completeness
  // ============================================================

  describe('ALLOWED_TRANSITIONS structure', () => {
    const allModes: ComposerMode[] = [
      'idle', 'generating', 'verifying', 'review', 'staged', 'applied', 'error',
    ];

    test('every ComposerMode has an entry', () => {
      for (const mode of allModes) {
        expect(ALLOWED_TRANSITIONS).toHaveProperty(mode);
        expect(Array.isArray(ALLOWED_TRANSITIONS[mode])).toBe(true);
      }
    });

    test('all target modes are valid ComposerMode values', () => {
      for (const mode of allModes) {
        for (const target of ALLOWED_TRANSITIONS[mode]) {
          expect(allModes).toContain(target);
        }
      }
    });
  });

  // ============================================================
  // PART 5 — createModeTransition
  // ============================================================

  describe('createModeTransition', () => {
    test('valid transition calls setMode and returns true', () => {
      let mode: ComposerMode = 'idle';
      const setMode = jest.fn((m: ComposerMode) => { mode = m; });

      const transition = createModeTransition(mode, setMode);
      const result = transition('generating');

      expect(result).toBe(true);
      expect(setMode).toHaveBeenCalledWith('generating');
    });

    test('invalid transition does NOT call setMode and returns false', () => {
      let mode: ComposerMode = 'idle';
      const setMode = jest.fn((m: ComposerMode) => { mode = m; });

      const transition = createModeTransition(mode, setMode);
      const result = transition('review');

      expect(result).toBe(false);
      expect(setMode).not.toHaveBeenCalled();
    });

    test('mode value is unchanged after invalid transition', () => {
      let mode: ComposerMode = 'staged';
      const setMode = jest.fn((m: ComposerMode) => { mode = m; });

      const transition = createModeTransition(mode, setMode);
      transition('idle'); // staged -> idle is invalid

      expect(mode).toBe('staged');
    });

    test('logs a logger.warn on invalid transition', () => {
      jest.mocked(logger.warn).mockClear();
      const transition = createModeTransition('applied', jest.fn());

      transition('generating');

      expect(logger.warn).toHaveBeenCalledWith(
        'codeStudio:composer',
        expect.stringContaining('Invalid transition'),
      );
    });

    test('does NOT warn on valid transition', () => {
      jest.mocked(logger.warn).mockClear();
      const transition = createModeTransition('idle', jest.fn());

      transition('generating');

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('captures currentMode at creation time (closure snapshot)', () => {
      let mode: ComposerMode = 'idle';
      const setMode = jest.fn((m: ComposerMode) => { mode = m; });

      const transition = createModeTransition(mode, setMode);

      // Even if we change mode externally, the closure still uses 'idle'
      mode = 'generating';
      const result = transition('generating'); // idle -> generating is valid
      expect(result).toBe(true);
    });
  });
});
