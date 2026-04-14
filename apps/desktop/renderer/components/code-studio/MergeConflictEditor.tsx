"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState } from "react";
import { GitMerge, ChevronLeft, ChevronRight, ArrowLeftRight, CheckCircle, AlertTriangle } from "lucide-react";

export interface ConflictBlock {
  id: string;
  startLine: number;
  ours: string;
  theirs: string;
  base?: string;
  resolved: boolean;
  resolution?: "ours" | "theirs" | "both" | "manual";
  manualContent?: string;
}

interface MergeConflictEditorProps {
  fileName: string;
  conflicts: ConflictBlock[];
  onResolve: (conflictId: string, resolution: ConflictBlock["resolution"], content?: string) => void;
  onResolveAll?: (resolution: "ours" | "theirs") => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ConflictBlock

// ============================================================
// PART 2 — Single Conflict View
// ============================================================

function ConflictView({
  conflict,
  onResolve,
}: {
  conflict: ConflictBlock;
  onResolve: (resolution: ConflictBlock["resolution"], content?: string) => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [manualContent, setManualContent] = useState(conflict.manualContent ?? "");

  if (conflict.resolved) {
    let resolvedContent = "";
    switch (conflict.resolution) {
      case "ours": resolvedContent = conflict.ours; break;
      case "theirs": resolvedContent = conflict.theirs; break;
      case "both": resolvedContent = `${conflict.ours}\n${conflict.theirs}`; break;
      case "manual": resolvedContent = conflict.manualContent ?? ""; break;
    }
    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs text-green-400">
          <CheckCircle size={14} />
          Resolved ({conflict.resolution}) at line {conflict.startLine}
        </div>
        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
          {resolvedContent.slice(0, 1000)}
        </pre>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent-amber/20 bg-accent-amber/5">
      <div className="flex items-center gap-2 border-b border-accent-amber/10 px-3 py-2 text-xs text-accent-amber">
        <AlertTriangle size={14} />
        Conflict at line {conflict.startLine}
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/5">
        {/* Ours */}
        <div>
          <div className="border-b border-white/5 px-3 py-1 text-[10px] font-bold uppercase text-blue-400">
            Current (Ours)
          </div>
          <pre className="max-h-40 overflow-y-auto p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap">
            {conflict.ours}
          </pre>
        </div>
        {/* Theirs */}
        <div>
          <div className="border-b border-white/5 px-3 py-1 text-[10px] font-bold uppercase text-amber-400">
            Incoming (Theirs)
          </div>
          <pre className="max-h-40 overflow-y-auto p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap">
            {conflict.theirs}
          </pre>
        </div>
      </div>

      {/* Base (3-way) */}
      {conflict.base && (
        <details className="border-t border-white/5">
          <summary className="px-3 py-1 text-[10px] text-gray-500 cursor-pointer hover:text-gray-300">
            Show base version
          </summary>
          <pre className="max-h-32 overflow-y-auto px-3 pb-2 text-xs text-gray-500 font-mono whitespace-pre-wrap">
            {conflict.base}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-white/5 px-3 py-2">
        <button
          onClick={() => onResolve("ours")}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
        >
          <ChevronLeft size={12} /> Accept Ours
        </button>
        <button
          onClick={() => onResolve("theirs")}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 hover:bg-amber-900/18 transition-colors"
        >
          Accept Theirs <ChevronRight size={12} />
        </button>
        <button
          onClick={() => onResolve("both")}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-400 hover:bg-green-500/10 transition-colors"
        >
          <ArrowLeftRight size={12} /> Both
        </button>
        <button
          onClick={() => setShowManual(!showManual)}
          className="ml-auto text-xs text-gray-500 hover:text-white transition-colors"
        >
          Edit Manually
        </button>
      </div>

      {showManual && (
        <div className="border-t border-white/5 p-3">
          <textarea
            value={manualContent}
            onChange={(e) => setManualContent(e.target.value)}
            rows={4}
            className="w-full rounded border border-white/10 bg-[#12121a] px-2 py-1.5 font-mono text-xs text-white outline-none"
          />
          <button
            onClick={() => onResolve("manual", manualContent)}
            className="mt-1 rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500"
          >
            Apply Manual Resolution
          </button>
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=ConflictView | inputs=ConflictBlock | outputs=JSX

// ============================================================
// PART 3 — Main Editor
// ============================================================

export default function MergeConflictEditor({
  fileName,
  conflicts,
  onResolve,
  onResolveAll,
}: MergeConflictEditorProps) {
  const resolvedCount = conflicts.filter((c) => c.resolved).length;
  const totalCount = conflicts.length;
  const allResolved = resolvedCount === totalCount;

  return (
    <div className="flex h-full flex-col bg-[#16161e]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <GitMerge size={16} className="text-accent-amber" />
          <span className="text-sm font-medium text-white">{fileName}</span>
          <span className={`text-xs ${allResolved ? "text-green-400" : "text-accent-amber"}`}>
            {resolvedCount}/{totalCount} resolved
          </span>
        </div>
        {onResolveAll && !allResolved && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onResolveAll("ours")}
              className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              Accept All Ours
            </button>
            <button
              onClick={() => onResolveAll("theirs")}
              className="rounded px-2 py-1 text-xs text-amber-400 hover:bg-amber-900/18 transition-colors"
            >
              Accept All Theirs
            </button>
          </div>
        )}
        {allResolved && (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle size={14} />
            All conflicts resolved
          </div>
        )}
      </div>

      {/* Conflict list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conflicts.map((c) => (
          <ConflictView
            key={c.id}
            conflict={c}
            onResolve={(resolution, content) => onResolve(c.id, resolution, content)}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="border-t border-white/5 px-4 py-2">
        <div className="h-1 w-full rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allResolved ? "bg-green-500" : "bg-accent-amber"}`}
            style={{ width: `${totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=MergeConflictEditorUI | inputs=conflicts | outputs=JSX
