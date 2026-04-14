"use client";

import { useMemo } from "react";

/** Minimal EN strings for Code Studio panels (desktop bundle; full i18n can extend). */
const DEFAULTS: Record<string, string> = {
  aiThreads: "Threads",
  aiNewThread: "New thread",
  aiSelectThread: "Select a thread",
  aiThinking: "Thinking…",
  aiMsgPlaceholder: "Message…",
  aiSharedMemory: "Shared memory",
  aiSelectPersona: "Select persona",
};

export type CodeStudioT = Record<string, string>;

/**
 * Hook used by several panels for short UI labels.
 * Unknown keys fall back to the key string so the UI stays functional.
 */
export function useCodeStudioT(): CodeStudioT {
  return useMemo(
    () =>
      new Proxy(DEFAULTS, {
        get(target, prop: string) {
          if (typeof prop !== "string") return "";
          return target[prop] ?? prop;
        },
      }) as CodeStudioT,
    [],
  );
}
