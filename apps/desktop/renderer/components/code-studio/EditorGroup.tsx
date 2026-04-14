"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  X, Columns, Rows, LayoutGrid, Maximize2, Minimize2,
  SplitSquareHorizontal, SplitSquareVertical, FileCode,
} from "lucide-react";
import type { OpenFile } from "@noa/quill-engine/types";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export type SplitDirection = "horizontal" | "vertical" | "quad";

export interface EditorPane {
  id: string;
  files: OpenFile[];
  activeFileId: string | null;
  size: number;
}

export interface EditorGroupState {
  panes: EditorPane[];
  direction: SplitDirection;
  focusedPaneId: string | null;
  maximizedPaneId: string | null;
}

interface Props {
  openFiles: OpenFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
  /** Render the editor content for a given pane */
  renderEditor?: (pane: EditorPane, isFocused: boolean) => React.ReactNode;
}

// IDENTITY_SEAL: PART-1 | role=TypeDefs | inputs=none | outputs=SplitDirection,EditorPane,EditorGroupState,Props

// ============================================================
// PART 2 — Helpers
// ============================================================

let paneIdCounter = 0;
function generatePaneId(): string {
  return `pane-${++paneIdCounter}-${Date.now()}`;
}

function createPane(files: OpenFile[] = [], activeFileId: string | null = null): EditorPane {
  return {
    id: generatePaneId(),
    files,
    activeFileId: activeFileId ?? (files.length > 0 ? files[0].id : null),
    size: 50,
  };
}

// IDENTITY_SEAL: PART-2 | role=PaneFactory | inputs=OpenFile[] | outputs=EditorPane

// ============================================================
// PART 3 — Pane Tab Bar
// ============================================================

function PaneTabBar({
  pane, isFocused, onSelectFile, onCloseFile, onContextMenu, onDoubleClickTab,
  onDragStart, onDrop,
}: {
  pane: EditorPane; isFocused: boolean;
  onSelectFile: (fileId: string) => void;
  onCloseFile: (fileId: string) => void;
  onContextMenu: (e: React.MouseEvent, fileId: string) => void;
  onDoubleClickTab: () => void;
  onDragStart: (e: React.DragEvent, fileId: string) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      role="tablist"
      className={`flex items-center border-b overflow-x-auto
        ${isFocused ? "border-amber-700/45 bg-[#0a0e17]/80" : "border-white/8 bg-[#0a0e17]/50"}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={onDrop}
    >
      {pane.files.map((f) => (
        <button
          key={f.id}
          role="tab"
          aria-selected={f.id === pane.activeFileId}
          draggable
          onDragStart={(e) => onDragStart(e, f.id)}
          onClick={() => onSelectFile(f.id)}
          onDoubleClick={onDoubleClickTab}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, f.id); }}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs border-r border-white/8 whitespace-nowrap transition-colors cursor-grab active:cursor-grabbing
            ${f.id === pane.activeFileId
              ? "bg-white/5 text-text-primary"
              : "text-text-tertiary hover:bg-white/5"}`}
        >
          <span>{f.name}</span>
          {f.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
          <span
            onClick={(e) => { e.stopPropagation(); onCloseFile(f.id); }}
            className="hover:text-red-400 cursor-pointer"
          >
            <X size={12} />
          </span>
        </button>
      ))}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=PaneTabBar | inputs=EditorPane | outputs=tab-list-JSX

// ============================================================
// PART 4 — Pane Context Menu
// ============================================================

function PaneContextMenu({
  state, onClose, onSplitRight, onSplitDown, onCloseGroup, onMoveToPane, availablePanes,
}: {
  state: { x: number; y: number; paneId: string; fileId: string };
  onClose: () => void;
  onSplitRight: (paneId: string, fileId: string) => void;
  onSplitDown: (paneId: string, fileId: string) => void;
  onCloseGroup: (paneId: string) => void;
  onMoveToPane: (from: string, fileId: string, to: string) => void;
  availablePanes: EditorPane[];
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const otherPanes = availablePanes.filter((p) => p.id !== state.paneId);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[#0a0e17] border border-white/8 rounded-lg shadow-2xl py-1 min-w-[180px]"
      style={{ left: state.x, top: state.y }}
    >
      <button
        onClick={() => { onSplitRight(state.paneId, state.fileId); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 flex items-center gap-2"
      >
        <SplitSquareHorizontal size={12} /> Split Right
      </button>
      <button
        onClick={() => { onSplitDown(state.paneId, state.fileId); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 flex items-center gap-2"
      >
        <SplitSquareVertical size={12} /> Split Down
      </button>
      {otherPanes.length > 0 && (
        <>
          <div className="h-px bg-white/8 my-1" />
          {otherPanes.map((pane) => (
            <button
              key={pane.id}
              onClick={() => { onMoveToPane(state.paneId, state.fileId, pane.id); onClose(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 flex items-center gap-2"
            >
              Move to Group {pane.id.slice(-5)}
            </button>
          ))}
        </>
      )}
      <div className="h-px bg-white/8 my-1" />
      <button
        onClick={() => { onCloseGroup(state.paneId); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
      >
        <X size={12} /> Close Group
      </button>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=PaneContextMenu | inputs=state,callbacks | outputs=context-menu-JSX

// ============================================================
// PART 5 — Resize Handle
// ============================================================

function ResizeHandle({
  direction, onResize,
}: {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPos = direction === "horizontal" ? e.clientX : e.clientY;

      const handleMouseMove = (ev: MouseEvent) => {
        const current = direction === "horizontal" ? ev.clientX : ev.clientY;
        onResize(current - startPos);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [direction, onResize],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`shrink-0 bg-white/5 hover:bg-amber-900/35 transition-colors
        ${direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"}`}
    />
  );
}

// IDENTITY_SEAL: PART-5 | role=ResizeHandle | inputs=direction,onResize | outputs=draggable-resize-bar

// ============================================================
// PART 6 — Main EditorGroup Component
// ============================================================

export function EditorGroup({
  openFiles, activeFileId, onSelectFile, onCloseFile, renderEditor,
}: Props) {
  const [state, setState] = useState<EditorGroupState>(() => ({
    panes: [createPane(openFiles, activeFileId)],
    direction: "horizontal",
    focusedPaneId: null,
    maximizedPaneId: null,
  }));

  const { lang } = useLang();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; paneId: string; fileId: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync openFiles into first pane when single-pane mode
  const [prevSync, setPrevSync] = useState({ openFiles, activeFileId });
  if (
    state.panes.length === 1 &&
    (prevSync.openFiles !== openFiles || prevSync.activeFileId !== activeFileId)
  ) {
    setPrevSync({ openFiles, activeFileId });
    setState((prev) => ({
      ...prev,
      panes: [{ ...prev.panes[0], files: openFiles, activeFileId }],
    }));
  }

  // Split right
  const handleSplitRight = useCallback((paneId: string, fileId: string) => {
    if (state.panes.length >= 4) return;
    setState((prev) => {
      const src = prev.panes.find((p) => p.id === paneId);
      if (!src) return prev;
      const file = src.files.find((f) => f.id === fileId);
      if (!file) return prev;

      const updSrc: EditorPane = {
        ...src,
        files: src.files.filter((f) => f.id !== fileId),
        activeFileId: src.activeFileId === fileId
          ? src.files.find((f) => f.id !== fileId)?.id ?? null
          : src.activeFileId,
      };
      const newPane = createPane([file], file.id);
      const panes = prev.panes.map((p) => (p.id === paneId ? updSrc : p)).filter((p) => p.files.length > 0);
      panes.push(newPane);
      const size = 100 / panes.length;
      return { ...prev, panes: panes.map((p) => ({ ...p, size })), direction: prev.direction === "quad" ? "quad" : "horizontal", focusedPaneId: newPane.id };
    });
  }, [state.panes.length]);

  // Split down
  const handleSplitDown = useCallback((paneId: string, fileId: string) => {
    if (state.panes.length >= 4) return;
    setState((prev) => {
      const src = prev.panes.find((p) => p.id === paneId);
      if (!src) return prev;
      const file = src.files.find((f) => f.id === fileId);
      if (!file) return prev;

      const updSrc: EditorPane = {
        ...src,
        files: src.files.filter((f) => f.id !== fileId),
        activeFileId: src.activeFileId === fileId
          ? src.files.find((f) => f.id !== fileId)?.id ?? null
          : src.activeFileId,
      };
      const newPane = createPane([file], file.id);
      const panes = prev.panes.map((p) => (p.id === paneId ? updSrc : p)).filter((p) => p.files.length > 0);
      panes.push(newPane);
      const size = 100 / panes.length;
      return { ...prev, panes: panes.map((p) => ({ ...p, size })), direction: prev.panes.length >= 2 ? "quad" : "vertical", focusedPaneId: newPane.id };
    });
  }, [state.panes.length]);

  // Keyboard: Ctrl+1..4 focus pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 4 && num <= state.panes.length) {
          e.preventDefault();
          setState((prev) => ({ ...prev, focusedPaneId: prev.panes[num - 1].id }));
          return;
        }
        if (e.key === "\\") {
          e.preventDefault();
          const focusId = state.focusedPaneId ?? state.panes[0]?.id;
          const focusPane = state.panes.find((p) => p.id === focusId);
          if (focusPane?.activeFileId) handleSplitRight(focusId, focusPane.activeFileId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.panes, state.focusedPaneId, handleSplitRight]);

  // Close group
  const handleCloseGroup = useCallback((paneId: string) => {
    setState((prev) => {
      const remaining = prev.panes.filter((p) => p.id !== paneId);
      if (remaining.length === 0) return { ...prev, panes: [createPane()], direction: "horizontal" as SplitDirection, focusedPaneId: null };
      const size = 100 / remaining.length;
      return { ...prev, panes: remaining.map((p) => ({ ...p, size })), focusedPaneId: remaining[0].id };
    });
  }, []);

  // Move file between panes
  const handleMoveToPane = useCallback((fromId: string, fileId: string, toId: string) => {
    setState((prev) => {
      const src = prev.panes.find((p) => p.id === fromId);
      const tgt = prev.panes.find((p) => p.id === toId);
      if (!src || !tgt) return prev;
      const file = src.files.find((f) => f.id === fileId);
      if (!file || tgt.files.some((f) => f.id === fileId)) return prev;

      const updSrc: EditorPane = {
        ...src, files: src.files.filter((f) => f.id !== fileId),
        activeFileId: src.activeFileId === fileId ? src.files.find((f) => f.id !== fileId)?.id ?? null : src.activeFileId,
      };
      const updTgt: EditorPane = { ...tgt, files: [...tgt.files, file], activeFileId: file.id };

      let panes = prev.panes.map((p) => {
        if (p.id === fromId) return updSrc;
        if (p.id === toId) return updTgt;
        return p;
      }).filter((p) => p.files.length > 0);
      if (panes.length === 0) panes = [createPane()];
      const size = 100 / panes.length;
      return { ...prev, panes: panes.map((p) => ({ ...p, size })), focusedPaneId: toId };
    });
  }, []);

  // Select/close file within pane
  const handlePaneSelect = useCallback((paneId: string, fileId: string) => {
    setState((prev) => ({
      ...prev,
      panes: prev.panes.map((p) => p.id === paneId ? { ...p, activeFileId: fileId } : p),
      focusedPaneId: paneId,
    }));
    onSelectFile(fileId);
  }, [onSelectFile]);

  const handlePaneClose = useCallback((paneId: string, fileId: string) => {
    setState((prev) => {
      let panes = prev.panes.map((p) => {
        if (p.id !== paneId) return p;
        const files = p.files.filter((f) => f.id !== fileId);
        return { ...p, files, activeFileId: p.activeFileId === fileId ? files[files.length - 1]?.id ?? null : p.activeFileId };
      }).filter((p) => p.files.length > 0);
      if (panes.length === 0) panes = [createPane()];
      const size = 100 / panes.length;
      return { ...prev, panes: panes.map((p) => ({ ...p, size })) };
    });
    onCloseFile(fileId);
  }, [onCloseFile]);

  const handleToggleMaximize = useCallback((paneId: string) => {
    setState((prev) => ({ ...prev, maximizedPaneId: prev.maximizedPaneId === paneId ? null : paneId }));
  }, []);

  // Resize
  const handleResize = useCallback((index: number, delta: number) => {
    setState((prev) => {
      const el = containerRef.current;
      if (!el) return prev;
      const isH = prev.direction === "horizontal" || prev.direction === "quad";
      const total = isH ? el.offsetWidth : el.offsetHeight;
      const dp = (delta / total) * 100;
      const panes = [...prev.panes];
      if (index < panes.length - 1) {
        const s1 = panes[index].size + dp;
        const s2 = panes[index + 1].size - dp;
        if (s1 >= 15 && s2 >= 15) {
          panes[index] = { ...panes[index], size: s1 };
          panes[index + 1] = { ...panes[index + 1], size: s2 };
        }
      }
      return { ...prev, panes };
    });
  }, []);

  // Drag & drop between panes
  const handleDragStart = useCallback((paneId: string, e: React.DragEvent, fileId: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ paneId, fileId }));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback((targetPaneId: string, e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.paneId && data.fileId && data.paneId !== targetPaneId) {
        handleMoveToPane(data.paneId, data.fileId, targetPaneId);
      }
    } catch { /* invalid */ }
  }, [handleMoveToPane]);

  const cycleDirection = useCallback(() => {
    setState((prev) => {
      const order: SplitDirection[] = ["horizontal", "vertical", "quad"];
      const idx = order.indexOf(prev.direction);
      return { ...prev, direction: order[(idx + 1) % order.length] };
    });
  }, []);

  const visiblePanes = useMemo(() => {
    if (state.maximizedPaneId) return state.panes.filter((p) => p.id === state.maximizedPaneId);
    return state.panes;
  }, [state.panes, state.maximizedPaneId]);

  // Single pane: simplified view
  if (state.panes.length === 1 && !state.maximizedPaneId) {
    const pane = state.panes[0];
    if (pane.files.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs">
          <FileCode size={16} className="mr-2 opacity-40" /> {L4(lang, { ko: "열린 파일 없음", en: "No files open" })}
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PaneTabBar
          pane={pane} isFocused={true}
          onSelectFile={(fid) => handlePaneSelect(pane.id, fid)}
          onCloseFile={(fid) => handlePaneClose(pane.id, fid)}
          onContextMenu={(e, fid) => setContextMenu({ x: e.clientX, y: e.clientY, paneId: pane.id, fileId: fid })}
          onDoubleClickTab={() => {}}
          onDragStart={(e, fid) => handleDragStart(pane.id, e, fid)}
          onDrop={(e) => handleDrop(pane.id, e)}
        />
        <div className="flex-1 overflow-hidden">
          {renderEditor ? renderEditor(pane, true) : (
            <div className="h-full flex items-center justify-center text-text-tertiary text-xs">Editor placeholder</div>
          )}
        </div>
      </div>
    );
  }

  /** 4패널이면 2×2 그리드 고정(가로 4칸 나열 방지). 3패널+quad는 2×2 중 3칸. */
  const isQuadLayout =
    visiblePanes.length >= 4 || (state.direction === "quad" && visiblePanes.length >= 3);
  const isVertical = state.direction === "vertical" && !isQuadLayout;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#0a0e17]/80 border-b border-white/8">
        <button
          onClick={cycleDirection}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-text-tertiary hover:text-text-primary bg-white/5 rounded transition-colors"
          title={L4(lang, { ko: "분할 방향 전환 (가로·세로·그리드)", en: "Cycle split: horizontal / vertical / grid" })}
        >
          {state.direction === "horizontal" && <Columns size={10} />}
          {state.direction === "vertical" && <Rows size={10} />}
          {state.direction === "quad" && <LayoutGrid size={10} />}
          {state.direction}
        </button>
        <span className="text-[10px] text-text-tertiary ml-1">
          {state.panes.length} group{state.panes.length > 1 ? "s" : ""}
        </span>
        {state.maximizedPaneId && (
          <button
            onClick={() => setState((prev) => ({ ...prev, maximizedPaneId: null }))}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-amber-400 bg-white/5 rounded transition-colors ml-auto"
          >
            <Minimize2 size={10} /> Restore
          </button>
        )}
      </div>

      {/* Pane layout */}
      <div className={`flex-1 ${isQuadLayout ? "grid grid-cols-2 grid-rows-2" : isVertical ? "flex flex-col" : "flex flex-row"} overflow-hidden`}>
        {visiblePanes.map((pane, index) => (
          <div key={pane.id} className="flex flex-col" style={{ flex: `${pane.size} 0 0%`, minWidth: 0, minHeight: 0 }}>
            <div className="flex flex-col flex-1 overflow-hidden border border-white/5">
              <div className="flex items-center">
                <div className="flex-1 overflow-hidden">
                  <PaneTabBar
                    pane={pane}
                    isFocused={state.focusedPaneId === pane.id}
                    onSelectFile={(fid) => handlePaneSelect(pane.id, fid)}
                    onCloseFile={(fid) => handlePaneClose(pane.id, fid)}
                    onContextMenu={(e, fid) => setContextMenu({ x: e.clientX, y: e.clientY, paneId: pane.id, fileId: fid })}
                    onDoubleClickTab={() => handleToggleMaximize(pane.id)}
                    onDragStart={(e, fid) => handleDragStart(pane.id, e, fid)}
                    onDrop={(e) => handleDrop(pane.id, e)}
                  />
                </div>
                <button
                  onClick={() => handleToggleMaximize(pane.id)}
                  className="px-1.5 py-1 text-text-tertiary hover:text-text-primary transition-colors"
                  title={state.maximizedPaneId === pane.id ? "Restore" : "Maximize"}
                >
                  {state.maximizedPaneId === pane.id ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
                </button>
              </div>
              <div
                className="flex-1 overflow-hidden"
                onClick={() => setState((prev) => ({ ...prev, focusedPaneId: pane.id }))}
              >
                {renderEditor ? renderEditor(pane, state.focusedPaneId === pane.id) : (
                  <div className="h-full flex items-center justify-center text-text-tertiary text-xs">Editor</div>
                )}
              </div>
            </div>
            {index < visiblePanes.length - 1 && !isQuadLayout && (
              <ResizeHandle direction={isVertical ? "vertical" : "horizontal"} onResize={(d) => handleResize(index, d)} />
            )}
          </div>
        ))}
      </div>

      {contextMenu && (
        <PaneContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onSplitRight={handleSplitRight}
          onSplitDown={handleSplitDown}
          onCloseGroup={handleCloseGroup}
          onMoveToPane={handleMoveToPane}
          availablePanes={state.panes}
        />
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-6 | role=EditorGroupRoot | inputs=openFiles,activeFileId,renderEditor | outputs=multi-pane-editor-layout
