"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function CodeStudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Code Studio", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center space-y-4 p-8 max-w-md">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-black tracking-tighter uppercase font-mono text-text-primary">
          Code Studio Error
        </h2>
        <p className="text-sm text-text-secondary">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-accent-purple text-bg-primary rounded-lg text-xs font-bold font-mono uppercase tracking-wider hover:opacity-80 transition-all duration-200 hover:scale-[1.02] active:scale-95"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
