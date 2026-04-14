"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useEffect, useMemo } from "react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import {
  MessageSquare, Terminal, Activity, Settings, Code2, Bot, Columns2,
  Search, AlertTriangle, Bug, Undo2, Redo2, ZoomIn, ZoomOut, Rocket,
} from "lucide-react";

interface MenuItemDef {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
}

interface Props {
  onToggleChat: () => void;
  onToggleTerminal: () => void;
  onTogglePipeline: () => void;
  onToggleAgent: () => void;
  onToggleSidebar?: () => void;
  onToggleSearch?: () => void;
  onNewFile?: () => void;
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
  onToggleProblems?: () => void;
  onRunBugFinder?: () => void;
  onDeploy?: () => void;
  onToggleSplit?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  fontSize?: number;
  showChat: boolean;
  showAgent: boolean;
  showTerminal: boolean;
  showPipeline: boolean;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=Props,MenuItemDef

// ============================================================
// PART 2 — ToolbarMenu Sub-component
// ============================================================

function ToolbarMenu({ label, items }: { label: string; items: MenuItemDef[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="px-2 py-1 rounded text-xs text-text-secondary hover:bg-bg-secondary/60 hover:text-text-primary transition-colors">{label}</button>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 z-50 min-w-[200px] bg-bg-primary border border-border rounded-lg shadow-xl py-1 backdrop-blur-xl">
          {items.map((item, i) => item.divider ? (
            <div key={i} className="h-px bg-border my-1" />
          ) : (
            <button key={i} onClick={() => { item.action?.(); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-secondary/60 hover:text-text-primary transition-colors">
              <span>{item.label}</span>
              {item.shortcut && <kbd className="text-[10px] text-text-tertiary font-mono">{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=Menu | inputs=label,items | outputs=JSX

// ============================================================
// PART 3 — Toolbar Component
// ============================================================

function ToolbarButton({ icon, label, active, onClick, accent = "purple" }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; accent?: "purple" | "green" | "blue";
}) {
  const colors = {
    purple: "bg-accent-amber/15 text-accent-amber",
    green: "bg-accent-green/15 text-accent-green",
    blue: "bg-accent-purple/15 text-accent-purple",
  };
  return (
    <button onClick={onClick} title={label} aria-label={label} aria-pressed={active}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${active ? colors[accent] : "text-text-secondary hover:bg-bg-secondary/60 hover:text-text-primary"}`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function Toolbar({
  onToggleChat, onToggleTerminal, onTogglePipeline, onToggleAgent,
  onToggleSidebar, onToggleSearch, onNewFile, onOpenSettings,
  onOpenPalette, onToggleProblems, onRunBugFinder, onDeploy, onToggleSplit,
  onUndo, onRedo, onZoomIn, onZoomOut, onZoomReset, fontSize,
  showChat, showAgent, showTerminal, showPipeline,
}: Props) {
  const { lang } = useLang();

  const _menus = useMemo(() => ({
    file: [
      { label: L4(lang, { ko: "새 파일", en: "New File", ja: "新しいファイル", zh: "新建文件" }), shortcut: "Ctrl+N", action: onNewFile },
      { label: L4(lang, { ko: "커맨드 팔레트", en: "Command Palette", ja: "コマンドパレット", zh: "命令面板" }), shortcut: "Ctrl+Shift+P", action: onOpenPalette },
      { divider: true, label: "" },
      { label: L4(lang, { ko: "설정", en: "Settings", ja: "設定", zh: "设置" }), action: onOpenSettings },
    ],
    edit: [
      { label: L4(lang, { ko: "실행 취소", en: "Undo", ja: "元に戻す", zh: "撤销" }), shortcut: "Ctrl+Z", action: onUndo },
      { label: L4(lang, { ko: "다시 실행", en: "Redo", ja: "やり直し", zh: "重做" }), shortcut: "Ctrl+Y", action: onRedo },
      { divider: true, label: "" },
      { label: L4(lang, { ko: "전역 검색", en: "Global Search", ja: "グローバル検索", zh: "全局搜索" }), shortcut: "Ctrl+Shift+F", action: onToggleSearch },
    ],
    view: [
      { label: L4(lang, { ko: "사이드바 토글", en: "Toggle Sidebar", ja: "サイドバー切替", zh: "切换侧边栏" }), shortcut: "Ctrl+B", action: onToggleSidebar },
      { label: L4(lang, { ko: "터미널 토글", en: "Toggle Terminal", ja: "ターミナル切替", zh: "切换终端" }), shortcut: "Ctrl+`", action: onToggleTerminal },
      { label: L4(lang, { ko: "분할 보기", en: "Split View", ja: "分割表示", zh: "分屏视图" }), action: onToggleSplit },
    ],
    ai: [
      { label: L4(lang, { ko: "EH 챗", en: "EH Chat", ja: "AIチャット", zh: "AI 聊天" }), shortcut: "Ctrl+L", action: onToggleChat },
      { label: L4(lang, { ko: "에이전트", en: "Agent", ja: "エージェント", zh: "智能体" }), shortcut: "Ctrl+I", action: onToggleAgent },
      { divider: true, label: "" },
      { label: L4(lang, { ko: "파이프라인", en: "Pipeline", ja: "パイプライン", zh: "流水线" }), shortcut: "Ctrl+Shift+Enter", action: onTogglePipeline },
      { label: L4(lang, { ko: "버그 파인더", en: "Bug Finder", ja: "バグファインダー", zh: "查找 Bug" }), action: onRunBugFinder },
    ]
  }), [lang, onNewFile, onOpenPalette, onOpenSettings, onUndo, onRedo, onToggleSearch, onToggleSidebar, onToggleTerminal, onToggleSplit, onToggleChat, onToggleAgent, onTogglePipeline, onRunBugFinder]);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-bg-primary border-b border-border">
      <div className="flex items-center gap-2">
        <Code2 size={18} className="text-accent-amber" />
        <span className="text-sm font-bold tracking-tight text-text-primary">EH <span className="text-accent-amber">Code</span></span>
      </div>
      <div className="flex items-center gap-0.5 text-xs">
        <ToolbarMenu label={L4(lang, { ko: "파일", en: "File", ja: "ファイル", zh: "文件" })} items={[
          { label: L4(lang, { ko: "새 파일", en: "New File", ja: "新しいファイル", zh: "新建文件" }), shortcut: "Ctrl+N", action: onNewFile },
          { label: L4(lang, { ko: "커맨드 팔레트", en: "Command Palette", ja: "コマンドパレット", zh: "命令面板" }), shortcut: "Ctrl+Shift+P", action: onOpenPalette },
          { divider: true, label: "" },
          { label: L4(lang, { ko: "설정", en: "Settings", ja: "設定", zh: "设置" }), action: onOpenSettings },
        ]} />
        <ToolbarMenu label={L4(lang, { ko: "편집", en: "Edit", ja: "編集", zh: "编辑" })} items={[
          { label: L4(lang, { ko: "실행 취소", en: "Undo", ja: "元に戻す", zh: "撤销" }), shortcut: "Ctrl+Z", action: onUndo },
          { label: L4(lang, { ko: "다시 실행", en: "Redo", ja: "やり直し", zh: "重做" }), shortcut: "Ctrl+Y", action: onRedo },
          { divider: true, label: "" },
          { label: L4(lang, { ko: "전역 검색", en: "Global Search", ja: "グローバル検索", zh: "全局搜索" }), shortcut: "Ctrl+Shift+F", action: onToggleSearch },
        ]} />
        <ToolbarMenu label={L4(lang, { ko: "보기", en: "View", ja: "表示", zh: "视图" })} items={[
          { label: L4(lang, { ko: "사이드바 토글", en: "Toggle Sidebar", ja: "サイドバー切替", zh: "切换侧边栏" }), shortcut: "Ctrl+B", action: onToggleSidebar },
          { label: L4(lang, { ko: "터미널 토글", en: "Toggle Terminal", ja: "ターミナル切替", zh: "切换终端" }), shortcut: "Ctrl+`", action: onToggleTerminal },
          { label: L4(lang, { ko: "분할 보기", en: "Split View", ja: "分割表示", zh: "分屏视图" }), action: onToggleSplit },
        ]} />
        <ToolbarMenu label={L4(lang, { ko: "EH 엔진", en: "EH 엔진", ja: "EH 엔진", zh: "EH 엔진" })} items={[
          { label: L4(lang, { ko: "EH 챗", en: "EH Chat", ja: "AIチャット", zh: "AI 聊天" }), shortcut: "Ctrl+L", action: onToggleChat },
          { label: L4(lang, { ko: "에이전트", en: "Agent", ja: "エージェント", zh: "智能体" }), shortcut: "Ctrl+I", action: onToggleAgent },
          { divider: true, label: "" },
          { label: L4(lang, { ko: "파이프라인", en: "Pipeline", ja: "パイプライン", zh: "流水线" }), shortcut: "Ctrl+Shift+Enter", action: onTogglePipeline },
          { label: L4(lang, { ko: "버그 파인더", en: "Bug Finder", ja: "バグファインダー", zh: "查找 Bug" }), action: onRunBugFinder },
        ]} />
        <div className="w-px h-4 bg-border mx-1" />
        <button onClick={onUndo} title={L4(lang, { ko: "실행 취소 (Ctrl+Z)", en: "Undo (Ctrl+Z)", ja: "元に戻す (Ctrl+Z)", zh: "撤销 (Ctrl+Z)" })} aria-label={L4(lang, { ko: "실행 취소", en: "Undo", ja: "元に戻す", zh: "撤销" })} className="p-2 rounded hover:bg-bg-secondary/60 text-text-secondary transition-colors"><Undo2 size={14} /></button>
        <button onClick={onRedo} title={L4(lang, { ko: "다시 실행 (Ctrl+Y)", en: "Redo (Ctrl+Y)", ja: "やり直し (Ctrl+Y)", zh: "重做 (Ctrl+Y)" })} aria-label={L4(lang, { ko: "다시 실행", en: "Redo", ja: "やり直し", zh: "重做" })} className="p-2 rounded hover:bg-bg-secondary/60 text-text-secondary transition-colors"><Redo2 size={14} /></button>
        <div className="w-px h-4 bg-border mx-1" />
        <button onClick={onZoomOut} title={L4(lang, { ko: "축소 (Ctrl+-)", en: "Zoom Out (Ctrl+-)", ja: "縮小 (Ctrl+-)", zh: "缩小 (Ctrl+-)" })} aria-label={L4(lang, { ko: "축소", en: "Zoom Out", ja: "縮小", zh: "缩小" })} className="p-2 rounded hover:bg-bg-secondary/60 text-text-secondary transition-colors"><ZoomOut size={14} /></button>
        {fontSize != null && <button onClick={onZoomReset} title={L4(lang, { ko: "글꼴 크기 초기화", en: "Reset zoom", ja: "ズームリセット", zh: "重置缩放" })} aria-label={L4(lang, { ko: "글꼴 크기 초기화", en: "Reset zoom", ja: "ズームリセット", zh: "重置缩放" })} className="px-1.5 text-[10px] text-text-tertiary hover:bg-bg-secondary/60 rounded transition-colors">{fontSize}px</button>}
        <button onClick={onZoomIn} title={L4(lang, { ko: "확대 (Ctrl+=)", en: "Zoom In (Ctrl+=)", ja: "拡大 (Ctrl+=)", zh: "放大 (Ctrl+=)" })} aria-label={L4(lang, { ko: "확대", en: "Zoom In", ja: "拡大", zh: "放大" })} className="p-2 rounded hover:bg-bg-secondary/60 text-text-secondary transition-colors"><ZoomIn size={14} /></button>
      </div>
      <div className="flex items-center gap-1">
        <ToolbarButton icon={<Search size={14} />} label={L4(lang, { ko: "검색", en: "Search", ja: "検索", zh: "搜索" })} active={false} onClick={() => onToggleSearch?.()} />
        <ToolbarButton icon={<Activity size={14} />} label={L4(lang, { ko: "파이프라인", en: "Pipeline", ja: "パイプライン", zh: "流水线" })} active={showPipeline} onClick={onTogglePipeline} />
        <ToolbarButton icon={<AlertTriangle size={14} />} label={L4(lang, { ko: "문제", en: "Problems", ja: "問題", zh: "问题" })} active={false} onClick={() => onToggleProblems?.()} />
        <ToolbarButton icon={<Bug size={14} />} label={L4(lang, { ko: "버그", en: "Bugs", ja: "バグ", zh: "Bug" })} active={false} onClick={() => onRunBugFinder?.()} accent="green" />
        <ToolbarButton icon={<Terminal size={14} />} label={L4(lang, { ko: "터미널", en: "Terminal", ja: "ターミナル", zh: "终端" })} active={showTerminal} onClick={onToggleTerminal} />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton icon={<MessageSquare size={14} />} label={L4(lang, { ko: "채팅", en: "Chat", ja: "チャット", zh: "聊天" })} active={showChat} onClick={onToggleChat} accent="blue" />
        <ToolbarButton icon={<Bot size={14} />} label={L4(lang, { ko: "에이전트", en: "Agent", ja: "エージェント", zh: "智能体" })} active={showAgent} onClick={onToggleAgent} accent="green" />
        <ToolbarButton icon={<Columns2 size={14} />} label={L4(lang, { ko: "분할", en: "Split", ja: "分割", zh: "分屏" })} active={false} onClick={() => onToggleSplit?.()} />
        <ToolbarButton icon={<Rocket size={14} />} label={L4(lang, { ko: "배포", en: "Deploy", ja: "デプロイ", zh: "部署" })} active={false} onClick={() => onDeploy?.()} accent="green" />
        <div className="w-px h-4 bg-border mx-1" />
        <button onClick={onOpenSettings} aria-label={L4(lang, { ko: "설정 열기", en: "Open Settings", ja: "設定を開く", zh: "打开设置" })} className="p-2 rounded hover:bg-bg-secondary/60 text-text-secondary"><Settings size={14} /></button>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=Component | inputs=Props | outputs=JSX
