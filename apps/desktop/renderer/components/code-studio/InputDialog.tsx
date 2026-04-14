"use client";

// ============================================================
// PART 1 — Input Dialog Modal
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputDialog({
  title,
  description,
  placeholder = "",
  defaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  validate,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    onConfirm(trimmed);
  }, [value, validate, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape") onCancel();
    },
    [handleSubmit, onCancel],
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-dialog-title"
        className="bg-[#0a0e17] border border-white/8 rounded-lg p-4 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="input-dialog-title" className="text-xs font-semibold mb-1 text-text-primary">
          {title}
        </p>
        {description && (
          <p className="text-[10px] text-text-tertiary mb-2">{description}</p>
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={title}
          className={`w-full bg-white/5 text-xs px-3 py-2 rounded border outline-none transition-colors
            ${error ? "border-red-400 focus:border-red-400" : "border-white/8 focus:border-amber-600/50"}`}
        />
        {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1 text-xs bg-amber-800 text-stone-100 rounded hover:bg-amber-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-1 | role=InputDialogModal | inputs=title,placeholder,defaultValue,validate | outputs=confirmed-string
