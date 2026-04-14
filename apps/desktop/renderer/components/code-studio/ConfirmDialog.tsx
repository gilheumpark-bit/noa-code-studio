"use client";

// ============================================================
// PART 1 — Confirm Dialog Modal
// ============================================================

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "warning",
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Auto-focus cancel for safety
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const confirmColor =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-400"
      : variant === "warning"
        ? "bg-amber-500 hover:bg-amber-400"
        : "bg-amber-800 hover:bg-amber-600";

  const iconColor =
    variant === "danger" ? "text-red-400" : variant === "warning" ? "text-amber-400" : "text-amber-400";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="bg-[#0a0e17] border border-white/8 rounded-lg p-4 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className={iconColor} />
          <p className="text-sm font-semibold text-text-primary">{title}</p>
        </div>
        <p className="text-xs text-text-tertiary mb-4 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-text-tertiary hover:text-text-primary rounded hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs text-white rounded transition-colors ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-1 | role=ConfirmDialogModal | inputs=title,message,variant | outputs=confirm-or-cancel
