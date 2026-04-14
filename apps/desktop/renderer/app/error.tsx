"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import Header from "@/components/Header";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { lang } = useLang();
  const T = (v: { ko: string; en: string; ja?: string; zh?: string }) => L4(lang, v);

  useEffect(() => {
    logger.error("EH Universe", "Runtime error:", error);
  }, [error]);

  return (
    <>
      <Header />
      <main className="pt-14 flex-1 flex items-center justify-center">
        <div className="text-center px-4 py-20">
          <p
            className="font-mono text-6xl font-bold tracking-tighter mb-4"
            style={{ color: "var(--color-accent-red)" }}
          >
            ERROR
          </p>
          <p className="font-mono text-sm text-text-tertiary tracking-wider uppercase mb-2">
            {T({ ko: "시스템 오작동", en: "SYSTEM MALFUNCTION", ja: "システム障害", zh: "系统故障" })}
          </p>
          <p className="text-text-secondary text-sm mb-8 max-w-md mx-auto">
            {T({
              ko: "예기치 않은 오류가 발생했습니다. Error Heart가 현재 타임라인에서 이상을 감지했습니다.",
              en: "An unexpected error has occurred. The Error Heart detected an anomaly in the current timeline.",
              ja: "予期しないエラーが発生しました。Error Heartが現在のタイムラインで異常を検知しました。",
              zh: "发生意外错误。Error Heart在当前时间线中检测到异常。",
            })}
          </p>
          <button
            onClick={reset}
            aria-label={T({ ko: "재시도", en: "Retry — reset the page after error", ja: "リトライ", zh: "重试" })}
            className="inline-block font-mono text-xs tracking-wider uppercase px-6 py-3 border border-border rounded hover:border-accent-purple hover:text-accent-purple transition-colors"
          >
            {T({ ko: "재시도", en: "RETRY", ja: "リトライ", zh: "重试" })}
          </button>
        </div>
      </main>
    </>
  );
}
