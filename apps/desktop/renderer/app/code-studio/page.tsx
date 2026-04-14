"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useLang } from "@/lib/LangContext";
import { TRANSLATIONS } from "@/lib/studio-translations";
import type { AppLanguage } from "@/types/i18n";
import { CodeStudioSkeleton } from "@/components/SkeletonLoader";

// SSR disabled — ScopeShell depends heavily on window.cs (Electron preload bridge),
// localStorage, sessionStorage, and other browser-only APIs.
// Rendering it server-side during static export causes React #418 hydration mismatch.
const ScopeShell = dynamic(() => import("@/components/code-studio/ScopeShell"), {
  ssr: false,
  loading: () => <CodeStudioSkeleton />,
});

function CodeStudioLoading() {
  const { lang } = useLang();
  const langKey = ((lang ?? "ko").toString().toUpperCase() as AppLanguage);
  const tcs =
    (TRANSLATIONS[langKey] as unknown as Record<string, Record<string, string>> | undefined)?.codeStudio ??
    (TRANSLATIONS.KO as unknown as Record<string, Record<string, string>> | undefined)?.codeStudio ??
    ({ loading: "Loading..." } as { loading: string });
  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <div className="text-center">
        <div
          className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-t-transparent mb-4"
          style={{ borderColor: "var(--color-accent-green)", borderTopColor: "transparent" }}
        />
        <p className="font-mono text-xs uppercase tracking-wider text-text-tertiary">
          {tcs.loading}
        </p>
      </div>
    </div>
  );
}

export default function CodeStudioPage() {
  return (
    <Suspense fallback={<CodeStudioSkeleton />}>
      <div className="h-screen w-screen overflow-hidden bg-bg-primary">
        <Suspense fallback={<CodeStudioLoading />}>
          <ScopeShell />
        </Suspense>
      </div>
    </Suspense>
  );
}
