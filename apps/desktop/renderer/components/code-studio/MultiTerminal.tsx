"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, X, Terminal as TerminalIcon } from "lucide-react";
import { useCodeStudioT } from "@/lib/use-code-studio-translations";

interface TerminalTab {
  id: string;
  name: string;
}

interface Props {
  /** Render function for terminal content per tab */
  renderTerminal?: (tabId: string) => React.ReactNode;
}

const MAX_TERMINALS = 5;

// IDENTITY_SEAL: PART-1 | role=TypeDefs | inputs=none | outputs=TerminalTab,Props

// ============================================================
// PART 2 — MultiTerminal Component
// ============================================================

export function MultiTerminal({ renderTerminal }: Props) {
  const t = useCodeStudioT();
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: "term-1", name: "Terminal 1" }]);
  const [activeTab, setActiveTab] = useState("term-1");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const didLocalizeTabs = useRef(false);

  useEffect(() => {
    if (didLocalizeTabs.current) return;
    didLocalizeTabs.current = true;
    queueMicrotask(() => setTabs([{ id: "term-1", name: `${t.termShellLabel} 1` }]));
  }, [t.termShellLabel]);

  const addTab = useCallback(() => {
    if (tabs.length >= MAX_TERMINALS) return;
    const id = `term-${Date.now()}`;
    const num = tabs.length + 1;
    setTabs((prev) => [...prev, { id, name: `${t.termShellLabel} ${num}` }]);
    setActiveTab(id);
  }, [tabs.length, t.termShellLabel]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fallback = { id: "term-1", name: `${t.termShellLabel} 1` };
        setActiveTab(fallback.id);
        return [fallback];
      }
      if (activeTab === id) setActiveTab(next[next.length - 1].id);
      return next;
    });
  }, [activeTab, t.termShellLabel]);

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
    // Focus will happen via useEffect or autoFocus
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      setTabs((prev) =>
        prev.map((t) => (t.id === renamingId ? { ...t, name: trimmed } : t)),
      );
    }
    setRenamingId(null);
  }, [renamingId, renameValue]);

  return (
    <div className="flex flex-col h-48 border-t border-white/8">
      {/* Tab Bar */}
      <div className="flex items-center bg-[#0a0e17]/80 border-b border-white/8 px-1 shrink-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] border-r border-white/8 cursor-pointer transition-colors
              ${tab.id === activeTab
                ? "bg-white/5 text-text-primary"
                : "text-text-tertiary hover:bg-white/5"}`}
          >
            <TerminalIcon size={10} />
            {renamingId === tab.id ? (
              <input
                ref={renameInputRef}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent border border-amber-600/45 rounded px-1 text-[10px] w-20 outline-none"
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(tab.id, tab.name);
                }}
              >
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && (
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="hover:text-red-400 ml-1 cursor-pointer"
              >
                <X size={8} />
              </span>
            )}
          </div>
        ))}
        {tabs.length < MAX_TERMINALS && (
          <button
            onClick={addTab}
            className="p-1 text-text-tertiary hover:text-text-primary hover:bg-white/5 rounded"
            title={t.termNew}
          >
            <Plus size={10} />
          </button>
        )}
        <span className="ml-auto text-[9px] text-text-tertiary px-1">
          {tabs.length}/{MAX_TERMINALS}
        </span>
      </div>

      {/* Active Terminal Content */}
      <div className="flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === activeTab ? "h-full" : "hidden"}>
            {renderTerminal ? (
              renderTerminal(tab.id)
            ) : (
              <div className="h-full flex items-center justify-center text-text-tertiary text-xs">
                <TerminalIcon size={16} className="mr-2 opacity-40" />
                {t.termShellLabel}: {tab.name}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=MultiTerminalUI | inputs=renderTerminal | outputs=tabbed-terminal-layout
