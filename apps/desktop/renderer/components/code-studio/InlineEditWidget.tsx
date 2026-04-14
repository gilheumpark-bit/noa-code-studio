"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Sparkles, Check, X, Loader2, History, Undo2 } from "lucide-react";
import { streamChat } from "@/lib/ai-providers";

const INLINE_EDIT_HISTORY_KEY = "eh_inline_edit_history";
const MAX_HISTORY = 5;

function loadHistory(): string[] {
  try { const raw = localStorage.getItem(INLINE_EDIT_HISTORY_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

function saveToHistory(instruction: string) {
  const history = loadHistory().filter((h) => h !== instruction);
  history.unshift(instruction);
  localStorage.setItem(INLINE_EDIT_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function computeSimpleDiff(original: string, modified: string): { type: "same" | "add" | "remove"; text: string }[] {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const diff: { type: "same" | "add" | "remove"; text: string }[] = [];
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      diff.push({ type: "same", text: oldLines[oi] }); oi++; ni++;
    } else if (oi < oldLines.length && (ni >= newLines.length || oldLines[oi] !== newLines[ni])) {
      diff.push({ type: "remove", text: oldLines[oi] }); oi++;
    } else {
      diff.push({ type: "add", text: newLines[ni] }); ni++;
    }
  }
  return diff;
}

interface Props {
  selectedText: string;
  fullCode: string;
  language: string;
  onApply: (newText: string) => void;
  onCancel: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=Props,helpers

// ============================================================
// PART 2 — Component
// ============================================================

// eslint-disable-next-line unused-imports/no-unused-vars
export function InlineEditWidget({ selectedText, fullCode, language, onApply, onCancel, onUndo, canUndo }: Props) {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history] = useState<string[]>(loadHistory);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLPreElement>(null);

  const selectionLineCount = selectedText.split("\n").length;
  const isMultiLine = selectionLineCount > 1;

  const contextSize = useMemo(() => {
    const totalChars = fullCode.slice(0, 2000).length + selectedText.length + prompt.length;
    return Math.round(totalChars / 4);
  }, [fullCode, selectedText, prompt]);

  useEffect(() => { if (preview && previewRef.current) previewRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [preview]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const diffLines = preview ? computeSimpleDiff(selectedText, preview) : [];

  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    saveToHistory(prompt.trim());
    setLoading(true); setPreview(""); setError(null);
    try {
      const systemPrompt = `You are a code refiner. The user selected code and wants you to modify ONLY the selected portion. Return ONLY the modified code, no explanations.`;
      let result = '';
      await streamChat({
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: `Instruction: ${prompt}\n\nSelected code:\n${selectedText}` }],
        temperature: 0.3,
        onChunk: (text) => { result = text; setPreview(text); },
        signal: AbortSignal.timeout(30000),
      });
      if (!result) setError("AI returned empty response");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      setError(msg);
      setPreview("");
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, selectedText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (preview && !loading) onApply(preview); else handleGenerate(); }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="absolute z-50 bg-[#0f1419] border border-amber-700/45 rounded-lg shadow-2xl p-2 w-[400px]" style={{ backdropFilter: "blur(8px)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-amber-400 shrink-0" />
        <input ref={inputRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="수정 지시 (Enter: 생성, Esc: 취소)"
          className="flex-1 bg-white/5 text-xs text-white px-2 py-1.5 rounded outline-none placeholder:text-white/50" disabled={loading} />
        {history.length > 0 && (
          <button onClick={() => setShowHistory((v) => !v)} className="text-white/60 hover:text-amber-400 transition-colors"><History size={12} /></button>
        )}
        {loading && <Loader2 size={14} className="animate-spin text-amber-400" />}
      </div>
      {showHistory && history.length > 0 && (
        <div className="mb-2 bg-white/5 rounded p-1 max-h-24 overflow-y-auto">
          {history.map((h, i) => (
            <button key={i} onClick={() => { setPrompt(h); setShowHistory(false); }}
              className="block w-full text-left text-[10px] px-2 py-1 hover:bg-white/10 rounded truncate text-white/60">{h}</button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-[9px] text-white/50 mb-1 px-1">
        <span>선택{isMultiLine ? ` (${selectionLineCount}줄)` : ""}: <span className="text-red-400 line-through">{selectedText.slice(0, 80)}{selectedText.length > 80 ? "..." : ""}</span></span>
        <span className="flex items-center gap-2">
          <span>~{contextSize} tokens</span>
          {canUndo && onUndo && (
            <button onClick={onUndo} className="flex items-center gap-0.5 text-amber-400 hover:text-amber-300"><Undo2 size={10} /> 되돌리기</button>
          )}
        </span>
      </div>
      {preview && diffLines.length > 0 && (
        <div className="mb-2">
          <pre ref={previewRef} className="text-[10px] font-mono bg-[#0a0e17] p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
            {diffLines.map((line, i) => (
              <div key={i} className={line.type === "add" ? "text-green-400 bg-green-500/10" : line.type === "remove" ? "text-red-400 bg-red-500/10 line-through" : "text-white/60"}>
                {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}{line.text}
              </div>
            ))}
          </pre>
        </div>
      )}
      {preview && diffLines.length === 0 && (
        <div className="mb-2">
          <pre className="text-[10px] font-mono bg-[#0a0e17] p-2 rounded max-h-32 overflow-y-auto text-green-400 whitespace-pre-wrap">{preview}</pre>
        </div>
      )}
      {error && (
        <div className="mb-2 px-2 py-1 text-[10px] text-red-400 bg-red-500/10 rounded">{error}</div>
      )}
      {preview && !loading && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="flex items-center gap-1 px-2 py-1 text-[10px] text-white/60 hover:text-red-400"><X size={10} /> 거절</button>
          <button onClick={() => onApply(preview)} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">
            <Check size={10} /> 수락 (Enter)
          </button>
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=Component | inputs=Props | outputs=JSX
