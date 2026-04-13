// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Settings Types & Defaults
// ============================================================
// Ported from CSL IDE SettingsPanel.tsx (simplified)

import { useState, useCallback, useEffect } from "react";
import { X, RotateCcw, ShieldCheck, Shield, ShieldOff, AlertTriangle, Briefcase, Code2, Landmark } from "lucide-react";
import { setCodingMode, type CodingMode } from "@/lib/noa/lora-swap";
import { useLang, type Lang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export interface IDESettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  bracketGuides: boolean;
  stickyScroll: boolean;
  renderWhitespace: "none" | "selection" | "all";
  cursorStyle: "line" | "block" | "underline";
  theme: "dark" | "light";
  autoSave: boolean;
  autoSaveDelay: number;
  formatOnSave: boolean;
  terminalFontSize: number;
  aiTemperature: number;
  aiMaxTokens: number;
  aiGhostText: boolean;
  aiAutoSuggestDelay: number;
  pipelinePassThreshold: number;
  actionApprovalMode: "easy" | "normal" | "pro";
}

const DEFAULT_SETTINGS: IDESettings = {
  fontSize: 14, tabSize: 2, wordWrap: true, minimap: true, lineNumbers: true,
  bracketGuides: true, stickyScroll: true, renderWhitespace: "selection",
  cursorStyle: "line", theme: "dark", autoSave: true, autoSaveDelay: 500,
  formatOnSave: false, terminalFontSize: 12, aiTemperature: 0.7,
  aiMaxTokens: 4096, aiGhostText: true, aiAutoSuggestDelay: 800,
  pipelinePassThreshold: 77,
  actionApprovalMode: "normal",
};

const STORAGE_KEY = "eh_code_studio_settings";

export function loadIDESettings(): IDESettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function saveIDESettings(settings: IDESettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

// IDENTITY_SEAL: PART-1 | role=settings types + persistence | inputs=none | outputs=IDESettings

// ============================================================
// PART 2 — Settings Panel Component
// ============================================================

type SettingsTab = "editor" | "ai" | "pipeline";

interface Props {
  settings?: IDESettings;
  onChange?: (settings: IDESettings) => void;
  onClose?: () => void;
  onOpenAPIConfig?: () => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-accent-purple" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-20 rounded-lg border border-white/8 bg-white/2 px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-purple/40"
    />
  );
}

function SelectInput<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg border border-white/8 bg-white/2 px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-purple/40"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

export function SettingsPanel({ settings: settingsProp, onChange: onChangeProp, onClose, onOpenAPIConfig }: Props) {
  const [internalSettings, setInternalSettings] = useState<IDESettings>(() => settingsProp ?? loadIDESettings());
  const settings = settingsProp ?? internalSettings;
  const { lang, setLangDirect } = useLang();
  const defaultOnChange = useCallback((next: IDESettings) => {
    setInternalSettings(next);
    saveIDESettings(next);
  }, []);
  const onChange = onChangeProp ?? defaultOnChange;
  const [tab, setTab] = useState<SettingsTab>("editor");
  const [showProConfirm, setShowProConfirm] = useState(false);
  const [codingMode, setCodingModeState] = useState<CodingMode>(() => {
    if (typeof window === 'undefined') return 'standard';
    return (localStorage.getItem('eh_coding_mode') as CodingMode) || 'standard';
  });
  useEffect(() => { setCodingMode(codingMode); }, [codingMode]);

  const update = useCallback(<K extends keyof IDESettings>(key: K, value: IDESettings[K]) => {
    const next = { ...settings, [key]: value };
    onChange(next);
    saveIDESettings(next);
  }, [settings, onChange]);

  const reset = useCallback(() => {
    const confirmed = typeof window !== "undefined"
      ? window.confirm(L4(lang, {
          ko: "모든 설정을 기본값으로 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
          en: "Reset all settings to defaults? This action cannot be undone.",
        }))
      : true;
    if (!confirmed) return;
    onChange(DEFAULT_SETTINGS);
    saveIDESettings(DEFAULT_SETTINGS);
  }, [onChange, lang]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "editor", label: L4(lang, { ko: "에디터", en: "Editor" }) },
    { id: "ai", label: L4(lang, { ko: "EH 기능", en: "EH Features" }) },
    { id: "pipeline", label: L4(lang, { ko: "파이프라인", en: "Pipeline" }) },
  ];

  return (
    <div className="flex h-full flex-col" data-modal="settings" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-purple">Settings</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reset} title="Reset" aria-label="설정 초기화" className="text-text-tertiary hover:text-text-primary"><RotateCcw size={14} /></button>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-text-tertiary hover:text-text-primary"><X size={14} /></button>
        </div>
      </div>

      <div className="flex border-b border-white/8">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs transition ${tab === t.id ? "border-b-2 border-accent-purple text-text-primary" : "text-text-tertiary hover:text-text-secondary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {tab === "editor" && (
          <>
            <Row label="Language">
              <SelectInput
                value={lang}
                onChange={(v) => {
                  setLangDirect(v as Lang);
                  localStorage.setItem("eh-lang", v);
                }}
                options={[
                  { value: "ko", label: "한국어" },
                  { value: "en", label: "English" },
                  { value: "ja", label: "日本語" },
                  { value: "zh", label: "中文" }
                ]}
              />
            </Row>
            <Row label="Font Size"><NumberInput value={settings.fontSize} onChange={(v) => update("fontSize", v)} min={10} max={24} /></Row>
            <Row label="Tab Size"><NumberInput value={settings.tabSize} onChange={(v) => update("tabSize", v)} min={1} max={8} /></Row>
            <Row label="Word Wrap"><Toggle checked={settings.wordWrap} onChange={(v) => update("wordWrap", v)} /></Row>
            <Row label="Minimap"><Toggle checked={settings.minimap} onChange={(v) => update("minimap", v)} /></Row>
            <Row label="Line Numbers"><Toggle checked={settings.lineNumbers} onChange={(v) => update("lineNumbers", v)} /></Row>
            <Row label="Bracket Guides"><Toggle checked={settings.bracketGuides} onChange={(v) => update("bracketGuides", v)} /></Row>
            <Row label="Sticky Scroll"><Toggle checked={settings.stickyScroll} onChange={(v) => update("stickyScroll", v)} /></Row>
            <Row label="Whitespace">
              <SelectInput value={settings.renderWhitespace} onChange={(v) => update("renderWhitespace", v)} options={[{ value: "none", label: "None" }, { value: "selection", label: "Selection" }, { value: "all", label: "All" }]} />
            </Row>
            <Row label="Cursor Style">
              <SelectInput value={settings.cursorStyle} onChange={(v) => update("cursorStyle", v)} options={[{ value: "line", label: "Line" }, { value: "block", label: "Block" }, { value: "underline", label: "Underline" }]} />
            </Row>
            <Row label="Auto Save"><Toggle checked={settings.autoSave} onChange={(v) => update("autoSave", v)} /></Row>
            <Row label="Format on Save"><Toggle checked={settings.formatOnSave} onChange={(v) => update("formatOnSave", v)} /></Row>
            <Row label="Terminal Font"><NumberInput value={settings.terminalFontSize} onChange={(v) => update("terminalFontSize", v)} min={8} max={20} /></Row>
          </>
        )}
        {tab === "ai" && (
          <>
            {/* Action Approval Mode */}
            <div className="pb-3 mb-3 border-b border-border">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Action Approval</span>
              <div className="flex gap-1.5 mt-2">
                {([
                  { mode: "easy" as const, icon: ShieldCheck, label: "Easy", desc: L4(lang, { ko: "모든 작업 승인 필요", en: "All actions need approval" }), color: "accent-green" },
                  { mode: "normal" as const, icon: Shield, label: "Normal", desc: L4(lang, { ko: "위험 명령만 승인", en: "Only risky commands need approval" }), color: "accent-amber" },
                  { mode: "pro" as const, icon: ShieldOff, label: "Pro", desc: L4(lang, { ko: "완전 자율 실행", en: "Fully autonomous execution" }), color: "accent-red" },
                ]).map(({ mode, icon: ModeIcon, label, desc, color }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      if (mode === "pro" && settings.actionApprovalMode !== "pro") {
                        setShowProConfirm(true);
                      } else {
                        update("actionApprovalMode", mode);
                      }
                    }}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-[10px] transition-all duration-200 hover:scale-[1.02] active:scale-95 ${
                      settings.actionApprovalMode === mode
                        ? `border-${color}/40 bg-${color}/10 text-${color}`
                        : 'border-border bg-bg-secondary/30 text-text-tertiary hover:border-border hover:text-text-secondary'
                    }`}
                  >
                    <ModeIcon size={14} />
                    <span className="font-bold">{label}</span>
                    <span className="text-[8px] text-text-tertiary leading-tight">{desc}</span>
                  </button>
                ))}
              </div>
              {/* Pro Mode Confirmation Dialog */}
              {showProConfirm && (
                <div className="mt-2 rounded-lg border border-accent-red/40 bg-accent-red/5 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-accent-red shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p className="text-[10px] font-bold text-accent-red">{L4(lang, { ko: "Pro 모드 경고", en: "Pro Mode Warning" })}</p>
                      <p className="text-[9px] text-text-secondary leading-relaxed">
                        {L4(lang, {
                          ko: "활성화 시 EH 엔진이 승인 없이 터미널 명령어, 파일 덮어쓰기, 패키지 설치 등을 즉시 실행합니다. 예기치 않은 시스템 변경이 발생할 수 있습니다.",
                          en: "When enabled, the EH engine will immediately execute terminal commands, file overwrites, and package installs without approval. Unexpected system changes may occur."
                        })}
                      </p>
                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => { update("actionApprovalMode", "pro"); setShowProConfirm(false); }}
                          className="flex-1 flex items-center justify-center gap-1 rounded-md border border-accent-red/50 bg-accent-red/15 px-2 py-1.5 text-[9px] font-bold text-accent-red transition-all duration-200 hover:bg-accent-red/25 hover:scale-[1.02] active:scale-95"
                        >
                          <ShieldOff size={10} />
                          {L4(lang, { ko: "위험 감수 — 활성화", en: "Accept Risk — Enable" })}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowProConfirm(false)}
                          className="flex-1 rounded-md border border-border bg-bg-secondary/50 px-2 py-1.5 text-[9px] font-medium text-text-secondary transition-all duration-200 hover:text-text-primary hover:scale-[1.02] active:scale-95"
                        >
                          {L4(lang, { ko: "취소", en: "Cancel" })}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Coding Mode Selector */}
            <div className="pb-3 mb-3 border-b border-border">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Coding Mode</span>
              <div className="flex gap-1.5 mt-2">
                {([
                  { mode: "standard" as const, icon: Code2, label: "Standard", desc: L4(lang, { ko: "정석 코딩", en: "Standard coding" }), color: "accent-blue" },
                  { mode: "office" as const, icon: Briefcase, label: L4(lang, { ko: "직장인", en: "Office" }), desc: L4(lang, { ko: "복붙 실전 모드", en: "Copy-paste practical mode" }), color: "accent-amber" },
                  { mode: "architect" as const, icon: Landmark, label: "Architect", desc: L4(lang, { ko: "설계 중심", en: "Design-focused" }), color: "accent-purple" },
                ]).map(({ mode, icon: ModeIcon, label, desc, color }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setCodingModeState(mode); setCodingMode(mode); localStorage.setItem('eh_coding_mode', mode); }}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-[10px] transition-all duration-200 hover:scale-[1.02] active:scale-95 ${
                      codingMode === mode
                        ? `border-${color}/40 bg-${color}/10 text-${color}`
                        : 'border-border bg-bg-secondary/30 text-text-tertiary hover:border-border hover:text-text-secondary'
                    }`}
                  >
                    <ModeIcon size={14} />
                    <span className="font-bold">{label}</span>
                    <span className="text-[8px] text-text-tertiary leading-tight">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <Row label="Ghost Text"><Toggle checked={settings.aiGhostText} onChange={(v) => update("aiGhostText", v)} /></Row>
            <Row label="Temperature"><NumberInput value={settings.aiTemperature} onChange={(v) => update("aiTemperature", v)} min={0} max={2} step={0.1} /></Row>
            <Row label="Max Tokens"><NumberInput value={settings.aiMaxTokens} onChange={(v) => update("aiMaxTokens", v)} min={256} max={32768} step={256} /></Row>
            <Row label="Auto Suggest Delay (ms)"><NumberInput value={settings.aiAutoSuggestDelay} onChange={(v) => update("aiAutoSuggestDelay", v)} min={100} max={3000} step={100} /></Row>
            <div className="pt-2 mt-2 border-t border-border">
              <button
                type="button"
                onClick={onOpenAPIConfig}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 hover:scale-[1.02] active:scale-95 border border-accent-purple/30 rounded-lg text-xs font-mono transition-all duration-200"
              >
                API Key Configuration
              </button>
            </div>
          </>
        )}
        {tab === "pipeline" && (
          <>
            <Row label="Pass Threshold"><NumberInput value={settings.pipelinePassThreshold} onChange={(v) => update("pipelinePassThreshold", v)} min={0} max={100} /></Row>
            <p className="pt-2 text-[10px] text-text-tertiary">
              Score below this threshold will be marked as &quot;fail&quot;. Default: 77.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=settings panel UI | inputs=IDESettings | outputs=settings form with tabs
