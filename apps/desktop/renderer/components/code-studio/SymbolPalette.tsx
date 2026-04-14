"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from "react";
import { FileText, X, Search } from "lucide-react";
import { useCodeStudioT } from "@/lib/use-code-studio-translations";

export interface SymbolEntry {
  name: string;
  kind: "function" | "class" | "variable" | "interface" | "type" | "enum" | "const";
  file: string;
  line?: number;
}

interface SymbolPaletteProps {
  symbols: SymbolEntry[];
  onSelect: (symbol: SymbolEntry) => void;
  onClose: () => void;
}

const KIND_COLORS: Record<SymbolEntry["kind"], string> = {
  function: "text-accent-amber",
  class: "text-blue-400",
  variable: "text-green-400",
  interface: "text-amber-400",
  type: "text-pink-400",
  enum: "text-orange-400",
  const: "text-cyan-400",
};

const KIND_ABBR: Record<SymbolEntry["kind"], string> = {
  function: "fn",
  class: "cls",
  variable: "var",
  interface: "iface",
  type: "type",
  enum: "enum",
  const: "const",
};

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=SymbolEntry

// ============================================================
// PART 2 — Fuzzy Matcher
// ============================================================

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += (lastMatchIndex === i - 1) ? 2 : 1; // consecutive bonus
      lastMatchIndex = i;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

// IDENTITY_SEAL: PART-2 | role=FuzzyMatcher | inputs=query,target | outputs=number

// ============================================================
// PART 3 — Component
// ============================================================

export default function SymbolPalette({ symbols, onSelect, onClose }: SymbolPaletteProps) {
  const t = useCodeStudioT();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!query) return symbols.slice(0, 100);
    return symbols
      .map((s) => ({ symbol: s, score: fuzzyScore(query, s.name) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map((r) => r.symbol);
  }, [query, symbols]);

  useEffect(() => {
    startTransition(() => setSelectedIndex(0));
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40" onClick={onClose}>
      <div
        className="w-[480px] max-h-[400px] rounded-xl border border-white/10 bg-[#1e1e2e] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <Search size={14} className="text-gray-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.symSearchPlaceholder}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          />
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
        <div ref={listRef} className="max-h-[340px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">{t.symNoSymbols}</div>
          )}
          {filtered.map((sym, i) => (
            <button
              key={`${sym.file}-${sym.name}-${i}`}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                i === selectedIndex ? "bg-white/10 text-white" : "text-gray-300 hover:bg-white/5"
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(sym)}
            >
              <span className={`text-[10px] font-mono font-bold ${KIND_COLORS[sym.kind]}`}>
                {KIND_ABBR[sym.kind]}
              </span>
              <span className="font-medium truncate">{sym.name}</span>
              <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                <FileText size={10} />
                <span className="truncate max-w-[140px]">{sym.file}</span>
                {sym.line != null && <span>:{sym.line}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=SymbolPaletteUI | inputs=symbols,query | outputs=JSX
