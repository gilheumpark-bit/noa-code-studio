// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, ChevronRight } from "lucide-react";

// ============================================================
// PART 1 — Types
// ============================================================

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category?: string;
  icon?: React.ReactNode;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onExecute: (commandId: string) => void;
  commands: Command[];
  /** Search field placeholder (pass L4 from parent for i18n) */
  searchPlaceholder?: string;
  /** Empty state when no commands match the filter */
  noResultsText?: string;
  /** Localized count label, e.g. (n) => `${n} found` */
  formatFoundCount?: (count: number) => string;
  /** Accessible dialog label */
  ariaLabel?: string;
}

// ============================================================
// PART 2 — Fuzzy match utility
// ============================================================

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const lower = target.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const lower = target.toLowerCase();
  const q = query.toLowerCase();

  // Exact prefix match gets highest score
  if (lower.startsWith(q)) return 3;
  // Word boundary match
  const words = lower.split(/[\s\-_:]/);
  for (const w of words) {
    if (w.startsWith(q)) return 2;
  }
  // Subsequence match
  return fuzzyMatch(query, target) ? 1 : 0;
}

// ============================================================
// PART 3 — Shortcut badge sub-component
// ============================================================

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  const keys = shortcut.split("+");
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5">
      {keys.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex min-w-[20px] items-center justify-center rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-none text-text-tertiary"
        >
          {key.trim()}
        </kbd>
      ))}
    </span>
  );
}

// ============================================================
// PART 4 — CommandPalette component
// ============================================================

export default function CommandPalette({
  open,
  onClose,
  onExecute,
  commands,
  searchPlaceholder = "Type a command...",
  noResultsText = "No matching commands",
  formatFoundCount = (n: number) => `${n} found`,
  ariaLabel = "Command Palette",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleGroup = useCallback((category: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // -- Reset state when opened (groups expanded by default for discoverability) --
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Expand all groups by default so users can discover commands
      setCollapsedGroups(new Set());
      // Small delay so the DOM is mounted before focus
      const t = setTimeout(() => inputRef.current?.focus(), 16);
      return () => clearTimeout(t);
    }
  }, [open, commands]);

  // -- Filtered & grouped commands --
  const filtered = useMemo(() => {
    if (!query) return commands;
    return commands
      .map((cmd) => ({ cmd, score: fuzzyScore(query, cmd.label) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((e) => e.cmd);
  }, [commands, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      const cat = cmd.category ?? "General";
      const arr = map.get(cat);
      if (arr) arr.push(cmd);
      else map.set(cat, [cmd]);
    }
    return map;
  }, [filtered]);

  // Flat list for keyboard nav (excludes collapsed groups)
  const flatList = useMemo(() => {
    const result: Command[] = [];
    for (const [cat, cmds] of grouped.entries()) {
      if (!collapsedGroups.has(cat)) {
        result.push(...cmds);
      }
    }
    return result;
  }, [grouped, collapsedGroups]);

  // -- Clamp active index when list changes --
  useEffect(() => {
    setActiveIndex((prev) =>
      flatList.length === 0 ? 0 : Math.min(prev, flatList.length - 1)
    );
  }, [flatList]);

  // -- Scroll active item into view --
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // -- Execute handler --
  const execute = useCallback(
    (cmd: Command) => {
      onExecute(cmd.id);
      onClose();
    },
    [onExecute, onClose]
  );

  // -- Keyboard handler --
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < flatList.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : flatList.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (flatList[activeIndex]) execute(flatList[activeIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList, activeIndex, execute, onClose]
  );

  if (!open) return null;

  // Build render index counter for data-active matching
  let renderIndex = -1;

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Palette container */}
      <div
        className="relative w-full max-w-[560px] overflow-hidden rounded-lg border border-white/10 bg-bg-primary shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              if (e.target.value) setCollapsedGroups(new Set()); // 검색 시 모든 그룹 펼침
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded={grouped.size > 0}
            aria-controls="command-palette-listbox"
            aria-autocomplete="list"
            className="w-full bg-transparent font-mono text-[13px] text-text-primary placeholder-text-tertiary outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
              {formatFoundCount(filtered.length)}
            </span>
          )}
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          id="command-palette-listbox"
          className="max-h-[340px] overflow-y-auto overscroll-contain py-1"
          role="listbox"
        >
          {grouped.size === 0 ? (
            <div className="px-4 py-6 text-center font-mono text-[12px] text-text-tertiary">
              {noResultsText}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, cmds]) => (
              <div key={category} role="group" aria-label={category}>
                {/* Category header — clickable to collapse/expand */}
                <button
                  type="button"
                  onClick={() => toggleGroup(category)}
                  className="flex w-full items-center gap-1.5 px-3 pb-1 pt-2 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  aria-expanded={!collapsedGroups.has(category)}
                >
                  <ChevronRight className={`h-3 w-3 text-text-tertiary transition-transform duration-150 ${collapsedGroups.has(category) ? "" : "rotate-90"}`} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {category}
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-text-tertiary/50">{cmds.length}</span>
                </button>

                {/* Command items — hidden when collapsed */}
                {!collapsedGroups.has(category) && cmds.map((cmd) => {
                  renderIndex++;
                  const isActive = renderIndex === activeIndex;

                  return (
                    <div
                      key={cmd.id}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      className={`mx-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
                        isActive
                          ? "bg-accent-green/12 text-text-primary"
                          : "text-text-secondary hover:bg-white/[0.04]"
                      }`}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() =>
                        setActiveIndex(
                          flatList.findIndex((c) => c.id === cmd.id)
                        )
                      }
                    >
                      {/* Icon */}
                      {cmd.icon && (
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                            isActive
                              ? "text-accent-green"
                              : "text-text-tertiary"
                          }`}
                        >
                          {cmd.icon}
                        </span>
                      )}

                      {/* Label */}
                      <span className="truncate font-mono text-[12px]">
                        {cmd.label}
                      </span>

                      {/* Shortcut badge */}
                      {cmd.shortcut && (
                        <ShortcutBadge shortcut={cmd.shortcut} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-white/8 px-3 py-1.5">
          <span className="flex items-center gap-1 font-mono text-[10px] text-text-tertiary">
            <kbd className="rounded border border-white/10 bg-white/[0.06] px-1 text-[9px]">
              &uarr;&darr;
            </kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-text-tertiary">
            <kbd className="rounded border border-white/10 bg-white/[0.06] px-1 text-[9px]">
              Enter
            </kbd>
            Execute
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-text-tertiary">
            <kbd className="rounded border border-white/10 bg-white/[0.06] px-1 text-[9px]">
              Esc
            </kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=Command,CommandPaletteProps
// IDENTITY_SEAL: PART-2 | role=fuzzy-match | inputs=query,target | outputs=boolean,number
// IDENTITY_SEAL: PART-3 | role=shortcut-badge | inputs=shortcut-string | outputs=JSX
// IDENTITY_SEAL: PART-4 | role=command-palette | inputs=props | outputs=JSX
