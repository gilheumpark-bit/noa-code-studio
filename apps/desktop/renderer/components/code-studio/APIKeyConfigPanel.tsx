"use client";

// ============================================================
// PART 1 — API Key Config Panel
// ============================================================

import React, { useState, useEffect } from "react";
import { X, Key, Save, ChevronDown } from "lucide-react";
import { useToast } from "@/components/code-studio/ToastSystem";
import { PROVIDER_LIST_UI, setApiKeyAsync, getApiKeyAsync } from "@/lib/ai-providers";

interface Props {
  onClose?: () => void;
}

export function APIKeyConfigPanel({ onClose }: Props) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(PROVIDER_LIST_UI[0]?.id || null);

  useEffect(() => {
    async function loadKeys() {
      const loaded: Record<string, string> = {};
      for (const p of PROVIDER_LIST_UI) {
        loaded[p.id] = await getApiKeyAsync(p.id);
      }
      setKeys(loaded);
      setLoading(false);
    }
    loadKeys();
  }, []);

  const handleChange = (id: string, val: string) => {
    setKeys((prev) => ({ ...prev, [id]: val }));
  };

  const handleSave = async () => {
    let failed = 0;
    await Promise.allSettled(
      PROVIDER_LIST_UI.map(async (p) => {
        try {
          await setApiKeyAsync(p.id, keys[p.id] || "");
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (e) {
          failed++;
        }
      })
    );
    if (failed > 0) {
      toast(`${failed}개 제공자 설정 저장에 실패했습니다.`, "error");
    } else {
      toast("API 설정이 저장되었습니다", "success");
      onClose?.();
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg-primary text-text-primary">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-purple">
          <Key size={14} />
          <span>API Key Config</span>
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-tertiary hover:text-text-primary transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-xs text-text-secondary w-full text-center py-4">로딩 중...</div>
        ) : (
          PROVIDER_LIST_UI.map((provider) => {
            const isExpanded = expandedId === provider.id;
            return (
              <div key={provider.id} className="rounded-xl border border-white/8 bg-bg-secondary/40 overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : provider.id)}
                  className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: provider.color }} />
                    <span className="text-xs font-semibold text-text-primary">{provider.name}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-text-tertiary transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-text-secondary">
                        {provider.isUrlBased ? "Endpoint URL" : "API Key"}
                      </label>
                      <input
                        type={provider.isUrlBased ? "text" : "password"}
                        value={keys[provider.id] || ""}
                        onChange={(e) => handleChange(provider.id, e.target.value)}
                        placeholder={provider.placeholder}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/50 transition-all"
                        autoComplete="off"
                        spellCheck="false"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="pt-4 border-t border-white/8 mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent-purple px-4 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            <Save size={14} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-1 | role=APIKeyConfigPanel | inputs=Props | outputs=JSX
