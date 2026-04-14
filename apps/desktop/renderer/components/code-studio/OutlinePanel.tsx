"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useMemo, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";

interface OutlineSymbol {
  name: string;
  kind: string;
  line: number;
  children?: OutlineSymbol[];
}

interface OutlinePanelProps {
  code: string;
  language: string;
  onNavigate: (line: number) => void;
}

export type { OutlinePanelProps };

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=OutlineSymbol,OutlinePanelProps

// ============================================================
// PART 2 — Symbol Kind Metadata
// ============================================================

const KIND_META: Record<string, { abbr: string; color: string }> = {
  function: { abbr: "fn", color: "#7c9cf5" },   // blue
  class:    { abbr: "C",  color: "#f5c542" },    // yellow
  interface:{ abbr: "I",  color: "#4ade80" },     // green
  type:     { abbr: "T",  color: "#c084fc" },     // purple
  const:    { abbr: "c",  color: "#7c9cf5" },     // blue
  enum:     { abbr: "E",  color: "#f5c542" },     // yellow
  method:   { abbr: "m",  color: "#7c9cf5" },     // blue
  property: { abbr: "p",  color: "#9ca3af" },     // gray
};

// IDENTITY_SEAL: PART-2 | role=SymbolMeta | inputs=none | outputs=KIND_META

// ============================================================
// PART 3 — Symbol Extractor (regex-based)
// ============================================================

function extractSymbols(code: string): OutlineSymbol[] {
  const lines = code.split("\n");
  const symbols: OutlineSymbol[] = [];
  let currentClass: OutlineSymbol | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    // Class
    const classMatch = trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      currentClass = { name: classMatch[1], kind: "class", line: i + 1, children: [] };
      symbols.push(currentClass);
      continue;
    }

    // Interface
    const ifaceMatch = trimmed.match(/(?:export\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: "interface", line: i + 1 });
      continue;
    }

    // Type alias
    const typeMatch = trimmed.match(/(?:export\s+)?type\s+(\w+)\s*=/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: "type", line: i + 1 });
      continue;
    }

    // Enum
    const enumMatch = trimmed.match(/(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: "enum", line: i + 1 });
      continue;
    }

    // Top-level function
    const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch && !currentClass) {
      symbols.push({ name: funcMatch[1], kind: "function", line: i + 1 });
      continue;
    }

    // Arrow function (top-level const)
    const arrowMatch = trimmed.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    if (arrowMatch && !currentClass) {
      symbols.push({ name: arrowMatch[1], kind: "const", line: i + 1 });
      continue;
    }

    // Class method
    if (currentClass) {
      const methodMatch = trimmed.match(/^\s*(?:async\s+)?(\w+)\s*\(/);
      if (
        methodMatch &&
        methodMatch[1] !== "if" &&
        methodMatch[1] !== "for" &&
        methodMatch[1] !== "while" &&
        methodMatch[1] !== "switch"
      ) {
        currentClass.children?.push({ name: methodMatch[1], kind: "method", line: i + 1 });
      }
      // End of class heuristic
      if (/^\}/.test(trimmed)) currentClass = null;
    }
  }

  return symbols;
}

// IDENTITY_SEAL: PART-3 | role=SymbolExtractor | inputs=code | outputs=OutlineSymbol[]

// ============================================================
// PART 4 — SymbolRow Sub-component
// ============================================================

function SymbolRow({
  symbol,
  depth,
  onNavigate,
}: {
  symbol: OutlineSymbol;
  depth: number;
  onNavigate: (line: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (symbol.children?.length ?? 0) > 0;
  const meta = KIND_META[symbol.kind] ?? { abbr: "?", color: "#9ca3af" };

  const handleClick = useCallback(() => {
    if (hasChildren) {
      setExpanded((v) => !v);
    } else {
      onNavigate(symbol.line);
    }
  }, [hasChildren, onNavigate, symbol.line]);

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-1 px-2 py-[2px] hover:bg-white/5 text-left transition-colors"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={10} className="text-text-secondary shrink-0" />
          ) : (
            <ChevronRight size={10} className="text-text-secondary shrink-0" />
          )
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <span
          className="font-mono text-[10px] font-bold w-4 text-center shrink-0"
          style={{ color: meta.color }}
        >
          {meta.abbr}
        </span>
        <span
          className="flex-1 truncate text-text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(symbol.line);
          }}
        >
          {symbol.name}
        </span>
        <span className="text-[9px] text-text-secondary shrink-0">
          {symbol.line}
        </span>
      </button>
      {expanded &&
        symbol.children?.map((child, i) => (
          <SymbolRow
            key={`${child.name}-${child.line}-${i}`}
            symbol={child}
            depth={depth + 1}
            onNavigate={onNavigate}
          />
        ))}
    </>
  );
}

// IDENTITY_SEAL: PART-4 | role=SymbolRow | inputs=symbol,depth,onNavigate | outputs=JSX

// ============================================================
// PART 5 — OutlinePanel Component
// ============================================================

export function OutlinePanel({ code, language: _language, onNavigate }: OutlinePanelProps) {
  const symbols = useMemo(() => extractSymbols(code), [code]);
  const [allCollapsed, setAllCollapsed] = useState(false);

  const toggleAll = useCallback(() => {
    setAllCollapsed((v) => !v);
  }, []);

  if (symbols.length === 0) {
    return (
      <div className="p-3 text-xs text-text-secondary">
        파일을 열면 코드 심볼이 표시됩니다
      </div>
    );
  }

  return (
    <div className="text-xs overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.08]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
          Outline
        </span>
        <button
          onClick={toggleAll}
          className="text-text-secondary hover:text-text-primary transition-colors"
          title={allCollapsed ? "모두 펼치기" : "모두 접기"}
          aria-label={allCollapsed ? "모두 펼치기" : "모두 접기"}
        >
          <ChevronsUpDown size={12} />
        </button>
      </div>

      {/* Symbol tree */}
      {symbols.map((sym, i) => (
        <SymbolRow
          key={`${sym.name}-${sym.line}-${i}`}
          symbol={allCollapsed ? { ...sym, children: undefined } : sym}
          depth={0}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// IDENTITY_SEAL: PART-5 | role=OutlinePanel | inputs=OutlinePanelProps | outputs=JSX
