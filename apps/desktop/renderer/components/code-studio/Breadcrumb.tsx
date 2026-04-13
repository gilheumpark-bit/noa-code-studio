// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { ChevronRight, FileCode, Folder, GitBranch, Circle } from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

interface BreadcrumbProps {
  path: string[];
  onNavigate?: (index: number) => void;
  currentSymbol?: string | null;
  gitBranch?: string | null;
  isModified?: boolean;
}

export type { BreadcrumbProps };

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=BreadcrumbProps

// ============================================================
// PART 2 — Breadcrumb Component
// ============================================================

export function Breadcrumb({
  path,
  onNavigate,
  currentSymbol,
  gitBranch,
  isModified,
}: BreadcrumbProps) {
  const { lang } = useLang();
  if (path.length === 0 && !gitBranch) return null;

  return (
    <nav aria-label={L4(lang, { ko: "파일 경로", en: "File path breadcrumb" })} className="flex items-center gap-0.5 px-3 py-1 bg-[#0d1220] border-b border-white/[0.08] text-[10px] text-text-secondary overflow-x-auto shrink-0">
      {/* Git branch badge */}
      {gitBranch && (
        <span className="flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded bg-white/5 text-accent-purple shrink-0" aria-label={L4(lang, { ko: `Git 브랜치: ${gitBranch}`, en: `Git branch: ${gitBranch}` })}>
          <GitBranch size={10} />
          <span className="max-w-[80px] truncate">{gitBranch}</span>
        </span>
      )}

      {/* File path segments */}
      {path.map((segment, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={i} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <ChevronRight size={10} className="opacity-50" aria-hidden="true" />}
            <button
              onClick={() => onNavigate?.(i)}
              className={`hover:text-text-primary transition-colors flex items-center gap-0.5 ${
                isLast ? "text-text-primary" : ""
              }`}
              title={isLast ? segment : L4(lang, { ko: `${segment} 폴더로 이동`, en: `Navigate to ${segment} folder` })}
              aria-label={isLast ? L4(lang, { ko: `현재 파일: ${segment}`, en: `Current file: ${segment}` }) : L4(lang, { ko: `${segment} 폴더로 이동`, en: `Navigate to ${segment} folder` })}
              aria-current={isLast ? "page" : undefined}
            >
              {isLast ? (
                <FileCode size={10} className="inline text-accent-purple" aria-hidden="true" />
              ) : (
                <Folder size={10} className="inline text-accent-amber" aria-hidden="true" />
              )}
              {segment}
            </button>

            {/* Modified indicator (yellow dot) on filename */}
            {isLast && isModified && (
              <Circle
                size={6}
                className="ml-1 fill-accent-amber text-accent-amber"
              />
            )}
          </span>
        );
      })}

      {/* Current symbol display */}
      {currentSymbol && (
        <>
          <ChevronRight size={10} className="opacity-50 mx-0.5" />
          <span className="flex items-center gap-1 text-accent-purple shrink-0">
            <span className="font-mono">{currentSymbol}</span>
          </span>
        </>
      )}
    </nav>
  );
}

// IDENTITY_SEAL: PART-2 | role=Breadcrumb | inputs=BreadcrumbProps | outputs=JSX
