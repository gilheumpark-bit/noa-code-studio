"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, RefreshCw, TestTube2, Bug, FileText, Languages } from "lucide-react";

interface Props {
  selectedText: string;
  position: { top: number; left: number };
  language: string;
  onAction: (action: string, result?: string) => void;
  onClose: () => void;
}

interface ActionItem { id: string; label: string; icon: React.ReactNode; prompt: string }

const ACTIONS: ActionItem[] = [
  { id: "explain", label: "설명", icon: <BookOpen size={13} />, prompt: "Explain the following code concisely:" },
  { id: "refactor", label: "리팩터", icon: <RefreshCw size={13} />, prompt: "Refactor the following code:" },
  { id: "test", label: "테스트", icon: <TestTube2 size={13} />, prompt: "Generate unit tests:" },
  { id: "bugs", label: "버그 찾기", icon: <Bug size={13} />, prompt: "Find bugs:" },
  { id: "document", label: "문서화", icon: <FileText size={13} />, prompt: "Generate documentation:" },
  { id: "translate", label: "번역", icon: <Languages size={13} />, prompt: "Translate comments:" },
];

export function QuickActions({ selectedText, position, language, onAction, onClose }: Props) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (barRef.current && !barRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleAction = useCallback((action: ActionItem) => {
    const contextPrompt = `${action.prompt}\n\nLanguage: ${language}\n\n\`\`\`${language}\n${selectedText}\n\`\`\``;
    onAction(action.id, contextPrompt); onClose();
  }, [selectedText, language, onAction, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setFocusIndex((i) => (i + 1) % ACTIONS.length); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setFocusIndex((i) => (i - 1 + ACTIONS.length) % ACTIONS.length); return; }
      if (e.key === "Enter" && focusIndex >= 0) { e.preventDefault(); handleAction(ACTIONS[focusIndex]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, focusIndex, handleAction]);

  const adjustedTop = Math.max(8, position.top - 40);
  const adjustedLeft = Math.max(8, Math.min(position.left, (typeof window !== "undefined" ? window.innerWidth : 1000) - 380));

  return (
    <div ref={barRef} className="fixed z-[400]" style={{ top: adjustedTop, left: adjustedLeft }}>
      <div className="flex items-center gap-0.5 px-1.5 py-1 bg-[#0f1419] border border-white/10 rounded-lg shadow-xl">
        {ACTIONS.map((action, i) => (
          <button key={action.id} onClick={() => handleAction(action)} onMouseEnter={() => setFocusIndex(i)} title={action.label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md transition-colors whitespace-nowrap ${
              focusIndex === i ? "bg-amber-900/30 text-amber-400" : "text-white/50 hover:text-white hover:bg-white/5"
            }`}>
            {action.icon}<span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
