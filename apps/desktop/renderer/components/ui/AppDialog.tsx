'use client';

import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  variant: 'alert' | 'confirm';
  /** Cancel / backdrop / Escape */
  onClose: () => void;
  /** Confirm dialog: primary OK */
  onConfirm?: () => void;
  /** Alert dialog: single OK */
  onAlertOk?: () => void;
};

export function AppDialog({ open, title, message, variant, onClose, onConfirm, onAlertOk }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current?.querySelector<HTMLButtonElement>('button[data-autofocus]');
    el?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="theme-bright relative z-10 w-full max-w-md rounded-2xl border border-white/20 bg-white/95 p-6 shadow-2xl dark:bg-slate-900/95"
      >
        <h2 id="app-dialog-title" className="text-sm font-black uppercase tracking-widest theme-text-primary">
          {title}
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed theme-text-secondary">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          {variant === 'confirm' && (
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className="theme-pill rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wide"
            >
              취소
            </button>
          )}
          <button
            type="button"
            data-autofocus={variant === 'alert' ? true : undefined}
            onClick={() => {
              if (variant === 'confirm') onConfirm?.();
              else onAlertOk?.();
            }}
            className="rounded-xl bg-linear-to-r from-amber-800 to-stone-900 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-stone-100 shadow-lg shadow-amber-950/25"
          >
            {variant === 'confirm' ? '확인' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  );
}
