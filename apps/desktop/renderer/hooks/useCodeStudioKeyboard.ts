// ============================================================
// Code Studio — Keyboard Shortcuts Hook
// Full IDE shortcuts, macOS support, user-customizable bindings,
// conflict detection, and modal awareness.
// ============================================================

// ============================================================
// PART 1 — Types & Interfaces
// ============================================================

import { useEffect, useRef, useCallback, useMemo } from 'react';

/** Category for grouping shortcuts in the UI */
export type ShortcutCategory =
  | 'Editor'
  | 'Navigation'
  | 'Panel'
  | 'Git'
  | 'Terminal'
  | 'AI'
  | 'General';

export interface ShortcutBinding {
  /** Unique command ID, e.g. "editor.save" */
  id: string;
  /** Display key combo, e.g. "ctrl+s" or "cmd+s" */
  keys: string;
  handler: (e: KeyboardEvent) => void;
  /** Disabled when a modal/dialog is open */
  disableInModal?: boolean;
  /** Human-readable description */
  description?: string;
  /** Category for grouping in keybindings panel */
  category?: ShortcutCategory;
  /** When true, fires even in input/textarea without modifier keys */
  global?: boolean;
}

/** Stored user override: maps command ID to custom key combo */
export interface UserKeybinding {
  id: string;
  keys: string;
}

/** Conflict report entry */
export interface KeyConflict {
  keys: string;
  bindingIds: string[];
}

interface UseCodeStudioKeyboardOptions {
  /** When true, all shortcuts are suppressed */
  modalOpen?: boolean;
  /** Initial set of bindings */
  bindings?: ShortcutBinding[];
  /** User-customized key overrides loaded from store */
  userOverrides?: UserKeybinding[];
}

interface UseCodeStudioKeyboardReturn {
  register: (binding: ShortcutBinding) => void;
  unregister: (keys: string) => void;
  unregisterById: (id: string) => void;
  /** Temporarily suppress all shortcuts */
  suppress: (suppressed: boolean) => void;
  /** All registered bindings */
  getBindings: () => ShortcutBinding[];
  /** Detect conflicting key combos */
  detectConflicts: () => KeyConflict[];
  /** Re-bind a command to a new key combo; returns conflict info if any */
  rebind: (id: string, newKeys: string) => KeyConflict | null;
  /** Get all current user overrides for persistence */
  getUserOverrides: () => UserKeybinding[];
}

// ============================================================
// PART 2 — Platform Detection & Key Parser
// ============================================================

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

interface ParsedCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

/** Normalize a key combo string into modifier flags + key */
function parseCombo(keys: string): ParsedCombo {
  const parts = keys.toLowerCase().split('+').map((p) => p.trim());
  return {
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    key: parts.filter(
      (p) =>
        ![
          'ctrl', 'control', 'shift', 'alt', 'option',
          'meta', 'cmd', 'command',
        ].includes(p),
    )[0] ?? '',
  };
}

/**
 * Convert a platform-agnostic combo like "mod+s" to the native form.
 * "mod" maps to Cmd on macOS, Ctrl elsewhere.
 */
function normalizePlatformKeys(keys: string): string {
  return keys
    .toLowerCase()
    .replace(/\bmod\b/g, IS_MAC ? 'cmd' : 'ctrl');
}

/** Named key aliases for matching KeyboardEvent.key */
const KEY_ALIASES: Record<string, string> = {
  '`': '`',
  backquote: '`',
  backtick: '`',
  space: ' ',
  enter: 'enter',
  return: 'enter',
  escape: 'escape',
  esc: 'escape',
  tab: 'tab',
  backspace: 'backspace',
  delete: 'delete',
  del: 'delete',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  arrowup: 'arrowup',
  arrowdown: 'arrowdown',
  arrowleft: 'arrowleft',
  arrowright: 'arrowright',
  ',': ',',
  '.': '.',
  '/': '/',
  '\\': '\\',
  ';': ';',
  "'": "'",
  '[': '[',
  ']': ']',
  '-': '-',
  '=': '=',
};

function matchesCombo(e: KeyboardEvent, combo: ParsedCombo): boolean {
  // On macOS: "ctrl" in combo maps to metaKey (Cmd), on other OS to ctrlKey.
  // "meta" in combo explicitly targets metaKey on all platforms.
  const ctrlMatch = IS_MAC
    ? combo.ctrl ? e.metaKey : !e.metaKey || combo.meta
    : combo.ctrl ? e.ctrlKey : !e.ctrlKey;

  if (!ctrlMatch) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;

  // Meta key check (only on non-Mac when explicitly requested)
  if (!IS_MAC && combo.meta !== e.metaKey) return false;

  const eventKey = e.key.toLowerCase();
  const comboKey = combo.key.toLowerCase();

  if (comboKey === '') return false;

  // Function keys (f1..f12)
  if (/^f\d{1,2}$/.test(comboKey)) {
    return eventKey === comboKey;
  }

  // Resolve aliases
  const normalizedCombo = KEY_ALIASES[comboKey] ?? comboKey;
  const normalizedEvent = KEY_ALIASES[eventKey] ?? eventKey;

  if (normalizedEvent === normalizedCombo) return true;

  // Fallback: match by e.code (useful for symbols that shift-modify)
  const codeKey = e.code.toLowerCase();
  if (codeKey === `key${comboKey}`) return true;
  if (codeKey === `digit${comboKey}`) return true;
  if (comboKey === '`' && codeKey === 'backquote') return true;
  if (comboKey === ',' && codeKey === 'comma') return true;
  if (comboKey === '.' && codeKey === 'period') return true;
  if (comboKey === '/' && codeKey === 'slash') return true;
  if (comboKey === ';' && codeKey === 'semicolon') return true;
  if (comboKey === '-' && codeKey === 'minus') return true;
  if (comboKey === '=' && codeKey === 'equal') return true;
  if (comboKey === '[' && codeKey === 'bracketleft') return true;
  if (comboKey === ']' && codeKey === 'bracketright') return true;
  if (comboKey === 'tab' && codeKey === 'tab') return true;

  return false;
}

/** Convert a KeyboardEvent into a normalized combo string (for rebind capture) */
export function eventToComboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (IS_MAC) {
    if (e.metaKey) parts.push('cmd');
  } else {
    if (e.ctrlKey) parts.push('ctrl');
  }
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  if (!IS_MAC && e.metaKey) parts.push('meta');

  const key = e.key.toLowerCase();
  // Skip lone modifier keys
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';

  parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
}

/** Human-readable display of a key combo */
export function formatCombo(keys: string): string {
  if (IS_MAC) {
    return keys
      .replace(/\bctrl\b/gi, '\u2318')
      .replace(/\bcmd\b/gi, '\u2318')
      .replace(/\bcommand\b/gi, '\u2318')
      .replace(/\bshift\b/gi, '\u21E7')
      .replace(/\balt\b/gi, '\u2325')
      .replace(/\boption\b/gi, '\u2325')
      .replace(/\bmeta\b/gi, '\u2318')
      .replace(/\+/g, '');
  }
  return keys
    .replace(/\bcmd\b/gi, 'Ctrl')
    .replace(/\bcommand\b/gi, 'Ctrl')
    .split('+')
    .map((p) => p.trim().charAt(0).toUpperCase() + p.trim().slice(1))
    .join('+');
}

// ============================================================
// PART 3 — Default IDE Shortcuts
// ============================================================

/** No-op placeholder handler; real handlers are injected by consuming components */
const NOOP = () => {};

export const DEFAULT_SHORTCUTS: Omit<ShortcutBinding, 'handler'>[] = [
  // ── Editor ─────────────────────────────────────────────
  { id: 'editor.save', keys: 'ctrl+s', description: 'Save file', category: 'Editor', disableInModal: true },
  { id: 'editor.undo', keys: 'ctrl+z', description: 'Undo', category: 'Editor', disableInModal: true },
  { id: 'editor.redo', keys: 'ctrl+y', description: 'Redo', category: 'Editor', disableInModal: true },
  { id: 'editor.redoAlt', keys: 'ctrl+shift+z', description: 'Redo (alt)', category: 'Editor', disableInModal: true },
  { id: 'editor.find', keys: 'ctrl+f', description: 'Find in file', category: 'Editor', disableInModal: true },
  { id: 'editor.replace', keys: 'ctrl+h', description: 'Find and replace', category: 'Editor', disableInModal: true },
  { id: 'editor.toggleComment', keys: 'ctrl+/', description: 'Toggle comment', category: 'Editor', disableInModal: true },
  { id: 'editor.selectNextOccurrence', keys: 'ctrl+d', description: 'Select next occurrence', category: 'Editor', disableInModal: true },
  { id: 'editor.selectAllOccurrences', keys: 'ctrl+shift+l', description: 'Select all occurrences', category: 'Editor', disableInModal: true },
  { id: 'editor.deleteLine', keys: 'ctrl+shift+k', description: 'Delete line', category: 'Editor', disableInModal: true },
  { id: 'editor.moveLineUp', keys: 'alt+up', description: 'Move line up', category: 'Editor', disableInModal: true },
  { id: 'editor.moveLineDown', keys: 'alt+down', description: 'Move line down', category: 'Editor', disableInModal: true },
  { id: 'editor.duplicateLine', keys: 'shift+alt+down', description: 'Duplicate line', category: 'Editor', disableInModal: true },
  { id: 'editor.goToLine', keys: 'ctrl+g', description: 'Go to line', category: 'Editor', disableInModal: true },
  { id: 'editor.format', keys: 'shift+alt+f', description: 'Format document', category: 'Editor', disableInModal: true },
  { id: 'editor.rename', keys: 'f2', description: 'Rename symbol', category: 'Editor', disableInModal: true },
  { id: 'editor.indentLine', keys: 'ctrl+]', description: 'Indent line', category: 'Editor', disableInModal: true },
  { id: 'editor.outdentLine', keys: 'ctrl+[', description: 'Outdent line', category: 'Editor', disableInModal: true },

  // ── Navigation ─────────────────────────────────────────
  { id: 'nav.quickOpen', keys: 'ctrl+p', description: 'Quick open file', category: 'Navigation', disableInModal: true },
  { id: 'nav.commandPalette', keys: 'ctrl+shift+p', description: 'Command palette', category: 'Navigation' },
  { id: 'nav.commandPaletteAlt', keys: 'f1', description: 'Command palette (F1)', category: 'Navigation' },
  { id: 'nav.nextTab', keys: 'ctrl+tab', description: 'Next tab', category: 'Navigation', disableInModal: true },
  { id: 'nav.prevTab', keys: 'ctrl+shift+tab', description: 'Previous tab', category: 'Navigation', disableInModal: true },
  { id: 'nav.closeTab', keys: 'ctrl+w', description: 'Close tab', category: 'Navigation', disableInModal: true },
  { id: 'nav.settings', keys: 'ctrl+,', description: 'Open settings', category: 'Navigation' },
  { id: 'nav.newFile', keys: 'ctrl+n', description: 'New file', category: 'Navigation', disableInModal: true },

  // ── Panel ──────────────────────────────────────────────
  { id: 'panel.toggleSidebar', keys: 'ctrl+b', description: 'Toggle sidebar', category: 'Panel' },
  { id: 'panel.toggleTerminal', keys: 'ctrl+`', description: 'Toggle terminal', category: 'Panel' },
  { id: 'panel.globalSearch', keys: 'ctrl+shift+f', description: 'Global search', category: 'Panel' },
  { id: 'panel.fullscreen', keys: 'f11', description: 'Toggle fullscreen', category: 'Panel' },
  { id: 'panel.zoomIn', keys: 'ctrl+=', description: 'Zoom in', category: 'Panel', disableInModal: true },
  { id: 'panel.zoomOut', keys: 'ctrl+-', description: 'Zoom out', category: 'Panel', disableInModal: true },

  // ── Git ────────────────────────────────────────────────
  { id: 'git.commit', keys: 'ctrl+shift+g', description: 'Open Git panel', category: 'Git' },

  // ── Terminal ───────────────────────────────────────────
  { id: 'terminal.new', keys: 'ctrl+shift+`', description: 'New terminal', category: 'Terminal' },
  { id: 'terminal.clear', keys: 'ctrl+shift+c', description: 'Clear terminal', category: 'Terminal', disableInModal: true },

  // ── AI ─────────────────────────────────────────────────
  { id: 'ai.chat', keys: 'ctrl+l', description: 'Open AI chat', category: 'AI' },
  { id: 'ai.inlineEdit', keys: 'ctrl+k', description: 'Inline AI edit', category: 'AI', disableInModal: true },
  { id: 'ai.agent', keys: 'ctrl+i', description: 'AI Agent', category: 'AI' },
  { id: 'ai.pipeline', keys: 'ctrl+shift+enter', description: 'Run pipeline', category: 'AI', disableInModal: true },

  // ── General ────────────────────────────────────────────
  { id: 'general.run', keys: 'f5', description: 'Run / Execute', category: 'General' },
  { id: 'general.help', keys: 'ctrl+shift+/', description: 'Show help', category: 'General' },
];

// ============================================================
// PART 4 — Hook Implementation
// ============================================================

/**
 * Dynamic keyboard shortcut manager for Code Studio.
 * Supports modal-awareness, suppress mode, runtime register/unregister,
 * user-customizable bindings, macOS Cmd mapping, and conflict detection.
 */
export function useCodeStudioKeyboard(
  options: UseCodeStudioKeyboardOptions = {},
): UseCodeStudioKeyboardReturn {
  const { modalOpen = false, bindings: initialBindings = [], userOverrides = [] } = options;
  const bindingsRef = useRef<Map<string, ShortcutBinding>>(new Map());
  const overridesRef = useRef<Map<string, string>>(new Map());
  const suppressedRef = useRef(false);
  const modalRef = useRef(modalOpen);

  useEffect(() => {
    modalRef.current = modalOpen;
  }, [modalOpen]);

  // Initialize user overrides
  useEffect(() => {
    overridesRef.current.clear();
    for (const ov of userOverrides) {
      overridesRef.current.set(ov.id, normalizePlatformKeys(ov.keys));
    }
  }, [userOverrides]);

  // Initialize default + provided bindings
  useEffect(() => {
    for (const b of initialBindings) {
      const normalized = normalizePlatformKeys(b.keys);
      const overriddenKeys = (b.id != null && overridesRef.current.has(b.id))
        ? overridesRef.current.get(b.id)!
        : normalized;
      bindingsRef.current.set(b.id ?? overriddenKeys, { ...b, keys: overriddenKeys });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const register = useCallback((binding: ShortcutBinding) => {
    const normalized = normalizePlatformKeys(binding.keys);
    const overriddenKeys = (binding.id != null && overridesRef.current.has(binding.id))
      ? overridesRef.current.get(binding.id)!
      : normalized;
    const key = binding.id ?? overriddenKeys;
    bindingsRef.current.set(key, { ...binding, keys: overriddenKeys });
  }, []);

  const unregister = useCallback((keys: string) => {
    const normalized = normalizePlatformKeys(keys);
    bindingsRef.current.delete(normalized);
    // Also try by literal key
    bindingsRef.current.delete(keys.toLowerCase());
  }, []);

  const unregisterById = useCallback((id: string) => {
    bindingsRef.current.delete(id);
  }, []);

  const suppress = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed;
  }, []);

  const getBindings = useCallback((): ShortcutBinding[] => {
    return Array.from(bindingsRef.current.values());
  }, []);

  const detectConflicts = useCallback((): KeyConflict[] => {
    const keyMap = new Map<string, string[]>();
    for (const [, binding] of bindingsRef.current) {
      const normalized = normalizePlatformKeys(binding.keys);
      const existing = keyMap.get(normalized);
      if (existing != null) {
        existing.push(binding.id ?? binding.keys);
      } else {
        keyMap.set(normalized, [binding.id ?? binding.keys]);
      }
    }
    const conflicts: KeyConflict[] = [];
    for (const [keys, ids] of keyMap) {
      if (ids.length > 1) {
        conflicts.push({ keys, bindingIds: ids });
      }
    }
    return conflicts;
  }, []);

  const rebind = useCallback((id: string, newKeys: string): KeyConflict | null => {
    const normalized = normalizePlatformKeys(newKeys);
    overridesRef.current.set(id, normalized);

    // Update the binding in the map
    const existing = bindingsRef.current.get(id);
    if (existing != null) {
      bindingsRef.current.set(id, { ...existing, keys: normalized });
    }

    // Check for conflict
    const conflicting: string[] = [];
    for (const [, binding] of bindingsRef.current) {
      const bKey = normalizePlatformKeys(binding.keys);
      if (bKey === normalized && (binding.id ?? binding.keys) !== id) {
        conflicting.push(binding.id ?? binding.keys);
      }
    }

    if (conflicting.length > 0) {
      return { keys: normalized, bindingIds: [id, ...conflicting] };
    }
    return null;
  }, []);

  const getUserOverrides = useCallback((): UserKeybinding[] => {
    const result: UserKeybinding[] = [];
    for (const [id, keys] of overridesRef.current) {
      result.push({ id, keys });
    }
    return result;
  }, []);

  // ── Event Listener ─────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suppressedRef.current) return;

      // Skip when typing in input/textarea unless it has modifiers or is global
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const [, binding] of bindingsRef.current) {
        // Modal guard
        if (binding.disableInModal !== false && modalRef.current) continue;

        const combo = parseCombo(normalizePlatformKeys(binding.keys));

        if (matchesCombo(e, combo)) {
          // Allow input-focused shortcuts only for combos with modifiers or global
          if (
            isInputFocused &&
            !binding.global &&
            !combo.ctrl &&
            !combo.alt &&
            !combo.meta
          ) {
            continue;
          }

          e.preventDefault();
          e.stopPropagation();
          binding.handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return {
    register,
    unregister,
    unregisterById,
    suppress,
    getBindings,
    detectConflicts,
    rebind,
    getUserOverrides,
  };
}
