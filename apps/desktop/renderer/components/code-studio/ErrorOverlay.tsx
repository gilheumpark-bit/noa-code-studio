"use client";

import { AlertTriangle, X, Sparkles } from "lucide-react";

interface Props {
  error: { message: string; stack?: string; file?: string; line?: number } | null;
  onDismiss: () => void;
  onFixWithAI?: () => void;
}

export default function ErrorOverlay({ error, onDismiss, onFixWithAI }: Props) {
  if (!error) return null;

  const stackLines = error.stack ? error.stack.split("\n").filter((l) => l.trim()) : [];

  return (
    <div className="absolute inset-0 z-[100] bg-red-900/92 text-white flex flex-col font-mono text-[13px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/15 bg-black/20">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-300" />
          <span className="font-bold text-sm">
            {error.file ? `${error.file}${error.line ? `:${error.line}` : ""}` : "Runtime Error"}
          </span>
        </div>
        <div className="flex gap-2">
          {onFixWithAI && (
            <button onClick={onFixWithAI}
              className="flex items-center gap-1.5 px-3 py-1 text-xs bg-white/15 border border-white/30 rounded hover:bg-white/25 transition-colors">
              <Sparkles size={12} /> AI로 수정
            </button>
          )}
          <button onClick={onDismiss}
            className="flex items-center gap-1.5 px-3 py-1 text-xs bg-white/15 border border-white/30 rounded hover:bg-white/25 transition-colors">
            <X size={12} /> 닫기
          </button>
        </div>
      </div>

      {/* Error message */}
      <div className="px-4 py-3 text-[15px] font-semibold leading-relaxed border-b border-white/10">
        {error.message}
      </div>

      {/* Stack trace */}
      {stackLines.length > 0 && (
        <div className="flex-1 overflow-auto px-4 py-3">
          <div className="text-[11px] text-white/50 mb-2 uppercase tracking-widest">Stack Trace</div>
          {stackLines.map((line, i) => (
            <div key={i} className="py-0.5 text-white/70 whitespace-pre-wrap break-all">{line}</div>
          ))}
        </div>
      )}

      {error.file && error.line && (
        <div className="px-4 py-2 border-t border-white/10 bg-black/15 text-xs text-white/60">
          {error.file}:{error.line}
        </div>
      )}
    </div>
  );
}
