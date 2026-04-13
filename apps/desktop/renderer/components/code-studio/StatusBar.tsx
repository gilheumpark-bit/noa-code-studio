// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import {
  GitBranch,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Cpu,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { OpenFile } from "@noa/quill-engine/types";
import { LanguageSwitch } from "./LanguageSwitch";
import { L4 } from "@/lib/i18n";

interface StatusBarProps {
  activeFile: OpenFile | null;
  pipelineScore?: number | null;
  cursorLine?: number;
  cursorColumn?: number;
  fontSize?: number;
  gitBranch?: string;
  onSwitchProvider?: () => void;
  isDirty?: boolean;
  verificationScore?: number | null;
  isGenerating?: boolean;
  lang?: string;
}

export type { StatusBarProps };

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=StatusBarProps

// ============================================================
// PART 2 — Helper Functions
// ============================================================

function getScoreBadgeClasses(score: number): string {
  if (score >= 80) return "bg-green-500/30 text-green-300";
  if (score >= 50) return "bg-accent-amber/30 text-yellow-300";
  return "bg-red-500/30 text-red-300";
}

function getScoreIcon(score: number) {
  if (score >= 80) return <CheckCircle size={10} className="text-green-300" />;
  if (score >= 50) return <AlertTriangle size={10} className="text-yellow-300" />;
  return <XCircle size={10} className="text-red-300" />;
}

function computeFileSize(content: string): string {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// IDENTITY_SEAL: PART-2 | role=Helpers | inputs=score,content | outputs=classes,icon,size

// ============================================================
// PART 3 — StatusBar Component
// ============================================================

const SEPARATOR = <span className="w-px h-3 bg-white/20" />;
const CLICKABLE = "hover:bg-white/20 rounded px-1.5 py-0.5 transition-colors duration-150";

export function StatusBar({
  activeFile,
  pipelineScore,
  cursorLine,
  cursorColumn,
  fontSize,
  gitBranch,
  onSwitchProvider,
  isDirty,
  verificationScore,
  isGenerating,
  lang,
}: StatusBarProps) {
  const branch = gitBranch ?? "main";

  return (
    <div
      className="hidden sm:flex items-center justify-between px-3 bg-accent-purple text-xs leading-[12px] select-none overflow-x-auto shrink-0"
      style={{ height: 26, color: '#fff', fontSize: 12 }}
      role="status"
      aria-label="Status Bar"
    >
      {/* ---- Left Section ---- */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Git branch */}
        <span className="flex items-center gap-1" aria-label={`Git branch: ${branch}`}>
          <GitBranch size={12} /> {branch}
        </span>

        {SEPARATOR}

        {/* LLM Core (clickable) */}
        <button
          onClick={onSwitchProvider}
          className={`flex items-center gap-1 ${CLICKABLE}`}
          title={L4(lang || "ko", { ko: "AI 모델과 API 키를 변경합니다. 클릭하여 LLM 엔진을 설정하세요.", en: "Change AI model and API key. Click to configure the LLM engine.", ja: "AIモデルとAPIキーを変更します", zh: "更改 AI 模型和 API 密钥" })}
          aria-label={L4(lang || "ko", { ko: "LLM 엔진 설정", en: "Configure LLM Engine", ja: "AIモデルを変更", zh: "更改 AI 模型" })}
        >
          <Cpu size={10} />
          <span className="w-1.5 h-1.5 rounded-full bg-accent-purple shrink-0" />
          <span className="truncate max-w-[120px]">
            <Sparkles size={9} className="inline mr-0.5" />
            {L4(lang || "ko", { ko: "LLM 코어", en: "LLM Core", ja: "AIプロバイダー", zh: "AI 提供方" })}
          </span>
        </button>

        {SEPARATOR}

        {/* Pipeline score badge */}
        {pipelineScore != null && (
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${getScoreBadgeClasses(pipelineScore)}`}
          >
            {getScoreIcon(pipelineScore)}
            {pipelineScore}/100
          </span>
        )}

        {SEPARATOR}

        {/* Save indicator */}
        <div className="flex items-center gap-1" role="status" aria-live="polite" aria-atomic="true" aria-label={isDirty ? L4(lang || "ko", { ko: "미저장 변경사항", en: "Unsaved changes" }) : L4(lang || "ko", { ko: "모든 변경사항 저장됨", en: "All changes saved" })}>
          <span className={`w-1.5 h-1.5 rounded-full ${isDirty ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} aria-hidden="true" />
          <span className="text-[10px]">
            {isDirty
              ? L4(lang || "ko", { ko: "미저장", en: "Unsaved", ja: "未保存", zh: "未保存" })
              : L4(lang || "ko", { ko: "저장됨", en: "Saved", ja: "保存済み", zh: "已保存" })}
          </span>
        </div>

        {/* Verification score badge */}
        {verificationScore != null && (
          <>
            {SEPARATOR}
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
              verificationScore >= 77 ? 'bg-green-500/15 text-green-300' :
              verificationScore >= 60 ? 'bg-amber-500/15 text-amber-300' :
              'bg-red-500/15 text-red-300'
            }`}>
              {verificationScore}/100
            </div>
          </>
        )}

        {/* AI generating indicator */}
        {isGenerating && (
          <>
            {SEPARATOR}
            <div className="flex items-center gap-1 text-[10px] text-amber-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>EH 엔진</span>
            </div>
          </>
        )}
      </div>

      {/* ---- Right Section ---- */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden lg:flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity cursor-default" title={L4(lang || "ko", { ko: "명령 팔레트 열기", en: "Open Command Palette" })}>
          <kbd className="rounded border border-white/20 bg-white/[0.08] px-1 py-0.5 font-mono text-[9px] leading-none">Ctrl+Shift+P</kbd>
          <span className="text-[9px]">{L4(lang || "ko", { ko: "명령", en: "Commands" })}</span>
        </span>
        {SEPARATOR}
        <LanguageSwitch compact />
        {SEPARATOR}

        {activeFile && (
          <>
            {/* Cursor position */}
            {cursorLine != null && cursorColumn != null && (
              <span
                title={L4(lang || "ko", {
                  ko: `줄 ${cursorLine}, 열 ${cursorColumn}`,
                  en: `Ln ${cursorLine}, Col ${cursorColumn}`,
                  ja: `${cursorLine}行 ${cursorColumn}列`,
                  zh: `第 ${cursorLine} 行，第 ${cursorColumn} 列`,
                })}
              >
                {L4(lang || "ko", {
                  ko: `줄 ${cursorLine}, 열 ${cursorColumn}`,
                  en: `Ln ${cursorLine}, Col ${cursorColumn}`,
                  ja: `${cursorLine}行 ${cursorColumn}列`,
                  zh: `第 ${cursorLine} 行，第 ${cursorColumn} 列`,
                })}
              </span>
            )}

            {SEPARATOR}

            {/* Language */}
            <span
              title={L4(lang || "ko", {
                ko: `언어: ${activeFile.language}`,
                en: `Language: ${activeFile.language}`,
                ja: `言語: ${activeFile.language}`,
                zh: `语言: ${activeFile.language}`,
              })}
            >
              {activeFile.language}
            </span>

            {/* Line count */}
            <span className="hidden md:inline" title={L4(lang || "ko", { ko: "총 줄 수", en: "Total Lines", ja: "総行数", zh: "总行数" })}>
              {activeFile.content.split("\n").length}{" "}
              {L4(lang || "ko", { ko: "줄", en: "lines", ja: "行", zh: "行" })}
            </span>

            {/* File size */}
            <span className="hidden md:inline" title={L4(lang || "ko", { ko: "파일 크기", en: "File Size", ja: "ファイルサイズ", zh: "文件大小" })}>
              {computeFileSize(activeFile.content)}
            </span>
          </>
        )}

        {SEPARATOR}

        {/* Font size indicator */}
        {fontSize != null && (
          <span className="opacity-70">{fontSize}px</span>
        )}

        <span className="opacity-60">EH Studio</span>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=StatusBar | inputs=StatusBarProps | outputs=JSX
