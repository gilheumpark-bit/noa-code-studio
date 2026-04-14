"use client";

// ============================================================
// PART 1 — Quick Open Modal (Ctrl+P)
// ============================================================

import { useState, useRef, useEffect, useMemo } from "react";
import { FileCode, Search, Clock } from "lucide-react";
import type { FileNode } from "@noa/quill-engine/types";
import { fileIconColor } from "@noa/quill-engine/types";

interface Props {
  files: FileNode[];
  recentFileIds?: string[];
  onOpen: (node: FileNode) => void;
  onClose: () => void;
}

/** Flatten file tree into searchable list */
function flattenFiles(nodes: FileNode[], prefix = ""): { node: FileNode; path: string }[] {
  const result: { node: FileNode; path: string }[] = [];
  for (const n of nodes) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "file") result.push({ node: n, path });
    if (n.children) result.push(...flattenFiles(n.children, path));
  }
  return result;
}

/** Simple fuzzy match: checks if all query chars appear in order */
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring gets highest score
  if (t.includes(q)) return { match: true, score: 100 - t.indexOf(q) };

  // Fuzzy: all chars in order
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      // Bonus for matching at word boundaries
      if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === "." || t[ti - 1] === "-" || t[ti - 1] === "_") {
        score += 5;
      }
      qi++;
    }
  }
  return { match: qi === q.length, score };
}

// IDENTITY_SEAL: PART-1 | role=UtilityFunctions | inputs=FileNode[] | outputs=flatList,fuzzyMatch

// ============================================================
// PART 2 — QuickOpen Component
// ============================================================

export function QuickOpen({ files, recentFileIds, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const allFiles = useMemo(() => flattenFiles(files), [files]);

  // Recent files first, then fuzzy-filtered
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show recent files first, then all up to 20
      const recentSet = new Set(recentFileIds ?? []);
      const recent = allFiles.filter((f) => recentSet.has(f.node.id));
      const others = allFiles.filter((f) => !recentSet.has(f.node.id));
      return [...recent, ...others].slice(0, 20);
    }

    return allFiles
      .map((f) => {
        const result = fuzzyMatch(query, f.path);
        return { ...f, ...result };
      })
      .filter((f) => f.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [query, allFiles, recentFileIds]);

  // Reset selection when filter changes
  const [prevLen, setPrevLen] = useState(filtered.length);
  if (prevLen !== filtered.length) {
    setPrevLen(filtered.length);
    setSelectedIdx(0);
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      onOpen(filtered[selectedIdx].node);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const recentSet = new Set(recentFileIds ?? []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0e17] border border-white/8 rounded-xl shadow-2xl w-[480px] max-h-[350px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
          <Search size={14} className="text-text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search files..."
            className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-tertiary"
          />
          <kbd className="text-[9px] text-text-tertiary bg-white/5 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="overflow-y-auto max-h-[290px]">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-tertiary">
              No matching files
            </div>
          ) : (
            filtered.map((f, i) => (
              <button
                key={f.node.id}
                onClick={() => { onOpen(f.node); onClose(); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
                  ${i === selectedIdx ? "bg-amber-900/22 text-amber-400" : "hover:bg-white/5 text-text-primary"}`}
              >
                {recentSet.has(f.node.id) ? (
                  <Clock size={12} className="text-amber-400 shrink-0" />
                ) : (
                  <FileCode size={12} className={`${fileIconColor(f.node.name)} shrink-0`} />
                )}
                <span className="flex-1 text-left truncate">{f.node.name}</span>
                <span className="text-[9px] text-text-tertiary truncate max-w-[200px]">{f.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=QuickOpenUI | inputs=files,recentFileIds | outputs=selected-file-open
