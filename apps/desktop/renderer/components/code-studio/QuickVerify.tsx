"use client";

// ============================================================
// QuickVerify — 코드 붙여넣기 → 원클릭 검증
// 바이브 코딩 초보자/중소기업 타겟
// ============================================================

import { useState, useCallback } from "react";
import { Shield, ClipboardPaste, Play, ArrowRight, Sparkles } from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

interface Props {
  /** 검증 시작: 코드와 모드를 Agent 패널로 전달 */
  onStartVerify: (code: string, mode: "verify" | "generate-verify") => void;
  /** 이지모드 진입 */
  onEasyMode: () => void;
  onClose?: () => void;
}

// eslint-disable-next-line unused-imports/no-unused-vars
export function QuickVerify({ onStartVerify, onEasyMode, onClose }: Props) {
  const { lang } = useLang();
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"choose" | "paste">("choose");

  const T = useCallback(
    (v: { ko: string; en: string }) => L4(lang, v),
    [lang],
  );

  if (step === "paste") {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Shield size={18} className="text-accent-green" />
          <div>
            <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-0.5">
              <span>{T({ ko: "검증", en: "Verify" })}</span>
              <span className="text-border">/</span>
              <span className="text-text-secondary">{T({ ko: "코드 붙여넣기", en: "Paste Code" })}</span>
            </div>
            <h2 className="text-sm font-bold text-text-primary">
              {T({ ko: "코드 검증", en: "Code Verification" })}
            </h2>
          </div>
        </div>

        {/* Paste Area */}
        <div className="flex-1 p-4">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted) setCode(pasted);
            }}
            placeholder={T({
              ko: "검증할 코드를 붙여넣으세요...\n\nCursor, Copilot, ChatGPT 등에서 생성한 코드를 여기에 넣으면\n8개 에이전트가 자동으로 검증합니다.",
              en: "Paste code to verify...\n\nPaste code from Cursor, Copilot, ChatGPT, etc.\n8 agents will automatically review it.",
            })}
            className="w-full h-full min-h-[200px] bg-bg-secondary border border-border rounded-xl p-4 text-sm font-mono text-text-primary placeholder-text-tertiary/50 resize-none outline-none focus:border-accent-green/30"
          />
        </div>

        {/* Action */}
        <div className="p-4 border-t border-border">
          {!code.trim() && (
            <p className="text-[11px] text-text-tertiary text-center mb-2">
              {T({ ko: "코드를 붙여넣으면 검증 버튼이 활성화됩니다", en: "Paste code above to enable verification" })}
            </p>
          )}
          <button
            onClick={() => onStartVerify(code, "verify")}
            disabled={!code.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-bold transition-all disabled:opacity-30 bg-accent-green text-white hover:opacity-90"
          >
            <Play size={16} />
            {T({ ko: "검증 시작", en: "Start Verification" })}
          </button>
          <button
            onClick={() => { setCode(''); setStep("choose"); }}
            className="w-full mt-2 py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {T({ ko: "뒤로", en: "Back" })}
          </button>
        </div>
      </div>
    );
  }

  // Step: choose
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-6 py-12">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-green/10 border border-accent-green/20 mb-4">
          <Shield size={14} className="text-accent-green" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-green">
            {T({ ko: "스마트 검증", en: "Smart Code Review" })}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-text-primary" style={{ fontFamily: "var(--font-display)" }}>
          {T({ ko: "무엇을 검증할까요?", en: "What would you like to verify?" })}
        </h2>
        <p className="mt-2 text-sm text-text-tertiary max-w-sm">
          {T({
            ko: "8개 전문 에이전트가 보안, 성능, 메모리, 컨벤션을 자동 검사합니다.",
            en: "8 specialized agents check security, performance, memory, and conventions.",
          })}
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {/* Option 1: Paste & Verify */}
        <button
          onClick={() => setStep("paste")}
          className="group flex items-center gap-4 w-full rounded-2xl border border-border bg-bg-secondary/50 px-5 py-5 text-left transition-all hover:border-accent-green/30 hover:bg-accent-green/5 hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-accent-green/10 group-hover:bg-accent-green/20 transition-colors">
            <ClipboardPaste size={22} className="text-accent-green" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-sm font-bold text-text-primary">
              {T({ ko: "코드 붙여넣기 → 검증", en: "Paste Code → Verify" })}
            </div>
            <div className="mt-0.5 text-[11px] text-text-tertiary">
              {T({ ko: "외부에서 만든 코드를 검증합니다", en: "Verify code from Cursor, Copilot, etc." })}
            </div>
          </div>
          <ArrowRight size={16} className="text-text-tertiary group-hover:text-accent-green transition-colors" />
        </button>

        {/* Option 2: Generate & Verify */}
        <button
          onClick={onEasyMode}
          className="group flex items-center gap-4 w-full rounded-2xl border border-border bg-bg-secondary/50 px-5 py-5 text-left transition-all hover:border-accent-purple/30 hover:bg-accent-purple/5 hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-accent-purple/10 group-hover:bg-accent-purple/20 transition-colors">
            <Sparkles size={22} className="text-accent-purple" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-sm font-bold text-text-primary">
              {T({ ko: "생성 → 검증 (이지모드)", en: "Generate → Verify (Easy Mode)" })}
            </div>
            <div className="mt-0.5 text-[11px] text-text-tertiary">
              {T({ ko: "명세서 작성 → AI 생성 → 자동 검증", en: "Write spec → AI generates → Auto-verify" })}
            </div>
          </div>
          <ArrowRight size={16} className="text-text-tertiary group-hover:text-accent-purple transition-colors" />
        </button>
      </div>
    </div>
  );
}
