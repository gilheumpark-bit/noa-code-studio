"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useEffect, useCallback } from "react";
import { X, Keyboard } from "lucide-react";

interface ShortcutGroup {
  category: string;
  shortcuts: Array<{ keys: string; description: string }>;
}

interface ShortcutOverlayProps {
  open: boolean;
  onClose: () => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ShortcutGroup

// ============================================================
// PART 2 — Shortcut Data
// ============================================================

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: "Editor",
    shortcuts: [
      { keys: "Ctrl+S", description: "Save file" },
      { keys: "Ctrl+Z", description: "Undo" },
      { keys: "Ctrl+Shift+Z", description: "Redo" },
      { keys: "Ctrl+D", description: "Select next occurrence" },
      { keys: "Ctrl+/", description: "Toggle comment" },
      { keys: "Alt+Up/Down", description: "Move line up/down" },
    ],
  },
  {
    category: "Terminal",
    shortcuts: [
      { keys: "Ctrl+`", description: "Toggle terminal" },
      { keys: "Ctrl+Shift+`", description: "New terminal" },
      { keys: "Ctrl+C", description: "Cancel running process" },
    ],
  },
  {
    category: "Navigation",
    shortcuts: [
      { keys: "Ctrl+P", description: "Quick file open" },
      { keys: "Ctrl+Shift+P", description: "Command palette" },
      { keys: "Ctrl+G", description: "Go to line" },
      { keys: "F1-F8", description: "Switch tabs (1-8)" },
      { keys: "Ctrl+W", description: "Close tab" },
      { keys: "Ctrl+Tab", description: "Next tab" },
    ],
  },
  {
    category: "EH 엔진",
    shortcuts: [
      { keys: "Ctrl+I", description: "Smart inline suggestion" },
      { keys: "Ctrl+L", description: "Open EH chat" },
      { keys: "Ctrl+K", description: "Smart command" },
      { keys: "@", description: "Mention file / agent / symbol" },
      { keys: "Ctrl+?", description: "Show shortcuts (this panel)" },
    ],
  },
];

// IDENTITY_SEAL: PART-2 | role=ShortcutData | inputs=none | outputs=ShortcutGroup[]

// ============================================================
// PART 3 — Component
// ============================================================

export default function ShortcutOverlay({ open, onClose }: ShortcutOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200" 
      onClick={onClose}
    >
      <div
        className="relative w-[680px] max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-linear-to- from-bg-secondary/95 to-bg-primary/95 p-8 shadow-[0_32px_64px_rgba(0,0,0,0.5)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center">
              <Keyboard size={20} className="text-accent-green" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Keyboard Shortcuts</h2>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Quick access commands</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcut Groups */}
        <div className="grid grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group, gi) => (
            <div key={group.category}>
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-tertiary px-1">
                {group.category}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((s, si) => (
                  <div
                    key={s.keys}
                    className="group flex items-center justify-between rounded-xl px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors"
                    style={{ animationDelay: `${(gi * 6 + si) * 20}ms` }}
                  >
                    <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                      {s.description}
                    </span>
                    <kbd className="shrink-0 rounded-lg border border-white/[0.08] bg-bg-secondary/80 px-2 py-1 text-[10px] font-bold font-mono text-text-tertiary">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
          <p className="text-[10px] text-text-tertiary">
            Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 mx-1">?</kbd> anytime to open this panel
          </p>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=ShortcutOverlayUI | inputs=open | outputs=JSX
