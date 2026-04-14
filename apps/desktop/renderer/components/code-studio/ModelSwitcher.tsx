"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check, Key } from "lucide-react";
import {
  PROVIDERS,
  getApiKey,
  getActiveProvider,
  getActiveModel,
  setActiveProvider,
  setActiveModel as persistActiveModel,
  type ProviderId,
} from "@/lib/ai-providers";

/** Code Studio 상단 스위처에 노출할 순서 (단일 소스: PROVIDERS의 id·models·색상) */
const MODEL_SWITCHER_IDS: ProviderId[] = ["gemini", "openai", "claude", "groq"];

/** 긴 공식명 대비 짧은 라벨 (UI 폭) */
const SHORT_LABEL: Partial<Record<ProviderId, string>> = {
  gemini: "Gemini",
  openai: "OpenAI",
  claude: "Claude",
  groq: "Groq",
};

interface Props { compact?: boolean }

export function ModelSwitcher({ compact = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<ProviderId>(getActiveProvider());
  const [activeModel, setLocalActiveModel] = useState(() => getActiveModel());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleSelect = useCallback((providerId: ProviderId, model: string) => {
    setActiveProvider(providerId);
    setActiveProviderId(providerId);
    persistActiveModel(model);
    setLocalActiveModel(model);
    setIsOpen(false);
  }, []);

  const activeCore = PROVIDERS[activeProviderId] ?? PROVIDERS.gemini;
  const activeShortName = SHORT_LABEL[activeProviderId] ?? activeCore.name;

  return (
    <div ref={dropdownRef} className="relative inline-block">
      <button onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors bg-white/5 hover:bg-white/10 text-white/60 border border-white/10"
        title={`${activeShortName} / ${activeModel}`}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeCore.color }} />
        <span className={`truncate ${compact ? "max-w-[100px]" : "max-w-[140px]"}`}>{activeModel}</span>
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] max-h-[420px] overflow-y-auto rounded-lg border border-white/10 bg-[#0f1419] shadow-xl">
          <div className="px-3 py-2 border-b border-white/8">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">모델 선택</span>
          </div>
          {MODEL_SWITCHER_IDS.map((id) => {
            const provider = PROVIDERS[id];
            const label = SHORT_LABEL[id] ?? provider.name;
            const hasKey = getApiKey(id).trim().length > 0;
            return (
              <div key={id}>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: provider.color }} />
                  <span className="text-[11px] font-semibold text-white/60">{label}</span>
                  <span className="ml-auto">
                    <Key className={`w-3 h-3 ${hasKey ? "text-green-400" : "text-white/20"}`} />
                  </span>
                </div>
                {provider.models.map((model) => {
                  const isActive = id === activeProviderId && model === activeModel;
                  return (
                    <button key={`${id}-${model}`} type="button" onClick={() => handleSelect(id, model)}
                      className={`w-full flex items-center gap-2 px-4 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${isActive ? "text-amber-400 bg-white/5" : "text-white/70"} ${!hasKey ? "opacity-50" : ""}`}>
                      {isActive ? <Check className="w-3 h-3 shrink-0 text-amber-400" /> : <span className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{model}</span>
                      {!hasKey && <span className="ml-auto text-[10px] text-amber-500/70">키 필요</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
