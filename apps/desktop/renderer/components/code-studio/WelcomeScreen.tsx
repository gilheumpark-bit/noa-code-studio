"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code2, Play, FolderOpen, ChevronDown, Shield, Files } from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import { TRANSLATIONS } from "@/lib/studio-translations";
import { listProjects } from "@/lib/code-studio/core/store";
import type { AppLanguage } from "@/types/i18n";
import "./welcome-screen.css";


interface WelcomeScreenProps {
  onNewFile: () => void;
  onOpenDemo: () => void;
  onBlankProject?: () => void;
  onImportProject?: () => void;
  onResumeProject?: () => void;
  onQuickVerify?: () => void;
  onOpenLocalFolder?: () => void;
  /** Desktop: `false` when file explorer closed — show left-rail hint */
  explorerOpen?: boolean;
}

// ============================================================
// PART 2 — Main WelcomeScreen
// ============================================================

export default function WelcomeScreen({
  onNewFile,
  onOpenDemo,
  onBlankProject,
  onImportProject,
  onResumeProject,
  onQuickVerify,
  onOpenLocalFolder,
  explorerOpen,
}: WelcomeScreenProps) {
  const { lang } = useLang();
  const langKey = ((lang ?? "ko").toString().toUpperCase() as AppLanguage);
  const t =
    (TRANSLATIONS[langKey]?.codeStudio as unknown as Record<string, string>) ??
    ({
      title: "EH Code Studio",
      subtitle: L4(lang, { ko: "에이전틱 코딩 엔진", en: "Agentic coding engine" }),
      loading: L4(lang, { ko: "로딩 중...", en: "Loading..." }),
      openDemo: L4(lang, { ko: "데모 열기", en: "Open Demo" }),
      openDemoDesc: L4(lang, { ko: "데모 프로젝트로 시작하기", en: "Start with a demo project" }),
      resumeProject: L4(lang, { ko: "마지막 프로젝트 재개", en: "Resume last project" }),
      resumeProjectDesc: L4(lang, { ko: "이전에 작업하던 곳부터 계속하기", en: "Continue where you left off" }),
      newFile: L4(lang, { ko: "새 파일", en: "New file" }),
      newFileDesc: L4(lang, { ko: "빈 파일을 생성하고 편집하기", en: "Create an empty file and start editing" }),
      blankProject: L4(lang, { ko: "빈 프로젝트", en: "Blank project" }),
      importFiles: L4(lang, { ko: "파일 가져오기", en: "Import files" }),
      explorerClosedTitle: L4(lang, { ko: "탐색기가 닫혀 있습니다", en: "Explorer is closed" }),
      explorerClosedDesc: L4(lang, { ko: "좌측 바에서 파일(폴더) 아이콘을 클릭하여 트리를 엽니다. 파일을 선택하면 여기서 편집기가 열립니다.", en: "In the left activity bar, tap the Files (folder) icon to open the project tree. Choose a file to open the editor in this area." }),
      greetingTitle: L4(lang, { ko: "안녕하세요!", en: "Hi there!" }),
      greetingDesc: L4(lang, { ko: "무엇을 도와드릴까요?", en: "How can I help?" }),
      quickVerifyTitle: L4(lang, { ko: "스마트 검증", en: "Smart Verify" }),
      quickVerifyDesc: L4(lang, { ko: "붙여넣기 → 검증 / 생성 → 검증", en: "Paste → Verify / Generate → Verify" }),
      openLocalFolder: L4(lang, { ko: "로컬 폴더 열기", en: "Open Local Folder" }),
      openLocalFolderDesc: L4(lang, { ko: "시스템에서 폴더를 선택하세요", en: "Select a folder from your system" }),
      lessOptions: L4(lang, { ko: "간단히 보기", en: "Less" }),
      moreOptions: L4(lang, { ko: "더 많은 옵션", en: "More options" }),
      commandPalette: L4(lang, { ko: "명령어 목록", en: "Commands" }),
      terminal: L4(lang, { ko: "터미널", en: "Terminal" }),
    });
  const [visible, setVisible] = useState(false);
  const [hasProjects, setHasProjects] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const isElectron =
    typeof window !== "undefined" &&
    (!!(window as { cs?: unknown }).cs || !!(window as { electron?: unknown }).electron);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    listProjects().then((projects) => setHasProjects(projects.length > 0)).catch(() => {});
  }, []);

  // Primary CTA selection logic
  const primaryLabel = hasProjects
    ? (t as Record<string, string>).resumeProject ?? "Resume Last Project"
    : t.openDemo;
  const primaryDesc = hasProjects
    ? (t as Record<string, string>).resumeProjectDesc ?? "Continue where you left off"
    : t.openDemoDesc;
  const primaryAction = hasProjects ? (onResumeProject ?? onOpenDemo) : onOpenDemo;
  const primaryIcon = hasProjects
    ? <FolderOpen className="h-6 w-6 text-accent-amber" />
    : <Play className="h-6 w-6 text-accent-purple" />;
  const primaryAccent = hasProjects ? "bg-accent-amber/10" : "bg-accent-purple/10";

  const showExplorerHint = explorerOpen === false;

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-primary">
      {/* Premium Background Effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="welcome-bg-glow-1 absolute left-1/2 top-1/3 h-[min(600px,100vw)] w-[min(600px,100vw)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.07]" />
        <div className="welcome-bg-glow-2 absolute left-1/4 top-2/3 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.04]" />
        <div className="welcome-bg-glow-3 absolute right-1/4 top-1/4 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.03]" />
        <div className="welcome-bg-grid welcome-bg-grid-dim absolute inset-0 opacity-[0.03]" />
      </div>

      {/* Left-rail onboarding — only when explorer is closed (desktop) */}
      {showExplorerHint && (
        <div
          className="relative z-20 flex shrink-0 items-start gap-3 border-b border-border bg-bg-secondary px-4 py-3 text-left shadow-sm sm:items-center"
          role="status"
        >
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-primary text-accent-green sm:mt-0">
            <Files className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold text-text-primary">
              {t.explorerClosedTitle}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-snug text-text-secondary">
              {t.explorerClosedDesc}
            </p>
          </div>
        </div>
      )}

      <div
        className={`relative z-10 flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto overflow-x-hidden px-4 py-8 sm:gap-6 sm:px-6 sm:py-10 transition-all duration-700 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        } ${showExplorerHint ? "sm:py-6" : ""}`}
      >
        {/* Mascot — no side bubble; greeting sits in document flow */}
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="group relative flex w-full max-w-md flex-col items-center"
            >
              <div className="absolute -inset-3 rounded-full bg-accent-green/10 blur-2xl transition-all duration-700 group-hover:bg-accent-green/15" />
              <motion.img
                src="/images/quill.png"
                alt=""
                className="relative h-20 w-20 object-contain drop-shadow-[0_8px_32px_rgba(47,155,131,0.35)] sm:h-24 sm:w-24"
                animate={{
                  y: [0, -8, 0],
                  rotate: [0, 2, -2, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              <div className="relative mt-4 w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 shadow-lg sm:px-5 sm:py-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                  EH Code Studio
                </p>
                <p className="mt-2 font-mono text-sm font-semibold leading-snug text-text-primary sm:text-base">
                  {t.greetingTitle}
                  <br />
                  {t.greetingDesc}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Title Section */}
        <div className="w-full max-w-md text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-green/25 bg-accent-green/10 px-3 py-1">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-green animate-pulse" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-green">
              {t.title}
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-md font-mono text-xs leading-relaxed text-text-secondary">{t.subtitle}</p>
        </div>

        {/* Main CTAs — solid surfaces, readable text */}
        <div className="flex w-full max-w-md flex-col items-stretch gap-4">
          {/* Primary CTA */}
          <button
            type="button"
            onClick={primaryAction}
            className="group relative flex w-full items-center gap-4 rounded-2xl border border-border bg-bg-secondary px-5 py-5 text-left shadow-md transition-all duration-200 hover:border-accent-green/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/50 sm:gap-5 sm:px-6 sm:py-6"
          >
            <div className={`rounded-xl border border-border p-3 sm:p-4 ${primaryAccent} transition-transform duration-300 group-hover:scale-105`}>
              {primaryIcon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-base font-bold text-text-primary sm:text-lg">{primaryLabel}</div>
              <div className="mt-1 font-mono text-[11px] leading-snug text-text-secondary sm:text-xs">{primaryDesc}</div>
            </div>
            <span className="shrink-0 text-text-secondary transition-all group-hover:translate-x-0.5 group-hover:text-accent-green" aria-hidden>
              &rarr;
            </span>
          </button>

          {/* Secondary CTA */}
          <button
            type="button"
            onClick={onNewFile}
            className="group flex w-full items-center gap-4 rounded-xl border border-border bg-bg-secondary px-5 py-4 text-left shadow-sm transition-all hover:border-accent-green/35 hover:bg-bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/40"
          >
            <div className="rounded-lg bg-accent-green/15 p-2.5 transition-colors group-hover:bg-accent-green/25">
              <Code2 className="h-5 w-5 text-accent-green" />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-sm font-bold text-text-primary">{t.newFile}</div>
              <div className="mt-0.5 font-mono text-[11px] text-text-secondary">{t.newFileDesc}</div>
            </div>
          </button>

          {/* Quick Verify CTA */}
          {onQuickVerify && (
            <button
              type="button"
              onClick={onQuickVerify}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-bg-secondary px-5 py-4 text-left shadow-sm transition-all hover:border-accent-green/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/40"
            >
              <div className="rounded-lg bg-accent-green/15 p-2.5 transition-colors group-hover:bg-accent-green/25">
                <Shield className="h-5 w-5 text-accent-green" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold text-text-primary">
                  {t.quickVerifyTitle}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-text-secondary">
                  {t.quickVerifyDesc}
                </div>
              </div>
            </button>
          )}

          {/* Electron: Open Local Folder */}
          {isElectron && onOpenLocalFolder && (
            <button
              type="button"
              onClick={onOpenLocalFolder}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-bg-secondary px-5 py-4 text-left shadow-sm transition-all hover:border-accent-amber/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/40"
            >
              <div className="rounded-lg bg-accent-amber/15 p-2.5 transition-colors group-hover:bg-accent-amber/25">
                <FolderOpen className="h-5 w-5 text-accent-amber" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold text-text-primary">
                  {t.openLocalFolder}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-text-secondary">
                  {t.openLocalFolderDesc}
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Collapsible extras */}
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExtras(!showExtras)}
            className="flex min-h-11 items-center gap-1 rounded-lg px-2 font-mono text-[11px] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
          >
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showExtras ? "rotate-180" : ""}`} />
            {showExtras ? t.lessOptions : t.moreOptions}
          </button>

          {showExtras && (
            <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Tertiary links */}
              <div className="flex items-center gap-4 font-mono text-[11px]">
                {onBlankProject && (
                  <button type="button" onClick={onBlankProject} className="text-text-secondary underline decoration-text-tertiary/40 underline-offset-2 transition-colors hover:text-text-primary">
                    {t.blankProject}
                  </button>
                )}
                {onBlankProject && <span className="text-text-tertiary" aria-hidden>|</span>}
                <button type="button" onClick={onImportProject ?? onNewFile} className="text-text-secondary underline decoration-text-tertiary/40 underline-offset-2 transition-colors hover:text-text-primary">
                  {t.importFiles}
                </button>
                {hasProjects && (
                  <>
                    <span className="text-text-tertiary" aria-hidden>|</span>
                    <button type="button" onClick={onOpenDemo} className="text-text-secondary underline decoration-text-tertiary/40 underline-offset-2 transition-colors hover:text-text-primary">
                      {t.openDemo}
                    </button>
                  </>
                )}
              </div>

              {/* Keyboard shortcuts */}
              <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 font-mono text-[10px] text-text-secondary">
                <span className="rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-text-primary">Ctrl+N</span>
                <span className="mx-1">{t.newFile}</span>
                <span className="mx-1 text-text-tertiary" aria-hidden>|</span>
                <span className="rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-text-primary">Ctrl+Shift+P</span>
                <span className="mx-1">{t.commandPalette}</span>
                <span className="mx-1 text-text-tertiary" aria-hidden>|</span>
                <span className="rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-text-primary">Ctrl+`</span>
                <span className="mx-1">{t.terminal}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-1 | role=Imports | inputs=none | outputs=types
// IDENTITY_SEAL: PART-2 | role=WelcomeScreen | inputs=callbacks,hasProjects | outputs=2-CTA onboarding UI
