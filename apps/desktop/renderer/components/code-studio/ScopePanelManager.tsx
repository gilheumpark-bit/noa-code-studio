// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Files, Search, GitBranch, MessageSquare, Activity,
  Edit3, AlertTriangle, Eye, ChevronRight, Settings, X,
  Plus,
  type LucideIcon,
  Upload, Bug, Play, Shield, List, Layout,
  Package, BarChart3, Users, Wand2,
  Terminal, Layers, Brain, BrainCircuit, Cpu, TrendingUp,
  Network, GitMerge, GitFork, Database, GraduationCap,
  FolderKanban, Keyboard, Key, ShieldCheck, GitCompareArrows,
  BookA, Boxes, BookOpen, Code2, PenTool, Hash, Clock, Zap,
  GitCompare,
} from "lucide-react";
import { L4 } from "@/lib/i18n";
import { useLang } from "@/lib/LangContext";
import type { FileNode, OpenFile } from "@eh/quill-engine/types";
import type { RightPanel } from "@/lib/code-studio/core/panel-registry";
import { getVisiblePanels } from "@/lib/code-studio/core/panel-registry";
import type { BugReport } from "@eh/quill-engine/pipeline/bugfinder";
import type { StressReport } from "@eh/quill-engine/pipeline/stress-test";
import type { VerificationResult } from "@eh/quill-engine/pipeline/verification-loop";
import type { ComposerMode } from "@/lib/code-studio/core/composer-state";
import type { useCodeStudioPanels } from "@/hooks/useCodeStudioPanels";
import * as PI from "@/components/code-studio/PanelImports";
import { detectLanguage } from "@eh/quill-engine/types";
import { saveProjectSpec } from "@/lib/code-studio/core/project-spec";
import {
  CODE_STUDIO_SPEC_CHAT_SEED_KEY,
  buildProjectSpecChatSeed,
  toCoreProjectSpec,
  type ProjectSpecFormData,
} from "@/lib/code-studio/core/project-spec-bridge";
import { explainCode, lintCode, generateDocstring } from "@/lib/code-studio/ai/ai-features";
import { runApplyGuard } from "@/lib/code-studio/diff-guard/apply-guard";
import type { Finding } from "@eh/quill-engine/pipeline/pipeline-teams";

function findFileNodeByName(nodes: FileNode[], name: string): FileNode | null {
  const basename = name.includes("/") ? name.split("/").pop() : name;
  if (!basename) return null;
  for (const n of nodes) {
    if (n.type === "file" && n.name === basename) return n;
    if (n.children) {
      const found = findFileNodeByName(n.children, basename);
      if (found) return found;
    }
  }
  return null;
}

import { ThemeToggle } from "@/components/code-studio/ThemeToggle";
import { loadActivityBarOrder, saveActivityBarOrder, ACTIVITY_BAR_DEFAULT_ORDER } from "@/lib/code-studio/activity-bar-order";

/** Map registry icon names → lucide-react components for the activity bar */
const LUCIDE_MAP: Record<string, LucideIcon> = {
  MessageSquare, Activity, GitBranch, Upload, Bug, Search, Play,
  Shield, Edit3, AlertTriangle, Eye, List, Layout, Settings,
  Package, BarChart3, Users, Wand2,
  Terminal, Layers, Brain, BrainCircuit, Cpu, TrendingUp,
  Network, GitMerge, GitFork, Database, GraduationCap,
  FolderKanban, Keyboard, Key, ShieldCheck, GitCompareArrows,
  BookA, Boxes, BookOpen, Code2, PenTool, Hash, Clock, Zap,
  GitCompare,
};

/** Maps engine bug reports to Problems panel finding shape (memoize at call sites). */
function mapBugReportsToProblemFindings(bugReports: BugReport[]) {
  return bugReports.map((b) => ({
    severity: (b.severity === "critical" ? "critical" : b.severity === "high" ? "major" : b.severity === "medium" ? "minor" : "info") as "critical" | "major" | "minor" | "info",
    message: b.description,
    line: b.line,
    team: b.category,
  }));
}

interface PipelineStage {
  name: string;
  status: "pass" | "warn" | "fail" | "running" | "pending";
  score?: number;
  message?: string;
}

export interface ScopePanelManagerProps {
  // Panel state
  rightPanel: RightPanel | null;
  onSetRightPanel: (panel: RightPanel | null) => void;
  showAdvancedPanels: boolean;
  onToggleAdvancedPanels: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;

  // Bottom panels
  showTerminal: boolean;
  showProblems: boolean;
  showPipelineBottom: boolean;
  onToggleTerminal: () => void;
  onToggleProblems: () => void;
  onTogglePipelineBottom: () => void;
  onCloseAllBottom: () => void;
  termRef: React.RefObject<HTMLDivElement | null>;

  // Data
  files: FileNode[];
  openFiles: OpenFile[];
  activeFile: OpenFile | null;
  activeFileId: string | null;
  bugReports: BugReport[];
  pipelineStages: PipelineStage[];
  pipelineScore: number | null;
  stressReport: StressReport | null;
  isStressTesting: boolean;
  verificationResult: VerificationResult | null;
  isVerifying: boolean;
  verificationScore: number | null;
  currentVerifyRound: number;

  // Composer
  composerMode: ComposerMode;
  onComposerTransition: (mode: ComposerMode) => void;

  // Panel hook state — typed from the actual hook return
  panels: ReturnType<typeof useCodeStudioPanels>;

  // Callbacks
  onFileSelect: (node: FileNode) => void;
  onApplyCode: (code: string, fileName?: string) => void;
  onSetDiffState: (state: { original: string; modified: string; fileName: string } | null) => void;
  fsUpdateContent: (id: string, content: string) => void;
  onSetOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>;
  onApproveFile: (fileName: string) => void;
  onOverrideFile: (fileName: string) => void;
  onRejectFile: (fileName: string) => void;
  stagedFiles: Record<string, string>;
  guardFindingsByFile: Record<string, import("@eh/quill-engine/pipeline/pipeline-teams").Finding[]>;
  onSetFiles: React.Dispatch<React.SetStateAction<FileNode[]>>;
  handleRunStressTest: () => void;
  handleRunVerification: () => void;
  editorNavigateToLine: (line: number) => void;

  // Toast
  toast: (msg: string, type: "success" | "info" | "error") => void;

  // i18n
  lang: string;
  tcs: Record<string, string>;
}

// IDENTITY_SEAL: PART-1 | role=Imports+Types | inputs=none | outputs=imports,PanelManagerProps

/** 드롭 대상 앞에 끼워 넣기 (remove → insert before target) */
function reorderActivityBarIds(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids;
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  const [removed] = next.splice(from, 1);
  const insertAt = next.indexOf(toId);
  next.splice(insertAt, 0, removed);
  return next;
}

// ============================================================
// PART 2 — Activity Bar
// ============================================================

const ActivityBar = memo(function ActivityBar({
  rightPanel, onSetRightPanel, bugReports, showAdvancedPanels,
  onToggleAdvancedPanels, showSettings, onToggleSettings, lang,
  onAction,
  widthPx,
}: {
  rightPanel: RightPanel | null;
  onSetRightPanel: (panel: RightPanel | null) => void;
  bugReports: BugReport[];
  showAdvancedPanels: boolean;
  onToggleAdvancedPanels: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  lang: string;
  onAction?: (actionId: string) => void;
  /** 드래그로 조절되는 액티비티 열 너비(px) */
  widthPx: number;
}) {
  const visiblePanels = getVisiblePanels(showAdvancedPanels);

  const coreItemCatalog: Record<
    string,
    {
      id: string;
      icon: LucideIcon;
      label: string;
      labelKo: string;
      shortcut?: string;
      isAction?: boolean;
    }
  > = {
    files: { id: "files", icon: Files, label: "Explorer", labelKo: "탐색기", shortcut: "Ctrl+Shift+E" },
    chat: { id: "chat", icon: MessageSquare, label: "EH Chat", labelKo: "EH 챗" },
    "action-demo": { id: "action-demo", icon: Play, label: "Open Demo", labelKo: "데모 열기", isAction: true },
    "action-new-file": { id: "action-new-file", icon: Plus, label: "New File", labelKo: "새 파일", isAction: true },
    "project-spec": { id: "project-spec", icon: Wand2, label: "Project Spec", labelKo: "이지모드 진입" },
    pipeline: { id: "pipeline", icon: Activity, label: "Pipeline", labelKo: "파이프라인" },
    search: { id: "search", icon: Search, label: "Search", labelKo: "파일 검색", shortcut: "Ctrl+Shift+F" },
    git: { id: "git", icon: GitBranch, label: "Git", labelKo: "Git" },
    review: { id: "review", icon: AlertTriangle, label: "Review", labelKo: "리뷰 센터" },
    composer: { id: "composer", icon: Edit3, label: "Composer", labelKo: "멀티파일 작성기" },
    preview: { id: "preview", icon: Eye, label: "Preview", labelKo: "실시간 프리뷰" },
    canvas: { id: "canvas", icon: PenTool, label: "Canvas", labelKo: "캔버스" },
  };

  const [mounted, setMounted] = useState(false);
  const [itemOrder, setItemOrder] = useState<string[]>([...ACTIVITY_BAR_DEFAULT_ORDER]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  /** dragOver 시점에 getData가 비는 브라우저 대비 */
  const draggedIdRef = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setItemOrder(loadActivityBarOrder());
  }, []);

  useEffect(() => {
    if (mounted) saveActivityBarOrder(itemOrder);
  }, [itemOrder, mounted]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    draggedIdRef.current = id;
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const from = draggedIdRef.current;
    if (from && from !== id) setDropTargetId(id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain") || draggedIdRef.current;
    draggedIdRef.current = null;
    if (!fromId || fromId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    setItemOrder((prev) => reorderActivityBarIds(prev, fromId, targetId));
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  const orderedCoreItems = itemOrder.map((id) => coreItemCatalog[id]).filter(Boolean);

  const renderIconBtn = (item: typeof coreItemCatalog[string]) => {
    const displayLabel = L4(lang, { ko: item.labelKo, en: item.label });
    const reorderHint = L4(lang, { ko: "드래그하여 순서 변경", en: "Drag to reorder" });
    const titleBase = `${displayLabel}${item.shortcut ? ` (${item.shortcut})` : ""}`;
    const isDrop = dropTargetId === item.id && draggedId && draggedId !== item.id;
    return (
      <button
        key={item.id}
        type="button"
        draggable
        data-dragging={draggedId === item.id ? "true" : undefined}
        onDragStart={(e) => handleDragStart(e, item.id)}
        onDragOver={(e) => handleDragOver(e, item.id)}
        onDrop={(e) => handleDrop(e, item.id)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (item.isAction) {
            onAction?.(item.id);
          } else {
            onSetRightPanel(rightPanel === item.id ? null : (item.id as RightPanel));
          }
        }}
        className={`relative flex shrink-0 flex-col items-center justify-center rounded-lg transition-all duration-150 hover:bg-white/6 group cursor-grab active:cursor-grabbing ${
          draggedId === item.id ? "opacity-50" : ""
        } ${isDrop ? "ring-2 ring-accent-purple/60 ring-offset-1 ring-offset-bg-primary rounded-lg" : ""}`}
        style={{ minWidth: 44, minHeight: 44, width: widthPx > 56 ? widthPx - 8 : 44 }}
        title={titleBase}
        aria-label={displayLabel}
      >
        <span className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-r bg-accent-purple transition-all duration-200 ${
          rightPanel === item.id ? "h-5 opacity-100" : "h-0 opacity-0"
        }`} />
        <item.icon className={`pointer-events-none h-[18px] w-[18px] transition-colors ${
          rightPanel === item.id ? "text-text-primary" : "text-text-tertiary group-hover:text-text-secondary"
        }`} />
        <span className={`pointer-events-none mt-0.5 text-[8px] leading-tight truncate max-w-[36px] transition-colors ${
          rightPanel === item.id ? "text-text-primary" : "text-text-tertiary group-hover:text-text-secondary"
        }`}>{displayLabel.length > 4 ? displayLabel.slice(0, 4) : displayLabel}</span>
        {item.id === "pipeline" && bugReports.length > 0 && (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-accent-red text-[8px] text-white flex items-center justify-center">{bugReports.length}</span>
        )}
      </button>
    );
  };

  return (
    <div
      style={{ width: widthPx }}
      className="shrink-0 border-r border-white/8 bg-bg-primary flex flex-col items-center py-3 gap-2 overflow-y-auto [&::-webkit-scrollbar]:hidden min-w-0"
    >

      {/* All Icons Container */}
      <div
        className="flex flex-wrap justify-center gap-1 w-full px-1"
        role="toolbar"
        aria-label={L4(lang, { ko: "주요 도구", en: "Tools" })}
      >
        {orderedCoreItems.map(renderIconBtn)}

        {/* Advanced panels */}
        {showAdvancedPanels && visiblePanels
          .filter(p => !["chat","search","outline","preview","composer","pipeline","bugs","git"].includes(p.id))
          .map(p => {
            const Icon = LUCIDE_MAP[p.icon];
            const lbl = L4(lang, { ko: p.labelKo, en: p.label });
            const shortLbl = lbl.length > 4 ? lbl.slice(0, 4) : lbl;
            return (
              <button key={p.id} onClick={() => onSetRightPanel(rightPanel === p.id ? null : p.id as RightPanel)}
                className="relative flex shrink-0 flex-col items-center justify-center rounded-lg transition-all duration-150 hover:bg-white/6 group"
                style={{ minWidth: 44, minHeight: 44 }}
                title={lbl}
                aria-label={lbl}>
                <span className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-r bg-accent-purple transition-all duration-200 ${rightPanel === p.id ? "h-5 opacity-100" : "h-0 opacity-0"}`} />
                {Icon ? <Icon className={`pointer-events-none h-[18px] w-[18px] transition-colors ${rightPanel === p.id ? "text-text-primary" : "text-text-tertiary group-hover:text-text-secondary"}`} /> : <span className="pointer-events-none text-[10px] text-text-tertiary">{p.label.substring(0,2)}</span>}
                <span className={`pointer-events-none mt-0.5 text-[8px] leading-tight truncate max-w-[36px] transition-colors ${
                  rightPanel === p.id ? "text-text-primary" : "text-text-tertiary group-hover:text-text-secondary"
                }`}>{shortLbl}</span>
              </button>
            );
          })}
      </div>

      <div className="w-6 h-[1px] bg-white/10 shrink-0 my-1 rounded-full" />

      {/* System Category */}
      <div className="flex flex-wrap justify-center gap-1 w-full px-1 shrink-0 pb-1">
        <div className="flex shrink-0 items-center justify-center rounded-lg hover:bg-white/6" style={{ minWidth: 44, minHeight: 44 }}>
          <ThemeToggle
            variant="icon-only"
            className="text-text-tertiary hover:text-text-secondary w-full h-full rounded-lg"
          />
        </div>
        <button onClick={onToggleAdvancedPanels}
          className="flex shrink-0 items-center justify-center rounded-lg transition-all hover:bg-white/6"
          style={{ minWidth: 44, minHeight: 44 }}
          title={showAdvancedPanels ? L4(lang, { ko: "확장 패널 숨기기", en: "Hide advanced panels" }) : L4(lang, { ko: "모든 패널 보기", en: "Show all panels" })}
          aria-label={showAdvancedPanels ? L4(lang, { ko: "확장 패널 숨기기", en: "Hide advanced panels" }) : L4(lang, { ko: "모든 패널 보기", en: "Show all panels" })}>
          <ChevronRight className={`h-[18px] w-[18px] text-text-tertiary transition-transform ${showAdvancedPanels ? "rotate-180" : ""}`} />
        </button>
        <button onClick={onToggleSettings}
          className="flex shrink-0 items-center justify-center rounded-lg transition-all hover:bg-white/6"
          style={{ minWidth: 44, minHeight: 44 }}
          title={L4(lang, { ko: "설정", en: "Settings" })}
          aria-label={L4(lang, { ko: "설정", en: "Settings" })}>
          <Settings className={`h-[18px] w-[18px] ${showSettings ? "text-accent-amber" : "text-text-tertiary hover:text-text-secondary"}`} />
        </button>
      </div>
    </div>
  );
});

// IDENTITY_SEAL: PART-2 | role=ActivityBar | inputs=panelState | outputs=ActivityBarUI

// ============================================================
// PART 3 — Right Panel Renderer
// ============================================================

function renderRightPanel(
  panel: NonNullable<RightPanel>,
  props: ScopePanelManagerProps,
  problemFindings: ProblemFinding[],
): React.ReactNode {
  const {
    onSetRightPanel, files, openFiles, activeFile, activeFileId,
    pipelineStages, pipelineScore, stressReport, isStressTesting,
    verificationResult, isVerifying, verificationScore, currentVerifyRound,
    composerMode, onComposerTransition, panels,
    onFileSelect, onApplyCode, onSetDiffState, fsUpdateContent,
    onSetOpenFiles, onSetFiles, handleRunStressTest, handleRunVerification,
    editorNavigateToLine, toast, onApproveFile, onOverrideFile, onRejectFile, stagedFiles, guardFindingsByFile,
  } = props;

  switch (panel) {
    case "quick-verify":
      return (
      <PI.QuickVerifyComponent
        onStartVerify={(code: string, mode: string) => {
          // 검증 전용: 코드를 에이전트 태스크로 전달 + 검증 모드 표시
          const task = mode === "verify"
            ? `## Code Verification Request\n\nReview the following code for security vulnerabilities, performance issues, memory leaks, dead code, and convention violations.\n\n\`\`\`\n${code}\n\`\`\``
            : code;
          localStorage.setItem("eh-cs-agent-task", task);
          localStorage.setItem("eh-cs-agent-mode", mode);
          onSetRightPanel("agents");
          toast(mode === "verify" ? "검증 에이전트로 이동합니다." : "생성 + 검증을 시작합니다.", "success");
        }}
        onEasyMode={() => onSetRightPanel("project-spec")}
        onClose={() => onSetRightPanel(null)}
      />
    );
    case "project-spec":
      return (
      <PI.ProjectSpecFormComponent
        onComplete={(spec: ProjectSpecFormData) => {
          const coreSpec = toCoreProjectSpec(spec);
          saveProjectSpec(coreSpec);
          const chatSeed = buildProjectSpecChatSeed(coreSpec, spec);
          localStorage.setItem(CODE_STUDIO_SPEC_CHAT_SEED_KEY, chatSeed);
          // 에이전트 파이프라인용 태스크도 저장
          localStorage.setItem("eh-cs-agent-task", chatSeed);
          toast("명세서 저장 완료. 에이전트 파이프라인으로 이동합니다.", "success");
          onSetRightPanel("agents");
        }}
        onClose={() => onSetRightPanel(null)}
      />
    );
    case "chat":
      return (
      <PI.ChatPanelComponent
        activeFileContent={activeFile?.content}
        activeFileName={activeFile?.name}
        activeFileLanguage={activeFile?.language}
        allFileNames={openFiles.map(f => f.name)}
        onApplyCode={onApplyCode}
        onOpenSettings={() => onSetRightPanel("api-config" as RightPanel)}
      />
    );
    case "pipeline":
      return (() => {
      const pipelineResult = pipelineStages.length > 0 ? {
        stages: pipelineStages.map((s) => ({
          stage: s.name, status: s.status, score: s.score ?? 0,
          findings: s.message ? [{ severity: s.status === "fail" ? "critical" as const : "minor" as const, message: s.message, rule: s.name }] : [],
        })),
        overallScore: pipelineScore ?? 0,
        overallStatus: ((pipelineScore ?? 0) >= 80 ? "pass" : (pipelineScore ?? 0) >= 60 ? "warn" : "fail") as "pass" | "warn" | "fail",
        timestamp: Date.now(),
      } : null;
      return <PI.PipelinePanelComponent result={pipelineResult} />;
    })();
    case "git":
      return <PI.GitPanelComponent files={files} openFiles={openFiles} onRestore={(fid: string, content: string) => {
      onSetOpenFiles((prev) => prev.map((f) => f.id === fid ? { ...f, content, isDirty: true } : f));
      fsUpdateContent(fid, content);
    }} onClearDirty={() => onSetOpenFiles((prev) => prev.map((f) => ({ ...f, isDirty: false })))} />;
    case "deploy":
      return <PI.DeployPanelComponent files={files} language="EN" />;
    case "bugs":
      return <PI.ProblemsPanelComponent findings={problemFindings} />;
    case "autopilot":
      return (
      <PI.AutopilotPanelComponent
        code={activeFile?.content ?? ""}
        language={activeFile?.language ?? "plaintext"}
        fileName={activeFile?.name ?? "untitled"}
        onComplete={(result) => {
          if (result && result.files?.length > 0) {
            for (const f of result.files) {
              if (f.content && activeFileId) {
                const newContent = f.content;
                fsUpdateContent(activeFileId, newContent);
                onSetOpenFiles((prev) => prev.map((file) => file.id === activeFileId ? { ...file, content: newContent, isDirty: true } : file));
              }
            }
            toast(`Autopilot applied to ${result.files.length} file(s)`, "success");
          }
        }}
        onClose={() => onSetRightPanel(null)}
      />
    );
    case "agents":
      return (
      <PI.AgentPanelComponent
        code={activeFile?.content ?? ""}
        language={activeFile?.language ?? "plaintext"}
        fileName={activeFile?.name ?? "untitled"}
        onApplyCode={onApplyCode}
        onOpenPreview={() => onSetRightPanel("preview")}
      />
    );
    case "search":
      return (
      <PI.SearchPanelComponent
        files={files}
        onOpenFile={(name: string) => {
          const node = findFileNodeByName(files, name);
          if (node) onFileSelect(node);
        }}
        onClose={() => onSetRightPanel(null)}
      />
    );
    case "composer":
      return (
      <PI.ComposerPanelComponent
        files={files}
        composerMode={composerMode}
        onCompose={async (fileIds: string[], _instruction: string) => {
          onComposerTransition('generating' as ComposerMode);
          const result = fileIds.map((fid) => {
            const f = openFiles.find((of) => of.id === fid);
            return { fileId: fid, fileName: f?.name ?? fid, original: f?.content ?? "", modified: f?.content ?? "", status: "pending" as const };
          });
          onComposerTransition('verifying' as ComposerMode);
          return result;
        }}
        onApplyChanges={(changes: Array<{ fileId: string; original?: string; modified: string; fileName?: string; language?: string }>) => {
          onComposerTransition('staged' as ComposerMode);
          for (const c of changes) {
            const prev = openFiles.find((f) => f.id === c.fileId)?.content ?? c.original ?? "";
            const name = c.fileName ?? openFiles.find((f) => f.id === c.fileId)?.name ?? c.fileId;
            // Soft gate: confirm override if blocked by diff-guard.
            try {
              const decision = runApplyGuard({ original: prev, modified: c.modified, fileName: name, language: c.language });
              if (decision.status === "fail") {
                const msg = `diff-guard blocked apply for ${name}.\n\n${decision.findings.slice(0, 5).map((f: Finding) => `- ${f.message}`).join("\n")}\n\nOverride apply?`;
                const ok = typeof window !== "undefined" ? window.confirm(msg) : false;
                if (!ok) continue;
              }
            } catch { /* guard is best-effort for composer path */ }
            onSetOpenFiles((prev) => prev.map((f) => f.id === c.fileId ? { ...f, content: c.modified, isDirty: true } : f));
            fsUpdateContent(c.fileId, c.modified);
          }
          onComposerTransition('applied' as ComposerMode);
          onComposerTransition('idle' as ComposerMode);
          toast(`Applied ${changes.length} file(s)`, "success");
        }}
        onPreviewDiff={(change: { original: string; modified: string; fileName: string }) => {
          onComposerTransition('review' as ComposerMode);
          onSetDiffState({ original: change.original, modified: change.modified, fileName: change.fileName });
        }}
      />
    );
    case "review":
      return (() => {
      const effectiveScore = verificationResult?.finalScore ?? pipelineScore ?? 0;
      const effectiveStatus = verificationResult?.finalStatus ?? ((pipelineScore ?? 0) >= 80 ? "pass" : (pipelineScore ?? 0) >= 60 ? "warn" : "fail") as "pass" | "warn" | "fail";
      return (
        <PI.ReviewCenterComponent
          pipelineResult={pipelineStages.length > 0 ? {
            stages: pipelineStages.map((s) => ({
              stage: s.name, status: s.status, score: s.score ?? 0,
              findings: s.message ? [{ severity: s.status === "fail" ? "critical" as const : "minor" as const, message: s.message, rule: s.name }] : [],
            })),
            overallScore: effectiveScore,
            overallStatus: effectiveStatus,
            timestamp: Date.now(),
          } : null}
          files={Object.entries(stagedFiles || {}).map(([name]) => ({
            name,
            status: "pending",
            comments: [],
            findings: [
              ...(guardFindingsByFile?.[name] ?? []),
              { severity: "info" as const, message: "Self-repair fix staged for review", line: 0 },
            ]
          }))}
          onApproveFile={onApproveFile}
          onOverrideFile={onOverrideFile}
          onRejectFile={onRejectFile}
        />
      );
    })();
    case "preview":
      return <PI.PreviewPanelComponent files={files} visible={panel === "preview"} />;
    case "outline":
      return (
      <PI.OutlinePanelComponent
        code={activeFile?.content ?? ""}
        language={activeFile?.language ?? "plaintext"}
        onNavigate={editorNavigateToLine}
      />
    );
    case "templates":
      return <PI.TemplateGalleryComponent onSelectTemplate={(template) => {
      if (template?.files) {
        for (const f of template.files) {
          const node: FileNode = { id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, type: "file", content: f.content };
          onSetFiles((prev) => [...prev, node]);
        }
        toast(`Template "${template.name}" loaded`, "success");
      }
      onSetRightPanel(null);
    }} onClose={() => onSetRightPanel(null)} />;
    case "settings-panel":
      return <PI.SettingsPanelComponent />;
    case "packages":
      return <PI.PackagePanelComponent files={files} />;
    case "evaluation":
      return <PI.EvaluationPanelComponent files={files} onClose={() => onSetRightPanel(null)} />;
    case "collab":
      return <PI.CollabPanelComponent onClose={() => onSetRightPanel(null)} />;
    case "creator":
      return (
      <PI.CodeCreatorPanelComponent
        onMerge={(createdFiles: Array<{ path: string; content: string }>) => {
          for (const f of createdFiles) {
            const node: FileNode = { id: `created-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: f.path.split("/").pop() ?? "file.ts", type: "file", content: f.content };
            onSetFiles((prev) => [...prev, node]);
            onSetOpenFiles((prev) => [...prev, { id: node.id, name: node.name, content: f.content, language: detectLanguage(node.name) }]);
          }
          toast(`Created ${createdFiles.length} file(s)`, "success");
        }}
        onClose={() => onSetRightPanel(null)}
      />
    );
    case "terminal-panel":
      return <PI.TerminalPanelComponent files={files} />;
    case "multi-terminal":
      return <PI.MultiTerminalComponent />;
    case "database":
      return <PI.DatabasePanelComponent connections={panels.dbConnections} onConnect={panels.handleDbConnect} onExecuteQuery={panels.handleDbQuery} tables={panels.dbTables} />;
    case "diff-editor":
      return <PI.DiffEditorPanelComponent original="" modified="" />;
    case "git-graph":
      return <PI.GitGraphComponent commits={[]} branches={[]} currentBranch="main" />;
    case "ai-hub":
      return <PI.AIHubComponent features={panels.aiFeatures} onToggleFeature={panels.toggleAiFeature} onConfigureProvider={() => onSetRightPanel("api-config" as RightPanel)} />;
    case "ai-workspace":
      return <PI.AIWorkspaceComponent threads={panels.wsThreads} sharedMemory={panels.wsSharedMemory} onSendMessage={panels.sendWsMessage} onCreateThread={panels.createWsThread} onDeleteThread={panels.deleteWsThread} />;
    case "canvas":
      return <PI.CanvasPanelComponent
        onApplyCode={onApplyCode}
        onOpenPreview={(code) => {
          onApplyCode(code, "EHCanvasPreview.tsx");
          onSetRightPanel("preview");
          toast("Previewing generated canvas UI...", "info");
        }}
      />;
    case "progress":
      return (() => {
      const status: "pass" | "warn" | "fail" | undefined = pipelineScore ? (pipelineScore >= 80 ? "pass" : pipelineScore >= 60 ? "warn" : "fail") : undefined;
      return <PI.ProgressDashboardComponent pipelineScore={pipelineScore ?? undefined} pipelineStatus={status} stressReport={stressReport} onRunStress={handleRunStressTest} isStressTesting={isStressTesting} verificationScore={verificationScore ?? undefined} onRunVerification={handleRunVerification} isVerifying={isVerifying} verificationResult={verificationResult} currentVerifyRound={currentVerifyRound} />;
    })();
    case "onboarding":
      return <PI.OnboardingGuideComponent onComplete={() => onSetRightPanel(null)} onSkip={() => onSetRightPanel(null)} />;
    case "merge-conflict":
      return <PI.MergeConflictEditorComponent fileName={activeFile?.name ?? ""} conflicts={panels.mergeConflictsWithResolutions} onResolve={(conflictId: string, resolution: "ours" | "theirs" | "both" | "manual" | undefined, content?: string) => {
      panels.resolveConflict(conflictId, resolution, content);
      if (activeFileId && content) {
        fsUpdateContent(activeFileId, content);
        onSetOpenFiles((prev) => prev.map((f) => f.id === activeFileId ? { ...f, content, isDirty: true } : f));
      }
      toast("Conflict resolved", "success");
    }} />;
    case "project-switcher":
      return <PI.ProjectSwitcherComponent onClose={() => onSetRightPanel(null)} />;
    case "recent-files":
      return <PI.RecentFilesComponent files={panels.recentFiles} onOpen={(fileId: string) => {
      const found = findFileNodeByName(files, fileId);
      if (found) onFileSelect(found);
    }} onClear={() => { panels.clearRecentFiles(); toast("Recent files cleared", "info"); }} />;
    case "symbol-palette":
      return <PI.SymbolPaletteComponent symbols={panels.symbols} onSelect={(symbol) => {
      if (symbol?.line) editorNavigateToLine(symbol.line);
    }} onClose={() => onSetRightPanel(null)} />;
    case "keybindings":
      return <PI.KeybindingsPanelComponent onClose={() => onSetRightPanel(null)} />;
    case "api-config":
      return <PI.APIKeyConfigComponent onClose={() => onSetRightPanel(null)} />;
    case "network-inspector":
      return <PI.PreviewNetworkTabComponent visible={panel === "network-inspector"} onClose={() => onSetRightPanel(null)} />;
    case "code-actions":
      return <PI.QuickActionsComponent selectedText={panels.editorSelection.text} position={{ top: panels.editorSelection.top, left: panels.editorSelection.left }} language={activeFile?.language ?? "plaintext"} onAction={async (actionId: string, contextPrompt?: string) => {
      onSetRightPanel("chat" as RightPanel);
      toast(`Running: ${actionId}`, "info");
      if (activeFile && contextPrompt) {
        try {
          let result = '';
          if (actionId === 'explain') result = await explainCode(activeFile.content, activeFile.language);
          else if (actionId === 'bugs') {
            const lints = await lintCode(activeFile.content, activeFile.language);
            result = lints.map(l => `Line ${l.line}: ${l.message}`).join('\n');
          }
          else if (actionId === 'document') result = await generateDocstring(activeFile.content, activeFile.language);
          if (result) toast(result.slice(0, 100) + '...', 'info');
        } catch { /* AI call failed */ }
      }
    }} onClose={() => onSetRightPanel(null)} />;
    case "model-switcher":
      return <PI.ModelSwitcherComponent />;
    case "audit":
      return <PI.AuditPanelComponent
      files={files.flatMap(function flatFiles(n: typeof files[number]): { path: string; content: string; language: string }[] {
        if (n.type === 'file') return [{ path: n.name, content: n.content ?? '', language: n.language ?? 'plaintext' }];
        return (n.children ?? []).flatMap(flatFiles);
      })}
      onRunAudit={() => {
        import('@/lib/code-studio/audit/audit-engine').then(({ runProjectAudit }) => {
          const ctx = {
            files: files.flatMap(function flatFiles(n: typeof files[number]): { path: string; content: string; language: string }[] {
              if (n.type === 'file') return [{ path: n.name, content: n.content ?? '', language: n.language ?? 'plaintext' }];
              return (n.children ?? []).flatMap(flatFiles);
            }),
            language: 'ko',
          };
          const report = runProjectAudit(ctx);
          toast(`Audit: ${report.totalScore}/100 (${report.totalGrade}) — ${report.totalFindings} findings`, report.hardGateFail ? 'error' : 'success');
        });
      }}
    />;
    case "module-profile":
      return <PI.ModuleProfilePanelComponent />;
    case "cognitive-load":
      return <PI.CognitiveLoadPanelComponent code={activeFile?.content ?? ''} />;
    case "adr":
      return <PI.ADRPanelComponent
      files={files.flatMap(function flatFiles(n: typeof files[number]): string[] {
        if (n.type === 'file') return [n.name];
        return (n.children ?? []).flatMap(flatFiles);
      })}
    />;
    case "code-rhythm":
      return <PI.RhythmPanelComponent code={activeFile?.content ?? ''} />;
    case "migration-audit":
      return <PI.MigrationAuditPanelComponent />;
    case "snippet-market":
      return <PI.SnippetMarketComponent onImportToEditor={undefined} />;
    case "multi-diff":
      return <PI.MultiFileDiffComponent files={openFiles.map(f => ({ path: f.name, original: '', modified: f.content }))} />;
    case "debugger":
      return <PI.DebugPanelComponent />;
    case "naming-dict":
      return <PI.NamingDictPanelComponent />;
    case "dep-graph":
      return <PI.DependencyGraphComponent files={openFiles.reduce<Record<string, string>>((acc, f) => { acc[f.name] = f.content; return acc; }, {})} />;
    case "review-board":
      return <PI.ReviewBoardComponent code={activeFile?.content ?? ''} />;
    default:
      return null;
  }
}

const RightPanelContent = memo(function RightPanelContent(props: ScopePanelManagerProps) {
  const problemFindings = useMemo(
    () => mapBugReportsToProblemFindings(props.bugReports),
    [props.bugReports],
  );

  if (!props.rightPanel) return null;

  const body = renderRightPanel(props.rightPanel, props, problemFindings);
  if (body == null) return null;

  // Parent (Shell) sets width; fill height so flex children (e.g. ChatPanel h-full) work.
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={props.rightPanel}
        initial={{ opacity: 0, x: 6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.08, ease: "easeOut" }}
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-bg-secondary"
      >
        {body}
      </motion.div>
    </AnimatePresence>
  );
});

// IDENTITY_SEAL: PART-3 | role=RightPanelRenderer | inputs=panelPropsMap | outputs=panelUI

// ============================================================
// PART 4 — Bottom Panels
// ============================================================

const BOTTOM_PANEL_MIN_H = 100;
const BOTTOM_PANEL_MAX_VH = 60;

const BottomPanels = memo(function BottomPanels({
  showTerminal, showProblems, showPipelineBottom,
  onToggleTerminal, onToggleProblems, onTogglePipelineBottom,
  onCloseAllBottom, termRef, bugReports, pipelineStages, tcs,
}: {
  showTerminal: boolean;
  showProblems: boolean;
  showPipelineBottom: boolean;
  onToggleTerminal: () => void;
  onToggleProblems: () => void;
  onTogglePipelineBottom: () => void;
  onCloseAllBottom: () => void;
  termRef: React.RefObject<HTMLDivElement | null>;
  bugReports: BugReport[];
  pipelineStages: PipelineStage[];
  tcs: Record<string, string>;
}) {
  const { lang } = useLang();
  const problemFindings = useMemo(
    () => mapBugReportsToProblemFindings(bugReports),
    [bugReports],
  );

  const [panelHeight, setPanelHeight] = useState(320);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = panelHeight;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - ev.clientY;
      const maxH = Math.round(window.innerHeight * BOTTOM_PANEL_MAX_VH / 100);
      const next = Math.min(maxH, Math.max(BOTTOM_PANEL_MIN_H, startH.current + delta));
      setPanelHeight(next);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [panelHeight]);

  if (!showTerminal && !showProblems && !showPipelineBottom) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.1 }}
        className="shrink-0 flex w-full flex-col overflow-hidden bg-bg-primary"
        style={{ height: panelHeight }}
      >
        {/* Drag resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="h-1 w-full shrink-0 border-t border-border hover:bg-accent-purple/30 active:bg-accent-purple/50 transition-colors"
          style={{ cursor: "row-resize" }}
          role="separator"
          aria-orientation="horizontal"
          aria-label={L4(lang, { ko: "패널 크기 조절", en: "Resize panel" })}
          aria-valuenow={panelHeight}
          aria-valuemin={BOTTOM_PANEL_MIN_H}
        />
        <div className="flex shrink-0 items-center gap-1 border-b border-white/8 bg-bg-secondary px-2 py-1">
          <button onClick={onToggleTerminal} title={tcs.consoleTooltip || L4(lang, { ko: "터미널 목록", en: "Terminal List" })} className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors duration-150 ${showTerminal ? "text-accent-green bg-accent-green/10" : "text-text-tertiary hover:text-text-secondary"}`}>{tcs.console || L4(lang, { ko: "터미널", en: "Terminal" })}</button>
          <button onClick={onToggleProblems} className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors duration-150 ${showProblems ? "text-accent-red bg-accent-red/10" : "text-text-tertiary hover:text-text-secondary"}`}>{L4(lang, { ko: "문제", en: "Problems" })} {bugReports.length > 0 ? `(${bugReports.length})` : ""}</button>
          <button onClick={onTogglePipelineBottom} className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors duration-150 ${showPipelineBottom ? "text-accent-blue bg-accent-blue/10" : "text-text-tertiary hover:text-text-secondary"}`}>{L4(lang, { ko: "파이프라인", en: "Pipeline" })}</button>
          <button onClick={onCloseAllBottom} aria-label={L4(lang, { ko: "하단 패널 닫기", en: "Close bottom panel" })} className="ml-auto rounded p-0.5 text-text-tertiary hover:text-text-primary transition-colors duration-150"><X className="h-3 w-3" /></button>
        </div>
        {showTerminal && (
          <div className="flex-1 min-h-0 w-full bg-bg-primary dark:bg-[#0d0d0d]">
            <div ref={termRef} className="h-full w-full" />
          </div>
        )}
        {showProblems && (
          <div className="flex-1 min-h-0 w-full overflow-auto">
            <PI.ProblemsPanelComponent findings={problemFindings} />
          </div>
        )}
        {showPipelineBottom && pipelineStages.length > 0 && (
          <div className="flex-1 min-h-0 w-full overflow-auto p-2">
            {pipelineStages.map((s) => (
              <div key={s.name} className="flex items-center gap-2 py-1 text-[11px] font-mono">
                <span className={`w-2 h-2 rounded-full ${s.status === "pass" ? "bg-accent-green" : s.status === "warn" ? "bg-accent-amber" : s.status === "fail" ? "bg-accent-red" : "bg-white/20"}`} />
                <span className="text-text-secondary flex-1">{s.name}</span>
                <span className="text-text-tertiary">{s.score ?? "-"}</span>
              </div>
            ))}
          </div>
        )}
        </motion.div>
    </AnimatePresence>
  );
});

// IDENTITY_SEAL: PART-4 | role=BottomPanels | inputs=panelToggles | outputs=BottomPanelUI

// ============================================================
// PART 5 — Exported Composite
// ============================================================

export { ActivityBar, RightPanelContent, BottomPanels };
export type { PipelineStage };

// IDENTITY_SEAL: PART-5 | role=Exports | inputs=none | outputs=ActivityBar,RightPanelContent,BottomPanels

