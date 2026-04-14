"use client";

/**
 * apps/desktop/renderer/lib/theme-controller.tsx
 *
 * Single source of truth for theme state (cs:theme + legacy eh-theme read).
 *
 * PART 1 — Types + storage
 * PART 2 — Resolver (auto -> system)
 * PART 3 — Apply (DOM + Monaco)
 * PART 4 — ThemeProvider + useTheme
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ============================================================
// PART 1 — Types + storage
// ============================================================

export type ThemeMode = "dark" | "light" | "auto";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "cs:theme";

function loadStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
    const legacy = window.localStorage.getItem("eh-theme");
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    /* localStorage may be blocked */
  }
  return "dark";
}

function persistMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    try {
      window.localStorage.setItem("eh-theme", mode === "auto" ? resolveTheme(mode) : mode);
    } catch {
      /* ignore */
    }
  } catch {
    /* noop */
  }
}

// ============================================================
// PART 2 — Resolver
// ============================================================

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return getSystemPrefersDark() ? "dark" : "light";
}

// ============================================================
// PART 3 — Apply
// ============================================================

type MonacoLike = {
  editor: { setTheme: (name: string) => void };
};

let monacoRef: MonacoLike | null = null;

/** Called once by ScopeShell after Monaco loads. */
export function registerMonaco(monaco: MonacoLike): void {
  monacoRef = monaco;
  const resolved = resolveTheme(loadStoredMode());
  applyMonaco(resolved);
}

function applyDom(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  // Enable transition only during theme switch, then remove
  document.documentElement.setAttribute("data-theme-transitioning", "");
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  // Remove transition flag after animation completes
  setTimeout(() => document.documentElement.removeAttribute("data-theme-transitioning"), 300);
}

function applyMonaco(theme: ResolvedTheme): void {
  if (!monacoRef) return;
  monacoRef.editor.setTheme(theme === "dark" ? "eh-dark" : "eh-light");
}

export function applyTheme(theme: ResolvedTheme): void {
  applyDom(theme);
  applyMonaco(theme);
}

// ============================================================
// PART 4 — ThemeProvider + useTheme
// ============================================================

export interface UseThemeReturn {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<UseThemeReturn | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => loadStoredMode());
  /** Bumps when OS color scheme changes while mode is `auto` (forces `resolveTheme` to re-read). */
  const [systemSchemeEpoch, setSystemSchemeEpoch] = useState(0);

  useEffect(() => {
    if (mode !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setSystemSchemeEpoch((n) => n + 1);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const resolved = useMemo(() => {
    void systemSchemeEpoch;
    return resolveTheme(mode);
  }, [mode, systemSchemeEpoch]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    persistMode(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      let next: ThemeMode;
      if (prev === "auto") {
        next = resolved === "dark" ? "light" : "dark";
      } else if (prev === "dark") {
        next = "light";
      } else {
        next = "dark";
      }
      persistMode(next);
      return next;
    });
  }, [resolved]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): UseThemeReturn {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
