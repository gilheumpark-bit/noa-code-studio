// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useCallback, useEffect, memo } from "react";
import { X } from "lucide-react";
import type { OpenFile } from "@eh/quill-engine/types";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export interface EditorTabsProps {
  openFiles: OpenFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
  onCloseOtherFiles?: (keepId: string) => void;
  onCloseAllFiles?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  fileId: string;
}

// IDENTITY_SEAL: PART-1 | role=imports+types | inputs=none | outputs=EditorTabsProps,ContextMenuState

// ============================================================
// PART 2 — Context Menu Component
// ============================================================

function TabContextMenu({
  state,
  onClose,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onCloseTab: (id: string) => void;
  onCloseOtherTabs: (keepId: string) => void;
  onCloseAllTabs: () => void;
}) {
  const { lang } = useLang();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-secondary border border-white/10 rounded shadow-lg py-1 min-w-[160px]"
      style={{ left: state.x, top: state.y }}
    >
      <button
        onClick={() => {
          onCloseTab(state.fileId);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 flex items-center gap-2"
      >
        <X size={10} /> {L4(lang, { ko: "닫기", en: "Close" })}
      </button>
      <button
        onClick={() => {
          onCloseOtherTabs(state.fileId);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10"
      >
        {L4(lang, { ko: "다른 탭 닫기", en: "Close Other Tabs" })}
      </button>
      <div className="h-px bg-white/10 my-1" />
      <button
        onClick={() => {
          onCloseAllTabs();
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/10"
      >
        {L4(lang, { ko: "모든 탭 닫기", en: "Close All Tabs" })}
      </button>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=context menu | inputs=ContextMenuState | outputs=JSX menu

// ============================================================
// PART 3 — Main EditorTabs Component
// ============================================================

export const EditorTabs = memo(function EditorTabs({
  openFiles,
  activeFileId,
  onSelectFile,
  onCloseFile,
  onCloseOtherFiles,
  onCloseAllFiles,
}: EditorTabsProps) {
  const { lang } = useLang();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard: Ctrl+W closes current tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        if (activeFileId) {
          onCloseFile(activeFileId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFileId, onCloseFile]);

  // Drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent, fileId: string) => {
      setDraggedFileId(fileId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", fileId);
    },
    [],
  );

  // Drag over a tab
  const handleDragOver = useCallback(
    (e: React.DragEvent, fileId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedFileId && draggedFileId !== fileId) {
        setDropTargetId(fileId);
      }
    },
    [draggedFileId],
  );

  // Drop on a tab — signals reorder intent
  const handleDrop = useCallback(
    (e: React.DragEvent, _targetFileId: string) => {
      e.preventDefault();
      // Reorder is handled at the parent level via the openFiles prop order.
      // This component signals the drag state visually; actual reorder
      // would require an onReorder callback. For now we just reset state.
      setDraggedFileId(null);
      setDropTargetId(null);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedFileId(null);
    setDropTargetId(null);
  }, []);

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, fileId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, fileId });
    },
    [],
  );

  const handleCloseOtherTabs = useCallback(
    (keepId: string) => {
      if (onCloseOtherFiles) {
        onCloseOtherFiles(keepId);
      } else {
        openFiles.forEach((f) => {
          if (f.id !== keepId) onCloseFile(f.id);
        });
      }
    },
    [openFiles, onCloseFile, onCloseOtherFiles],
  );

  const handleCloseAllTabs = useCallback(() => {
    if (onCloseAllFiles) {
      onCloseAllFiles();
    } else {
      openFiles.forEach((f) => onCloseFile(f.id));
    }
  }, [openFiles, onCloseFile, onCloseAllFiles]);

  if (openFiles.length === 0) {
    return (
      <div className="flex items-center h-9 px-3 bg-bg-primary border-b border-white/8">
        <span className="text-xs text-text-tertiary italic">
          {L4(lang, { ko: "열린 파일 없음", en: "No open files" })}
        </span>
      </div>
    );
  }

  return (
    <>
      <div
        ref={tabsContainerRef}
        role="tablist"
        className="flex items-center h-9 bg-bg-primary border-b border-white/8 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10"
      >
        {openFiles.map((file) => {
          const isActive = file.id === activeFileId;
          const isDragTarget = file.id === dropTargetId;

          return (
            <button
              key={file.id}
              role="tab"
              aria-selected={isActive}
              draggable
              onDragStart={(e) => handleDragStart(e, file.id)}
              onDragOver={(e) => handleDragOver(e, file.id)}
              onDrop={(e) => handleDrop(e, file.id)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelectFile(file.id)}
              onContextMenu={(e) => handleContextMenu(e, file.id)}
              className={`
                group relative flex items-center gap-1.5 px-3 h-full text-xs
                whitespace-nowrap border-r border-white/5
                transition-colors cursor-grab active:cursor-grabbing
                ${
                  isActive
                    ? "bg-bg-primary text-white"
                    : "text-text-secondary hover:bg-white/5 hover:text-gray-300"
                }
                ${isDragTarget ? "border-l-2 border-l-amber-700" : ""}
              `}
            >
              {/* Active tab indicator — purple bottom border */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-700" />
              )}

              {/* Modified indicator (yellow dot) */}
              {file.isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-amber shrink-0" />
              )}

              <span className="truncate max-w-[120px]">{file.name}</span>

              {/* Close button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file.id);
                }}
                aria-label={L4(lang, { ko: `${file.name} 탭 닫기`, en: `Close ${file.name} tab` })}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 cursor-pointer shrink-0 transition-opacity"
              >
                <X size={12} />
              </button>
            </button>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <TabContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onCloseTab={onCloseFile}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCloseAllTabs={handleCloseAllTabs}
        />
      )}
    </>
  );
});

// IDENTITY_SEAL: PART-3 | role=tab bar UI | inputs=EditorTabsProps | outputs=JSX tab bar
