"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  FilePlus, FolderPlus, Pencil, Trash2, Copy, Clipboard,
  Columns2, ChevronRight, Scissors, ClipboardPaste, Sparkles,
  TextSelect, Command, Shield, Lock,
} from "lucide-react";
import { L4 } from "@/lib/i18n";

/** Single menu item definition */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
  children?: ContextMenuItem[];
}

/** Convenience action type for file-explorer context menus */
export type ContextMenuAction =
  | "new-file" | "new-folder" | "rename" | "delete"
  | "copy-path" | "duplicate" | "open-in-split";

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

// IDENTITY_SEAL: PART-1 | role=TypeDefinitions | inputs=none | outputs=ContextMenuItem,ContextMenuAction,Props

// ============================================================
// PART 2 — Submenu Component
// ============================================================

function Submenu({
  items,
  onSelect,
  onClose,
}: {
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      className="absolute left-full top-0 ml-1 bg-[#0a0e17]/80 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] py-1.5 min-w-[200px]"
      style={{ zIndex: "var(--z-popover)" }}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="mx-2 my-1.5 border-t border-white/10" />
        ) : (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled && !item.children) {
                  onSelect(item.id);
                  onClose();
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all duration-150 ease-out focus-visible:outline-none
                ${item.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10 active:scale-[0.98] focus-visible:bg-white/10"}
                ${item.danger ? "text-red-400" : "text-text-primary"}`}
            >
              {item.icon && <span className="w-3 shrink-0">{item.icon}</span>}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[9px] text-text-tertiary ml-2">{item.shortcut}</span>
              )}
              {item.children && <ChevronRight size={10} className="text-text-tertiary" />}
            </button>
            {item.children && hoveredId === item.id && (
              <Submenu items={item.children} onSelect={onSelect} onClose={onClose} />
            )}
          </div>
        ),
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=SubmenuRenderer | inputs=ContextMenuItem[] | outputs=JSX

// ============================================================
// PART 3 — Main ContextMenu Component
// ============================================================

export function ContextMenu({ x, y, items, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const visibleItems = items.filter((i) => !i.separator);

  // Close on outside click or Escape
  useEffect(() => {
    /** Use click (bubble) so mousedown on menu is not confused with editor hits below a low z-index. */
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, visibleItems.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && focusIdx >= 0) {
        const item = visibleItems[focusIdx];
        if (item && !item.disabled && !item.children) {
          onSelect(item.id);
          onClose();
        }
      }
    };
    document.addEventListener("click", handleOutside, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleOutside, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, focusIdx, visibleItems, onSelect]);

  // Clamp position to viewport
  const style = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1920) - 200),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 1080) - 300),
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-activedescendant={focusIdx >= 0 && visibleItems[focusIdx] ? `ctx-item-${visibleItems[focusIdx].id}` : undefined}
      className="fixed bg-[#0a0e17]/80 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] py-1.5 min-w-[200px]"
      style={{ ...style, zIndex: "var(--z-dropdown)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="mx-2 my-1.5 border-t border-white/10" />
        ) : (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button
              type="button"
              id={`ctx-item-${item.id}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled && !item.children) {
                  onSelect(item.id);
                  onClose();
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all duration-150 ease-out focus-visible:outline-none
                ${item.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10 active:scale-[0.98] focus-visible:bg-white/10"}
                ${item.danger ? "text-red-400" : "text-text-primary"}
                ${focusIdx === visibleItems.indexOf(item) ? "bg-white/10" : ""}`}
            >
              {item.icon && <span className="w-3 shrink-0">{item.icon}</span>}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[9px] text-text-tertiary ml-2">{item.shortcut}</span>
              )}
              {item.children && <ChevronRight size={10} className="text-text-tertiary" />}
            </button>
            {item.children && hoveredId === item.id && (
              <Submenu items={item.children} onSelect={onSelect} onClose={onClose} />
            )}
          </div>
        ),
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=ContextMenuRoot | inputs=x,y,items | outputs=JSX

// ============================================================
// PART 4 — File Explorer Context Menu Builder
// ============================================================

/** Build context menu items for the file explorer */
export function buildFileExplorerMenu(isFolder: boolean, lang: string): ContextMenuItem[] {
  return [
    { id: "new-file", label: L4(lang, { ko: "새 파일", en: "New File" }), icon: <FilePlus size={12} /> },
    { id: "new-folder", label: L4(lang, { ko: "새 폴더", en: "New Folder" }), icon: <FolderPlus size={12} /> },
    { id: "sep-1", label: "", separator: true },
    { id: "rename", label: L4(lang, { ko: "이름 바꾸기", en: "Rename" }), icon: <Pencil size={12} />, shortcut: "F2" },
    { id: "duplicate", label: L4(lang, { ko: "복제", en: "Duplicate" }), icon: <Copy size={12} />, disabled: isFolder },
    { id: "open-in-split", label: L4(lang, { ko: "분할 화면으로 열기", en: "Open in Split" }), icon: <Columns2 size={12} />, disabled: isFolder },
    { id: "copy-path", label: L4(lang, { ko: "경로 복사", en: "Copy Path" }), icon: <Clipboard size={12} /> },
    { id: "sep-2", label: "", separator: true },
    { id: "delete", label: L4(lang, { ko: "삭제", en: "Delete" }), icon: <Trash2 size={12} />, danger: true },
  ];
}

// IDENTITY_SEAL: PART-4 | role=FileExplorerMenuBuilder | inputs=isFolder | outputs=ContextMenuItem[]

// ============================================================
// PART 5 — Editor surface (Monaco) context menu
// ============================================================

/** Right-click menu for the code editor body; actions via {@link runEditorSurfaceMenuAction} */
export function buildEditorSurfaceMenu(lang: string): ContextMenuItem[] {
  return [
    { id: "editor-cut", label: L4(lang, { ko: "잘라내기", en: "Cut" }), icon: <Scissors size={12} />, shortcut: "Ctrl+X" },
    { id: "editor-copy", label: L4(lang, { ko: "복사", en: "Copy" }), icon: <Copy size={12} />, shortcut: "Ctrl+C" },
    { id: "editor-paste", label: L4(lang, { ko: "붙여넣기", en: "Paste" }), icon: <ClipboardPaste size={12} />, shortcut: "Ctrl+V" },
    { id: "editor-sep-1", label: "", separator: true },
    {
      id: "editor-format",
      label: L4(lang, { ko: "문서 서식", en: "Format Document" }),
      icon: <Sparkles size={12} />,
      shortcut: "Ctrl+Shift+I",
    },
    {
      id: "editor-select-all",
      label: L4(lang, { ko: "모두 선택", en: "Select All" }),
      icon: <TextSelect size={12} />,
      shortcut: "Ctrl+A",
    },
    { id: "editor-sep-2", label: "", separator: true },
    {
      id: "editor-monaco-commands",
      label: L4(lang, { ko: "에디터 명령…", en: "Editor Commands…" }),
      icon: <Command size={12} />,
      shortcut: "F1",
    },
    {
      id: "editor-app-commands",
      label: L4(lang, { ko: "스튜디오 명령 팔레트", en: "Studio Command Palette" }),
      icon: <Command size={12} />,
      shortcut: "Ctrl+Shift+P",
    },
    { id: "editor-sep-3", label: "", separator: true },
    {
      id: "editor-ai-picker",
      label: L4(lang, { ko: "디자인 토큰 삽입 (AI)", en: "Insert Design Token (AI)" }),
      icon: <Sparkles size={12} className="text-amber-400" />,
      shortcut: "Ctrl+Shift+T",
    },
    {
      id: "editor-ai-lint",
      label: L4(lang, { ko: "수동 코드/디자인 진단", en: "Manual Lint/Audit" }),
      icon: <Shield size={12} className="text-blue-400" />,
    },
    {
      id: "editor-snapshot",
      label: L4(lang, { ko: "히스토리 스냅샷 생성", en: "Create History Snapshot" }),
      icon: <Clipboard size={12} className="text-green-400" />,
    },
    {
      id: "editor-scope-lock",
      label: L4(lang, { ko: "스코프 고정", en: "Lock AI Scope" }),
      icon: <Lock size={12} className="text-purple-400" />,
    },
  ];
}

// IDENTITY_SEAL: PART-5 | role=EditorSurfaceMenuBuilder | inputs=lang | outputs=ContextMenuItem[]
