"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// ============================================================
// PART 2 — Single Toast Component
// ============================================================

const TOAST_DURATION = 3000;
const MAX_TOASTS = 3;

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colorMap: Record<ToastType, { icon: string; border: string; progress: string; bg: string; glow: string }> = {
  success: { 
    icon: "text-accent-green", 
    border: "border-accent-green/30", 
    progress: "bg-accent-green",
    bg: "from-accent-green/20 to-accent-green/5",
    glow: "shadow-[0_0_20px_rgba(47,155,131,0.15)]"
  },
  error: { 
    icon: "text-accent-red", 
    border: "border-accent-red/30", 
    progress: "bg-accent-red",
    bg: "from-accent-red/20 to-accent-red/5",
    glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]"
  },
  info: { 
    icon: "text-accent-blue", 
    border: "border-accent-blue/30", 
    progress: "bg-accent-blue",
    bg: "from-accent-blue/20 to-accent-blue/5",
    glow: "shadow-[0_0_20px_rgba(92,143,214,0.15)]"
  },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [entering, setEntering] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);

  const Icon = iconMap[item.type];
  const colors = colorMap[item.type];

  useEffect(() => {
    startRef.current = Date.now();
    // Slide-in
    const enterTimer = setTimeout(() => setEntering(false), 50);
    // Progress bar countdown
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 30);
    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(item.id), 300);
    }, TOAST_DURATION);

    return () => {
      clearTimeout(enterTimer);
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.id, onDismiss]);

  const handleManualDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onDismiss(item.id), 300);
  }, [item.id, onDismiss]);

  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-linear-to- ${colors.bg} backdrop-blur-xl px-4 py-3.5 transition-all duration-300 ${colors.border} ${colors.glow} ${
        entering ? "translate-x-full opacity-0" : exiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
      }`}
    >
      <div className={`p-1.5 rounded-lg ${colors.bg}`}>
        <Icon className={`h-4 w-4 shrink-0 ${colors.icon}`} />
      </div>
      <span className="flex-1 font-mono text-[12px] font-medium text-text-primary">{item.message}</span>
      <button
        onClick={handleManualDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 p-1 rounded-lg text-text-tertiary transition-colors hover:text-text-primary hover:bg-white/5 active:scale-95"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/[0.06] rounded-b-2xl overflow-hidden">
        <div
          className={`h-full transition-none ${colors.progress}`}
          style={{ width: `${progress}%`, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}

// ============================================================
// PART 3 — Toast Provider
// ============================================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const newToast: ToastItem = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message,
      type,
      createdAt: Date.now(),
    };
    setToasts((prev) => {
      const next = [...prev, newToast];
      // Trim oldest if exceeding max
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-right */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
        style={{ maxWidth: 360 }}
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ============================================================
// PART 4 — Hook
// ============================================================

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ToastItem,ToastType
// IDENTITY_SEAL: PART-2 | role=ToastCard | inputs=item,dismiss | outputs=toast UI
// IDENTITY_SEAL: PART-3 | role=Provider | inputs=children | outputs=context+overlay
// IDENTITY_SEAL: PART-4 | role=Hook | inputs=none | outputs=toast()
