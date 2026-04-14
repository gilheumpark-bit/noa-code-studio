"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { Check, X, ChevronDown, ChevronUp, Columns, Rows, ArrowRight, ArrowLeft } from "lucide-react";

interface DiffHunk {
  id: number;
  startLine: number;
  endLine: number;
  addedLines: number;
  removedLines: number;
  status: "pending" | "accepted" | "rejected";
}

interface Props {
  original: string;
  modified: string;
  language?: string;
  /** @deprecated use `language` instead */
  _language?: string;
  fileName?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onAcceptHunk?: (hunkId: number, content: string) => void;
  readOnly?: boolean;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=DiffHunk,Props

// ============================================================
// PART 2 — Hunk Parser
// ============================================================

function parseHunks(original: string, modified: string): DiffHunk[] {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const hunks: DiffHunk[] = [];
  let hunkId = 0;
  let i = 0, j = 0;
  let inHunk = false, hunkStart = 0, added = 0, removed = 0;
  const maxLen = Math.max(origLines.length, modLines.length);

  while (i < maxLen || j < maxLen) {
    const oLine = i < origLines.length ? origLines[i] : undefined;
    const mLine = j < modLines.length ? modLines[j] : undefined;
    if (oLine === mLine) {
      if (inHunk) {
        hunks.push({ id: hunkId++, startLine: hunkStart, endLine: Math.max(i, j), addedLines: added, removedLines: removed, status: "pending" });
        inHunk = false; added = 0; removed = 0;
      }
      i++; j++;
    } else {
      if (!inHunk) { inHunk = true; hunkStart = j + 1; }
      if (oLine !== undefined && mLine !== undefined) { added++; removed++; i++; j++; }
      else if (oLine === undefined) { added++; j++; }
      else { removed++; i++; }
    }
  }
  if (inHunk) hunks.push({ id: hunkId++, startLine: hunkStart, endLine: Math.max(i, j), addedLines: added, removedLines: removed, status: "pending" });
  return hunks;
}

// IDENTITY_SEAL: PART-2 | role=Parser | inputs=original,modified | outputs=DiffHunk[]

// ============================================================
// PART 3 — Component
// ============================================================

export function DiffEditorPanel({ original, modified, _language = "typescript", fileName, onAccept, onReject, onAcceptHunk, readOnly = false }: Props) {
  const [renderSideBySide, setRenderSideBySide] = useState(true);
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [hunks, setHunks] = useState<DiffHunk[]>(() => parseHunks(original, modified));

  const [prevInput, setPrevInput] = useState({ original, modified });
  if (prevInput.original !== original || prevInput.modified !== modified) {
    setPrevInput({ original, modified });
    setHunks(parseHunks(original, modified));
    setCurrentChangeIndex(0);
  }

  const stats = useMemo(() => ({
    added: hunks.reduce((s, h) => s + h.addedLines, 0),
    removed: hunks.reduce((s, h) => s + h.removedLines, 0),
    hunks: hunks.length,
  }), [hunks]);

  const navigateChange = useCallback((dir: "next" | "prev") => {
    if (hunks.length === 0) return;
    setCurrentChangeIndex((idx) => dir === "next" ? (idx + 1) % hunks.length : (idx - 1 + hunks.length) % hunks.length);
  }, [hunks]);

  const handleAcceptHunk = useCallback((hunkId: number) => {
    setHunks((prev) => prev.map((h) => h.id === hunkId ? { ...h, status: "accepted" as const } : h));
    onAcceptHunk?.(hunkId, modified);
  }, [modified, onAcceptHunk]);

  const handleRejectHunk = useCallback((hunkId: number) => {
    setHunks((prev) => prev.map((h) => h.id === hunkId ? { ...h, status: "rejected" as const } : h));
  }, []);

  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f1419] border-b border-white/8">
        <div className="flex items-center gap-3">
          {fileName && <span className="text-xs font-medium text-white">{fileName}</span>}
          <span className="text-[10px] text-white/50 flex items-center gap-2">
            <span className="text-green-400">+{stats.added}</span>
            <span className="text-red-400">-{stats.removed}</span>
            <span>{stats.hunks} changes</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRenderSideBySide((p) => !p)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-white/5 text-white/50 hover:text-white rounded transition-colors">
            {renderSideBySide ? <Rows size={12} /> : <Columns size={12} />}
            {renderSideBySide ? "Inline" : "Side by Side"}
          </button>
          {hunks.length > 0 && (
            <div className="flex items-center gap-1">
              <button onClick={() => navigateChange("prev")} className="px-2 py-1 text-xs bg-white/5 text-white/50 hover:text-white rounded"><ChevronUp size={12} /></button>
              <span className="text-[10px] text-white/50 min-w-[3rem] text-center">{currentChangeIndex + 1}/{hunks.length}</span>
              <button onClick={() => navigateChange("next")} className="px-2 py-1 text-xs bg-white/5 text-white/50 hover:text-white rounded"><ChevronDown size={12} /></button>
            </div>
          )}
          {!readOnly && onAccept && (
            <button onClick={onAccept} className="flex items-center gap-1 px-3 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"><Check size={12} /> Accept All</button>
          )}
          {!readOnly && onReject && (
            <button onClick={onReject} className="flex items-center gap-1 px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"><X size={12} /> Reject All</button>
          )}
        </div>
      </div>

      {!readOnly && hunks.length > 0 && (
        <div className="border-b border-white/8 bg-[#0a0e17] max-h-28 overflow-y-auto px-3 py-1">
          <div className="text-[10px] text-white/50 mb-1">Changes ({hunks.filter((h) => h.status === "pending").length} pending):</div>
          {hunks.map((hunk, idx) => (
            <div key={hunk.id} className={`flex items-center gap-2 text-[10px] px-1 py-0.5 rounded ${idx === currentChangeIndex ? "bg-white/5" : ""}`}>
              <span className="text-white/60 min-w-[4rem]">L{hunk.startLine}-{hunk.endLine}</span>
              <span className="text-green-400">+{hunk.addedLines}</span>
              <span className="text-red-400">-{hunk.removedLines}</span>
              {hunk.status === "pending" ? (
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => handleAcceptHunk(hunk.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 text-green-400 hover:bg-green-500/20 rounded"><ArrowRight size={10} /> Accept</button>
                  <button onClick={() => handleRejectHunk(hunk.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 text-red-400 hover:bg-red-500/20 rounded"><ArrowLeft size={10} /> Reject</button>
                </div>
              ) : (
                <span className={`ml-auto text-[10px] ${hunk.status === "accepted" ? "text-green-400" : "text-red-400"}`}>{hunk.status === "accepted" ? "Accepted" : "Rejected"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#0a0e17] font-mono text-xs">
        {renderSideBySide ? (
          <div className="flex h-full">
            <div className="flex-1 overflow-auto border-r border-white/8 p-2">
              <div className="text-[10px] text-white/50 mb-1">Original</div>
              {origLines.map((line, i) => (
                <div key={i} className="flex"><span className="w-8 text-right pr-2 text-white/60 select-none">{i + 1}</span><span className="text-white/60">{line}</span></div>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-2">
              <div className="text-[10px] text-white/50 mb-1">Modified</div>
              {modLines.map((line, i) => {
                const isChanged = i < origLines.length ? origLines[i] !== line : true;
                return (
                  <div key={i} className={`flex ${isChanged ? "bg-green-500/10" : ""}`}>
                    <span className="w-8 text-right pr-2 text-white/60 select-none">{i + 1}</span>
                    <span className={isChanged ? "text-green-400" : "text-white/60"}>{line}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-2">
            {modLines.map((line, i) => {
              const isChanged = i < origLines.length ? origLines[i] !== line : true;
              const wasRemoved = i < origLines.length && origLines[i] !== line;
              return (
                <div key={i}>
                  {wasRemoved && (
                    <div className="flex bg-red-500/10"><span className="w-8 text-right pr-2 text-white/60 select-none">-</span><span className="text-red-400 line-through">{origLines[i]}</span></div>
                  )}
                  <div className={`flex ${isChanged ? "bg-green-500/10" : ""}`}>
                    <span className="w-8 text-right pr-2 text-white/60 select-none">{isChanged ? "+" : " "}</span>
                    <span className={isChanged ? "text-green-400" : "text-white/60"}>{line}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=Component | inputs=Props | outputs=JSX
