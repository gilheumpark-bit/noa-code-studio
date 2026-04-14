"use client";

import { useState } from "react";
import { Copy, FileInput, GitCompare, Play, Check } from "lucide-react";

interface CodeBlockActionsProps {
  code: string;
  language?: string;
  onInsertAtCursor?: (code: string) => void;
  onApplyDiff?: (code: string) => void;
  onRunInTerminal?: (code: string) => void;
}

export default function CodeBlockActions({
  code,
  language,
  onInsertAtCursor,
  onApplyDiff,
  onRunInTerminal,
}: CodeBlockActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard not available */ }
  };

  const actions = [
    {
      icon: copied ? <Check size={14} /> : <Copy size={14} />,
      label: copied ? "Copied" : "Copy",
      onClick: handleCopy,
      show: true,
    },
    {
      icon: <FileInput size={14} />,
      label: "Insert",
      onClick: () => onInsertAtCursor?.(code),
      show: !!onInsertAtCursor,
    },
    {
      icon: <GitCompare size={14} />,
      label: "Apply Diff",
      onClick: () => onApplyDiff?.(code),
      show: !!onApplyDiff,
    },
    {
      icon: <Play size={14} />,
      label: "Run",
      onClick: () => onRunInTerminal?.(code),
      show: !!onRunInTerminal && (language === "bash" || language === "shell" || language === "sh"),
    },
  ];

  return (
    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {actions
        .filter((a) => a.show)
        .map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            title={a.label}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            {a.icon}
            <span className="hidden sm:inline">{a.label}</span>
          </button>
        ))}
    </div>
  );
}
