"use client";

import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export default function CodeStudioLoading() {
  const { lang } = useLang();

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-bg-primary" role="status" aria-live="polite">
      <div className="text-center">
        <div
          className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-4"
          style={{ borderColor: "var(--color-accent-green)", borderTopColor: "transparent" }}
        />
        <p className="font-mono text-xs text-text-tertiary tracking-wider uppercase">
          {L4(lang, {
            ko: '코드 스튜디오 로딩 중...',
            en: 'LOADING CODE STUDIO...',
            ja: 'コードスタジオを読み込み中...',
            zh: '正在加载代码工作室...',
          })}
        </p>
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
}
