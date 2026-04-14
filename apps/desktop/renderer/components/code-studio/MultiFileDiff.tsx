"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

interface FileDiff {
  path: string;
  original: string;
  modified: string;
}

interface DiffLine {
  type: "context" | "added" | "removed";
  lineNum: number | null;
  content: string;
}

interface Props {
  files: FileDiff[];
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=FileDiff,DiffLine,Props

// ============================================================
// PART 2 — Diff Computation
// ============================================================

function computeUnifiedDiff(original: string, modified: string): { lines: DiffLine[]; added: number; removed: number } {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const result: DiffLine[] = [];
  let added = 0;
  let removed = 0;

  const maxLen = Math.max(origLines.length, modLines.length);
  let oi = 0;
  let mi = 0;

  while (oi < origLines.length || mi < modLines.length) {
    const oLine = oi < origLines.length ? origLines[oi] : undefined;
    const mLine = mi < modLines.length ? modLines[mi] : undefined;

    if (oLine === mLine) {
      result.push({ type: "context", lineNum: mi + 1, content: mLine ?? "" });
      oi++;
      mi++;
    } else {
      // Emit removed lines from original
      if (oLine !== undefined && (mLine === undefined || oLine !== mLine)) {
        result.push({ type: "removed", lineNum: null, content: oLine });
        removed++;
        oi++;
      }
      // Emit added lines from modified
      if (mLine !== undefined && (oLine === undefined || origLines[oi] !== mLine)) {
        result.push({ type: "added", lineNum: mi + 1, content: mLine });
        added++;
        mi++;
      }
    }

    // Safety: avoid infinite loops on edge cases
    if (oi + mi > maxLen * 3) break;
  }

  return { lines: result, added, removed };
}

// IDENTITY_SEAL: PART-2 | role=DiffEngine | inputs=original,modified | outputs=DiffLine[],stats

// ============================================================
// PART 3 — File Section Component
// ============================================================

function FileDiffSection({ file }: { file: FileDiff }) {
  const [collapsed, setCollapsed] = useState(false);
  const diff = useMemo(() => computeUnifiedDiff(file.original, file.modified), [file.original, file.modified]);

  const toggle = useCallback(() => setCollapsed((p) => !p), []);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* File header */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full px-3 py-2 bg-bg-tertiary hover:bg-border/50 transition-colors text-left"
      >
        {collapsed ? <ChevronRight size={14} className="text-text-tertiary" /> : <ChevronDown size={14} className="text-text-tertiary" />}
        <FileText size={14} className="text-text-secondary" />
        <span className="text-xs font-medium text-text-primary truncate flex-1">{file.path}</span>
        <span className="text-[10px] text-accent-green font-mono">+{diff.added}</span>
        <span className="text-[10px] text-accent-red font-mono">-{diff.removed}</span>
      </button>

      {/* Diff body */}
      {!collapsed && (
        <div className="overflow-x-auto bg-bg-primary font-mono text-xs">
          {diff.lines.map((line, idx) => {
            const bgClass =
              line.type === "added"
                ? "bg-accent-green/10"
                : line.type === "removed"
                  ? "bg-accent-red/10"
                  : "";
            const textClass =
              line.type === "added"
                ? "text-accent-green"
                : line.type === "removed"
                  ? "text-accent-red"
                  : "text-text-secondary";
            const prefix =
              line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

            return (
              <div key={idx} className={`flex ${bgClass} hover:brightness-110`}>
                <span className="w-10 text-right pr-2 text-text-tertiary select-none shrink-0">
                  {line.lineNum ?? ""}
                </span>
                <span className="w-4 text-center text-text-tertiary select-none shrink-0">
                  {prefix}
                </span>
                <span className={`${textClass} whitespace-pre pr-4`}>{line.content}</span>
              </div>
            );
          })}
          {diff.lines.length === 0 && (
            <div className="px-3 py-4 text-center text-text-tertiary text-[10px]">No changes</div>
          )}
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=FileDiffSection | inputs=FileDiff | outputs=JSX

// ============================================================
// PART 4 — Main Component
// ============================================================

export function MultiFileDiff({ files }: Props) {
  const totalStats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const f of files) {
      const d = computeUnifiedDiff(f.original, f.modified);
      added += d.added;
      removed += d.removed;
    }
    return { added, removed, fileCount: files.length };
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
        No files to compare
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-secondary">
      {/* Summary header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-bg-primary">
        <span className="text-xs font-semibold text-text-primary">
          {totalStats.fileCount} file{totalStats.fileCount !== 1 ? "s" : ""} changed
        </span>
        <span className="text-[10px] text-accent-green font-mono">+{totalStats.added}</span>
        <span className="text-[10px] text-accent-red font-mono">-{totalStats.removed}</span>
      </div>

      {/* File diffs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {files.map((file) => (
          <FileDiffSection key={file.path} file={file} />
        ))}
      </div>
    </div>
  );
}

export default MultiFileDiff;

// IDENTITY_SEAL: PART-4 | role=MultiFileDiff | inputs=Props | outputs=JSX
