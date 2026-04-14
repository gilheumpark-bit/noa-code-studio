"use client";

import React from "react";

/**
 * Route-level Suspense fallback for `/code-studio`.
 * Must never return null — otherwise Electron shows an empty window while boundaries resolve.
 */
export function CodeStudioSkeleton() {
  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center bg-bg-primary"
      role="status"
      aria-live="polite"
    >
      <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-green border-t-transparent" />
      <p className="font-mono text-xs uppercase tracking-wider text-text-tertiary">Loading…</p>
      <span className="sr-only">Code Studio loading</span>
    </div>
  );
}
