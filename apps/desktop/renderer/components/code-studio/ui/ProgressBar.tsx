"use client";

// ============================================================
// ProgressBar — Token-based progress indicator
// ============================================================
// Wraps existing .ds-metric-bar CSS pattern into a React component.
// Auto-maps score ranges to project accent colors.

import type { ReactNode } from "react";

interface ProgressBarProps {
  /** Value 0-100 */
  value: number;
  /** Max value (default 100) */
  max?: number;
  /** Override bar color (Tailwind bg class). Auto-mapped if omitted. */
  color?: string;
  /** Show percentage label */
  showLabel?: boolean;
  /** Custom label (overrides percentage) */
  label?: ReactNode;
  /** Height variant */
  size?: "xs" | "sm" | "md";
  /** Accessible label */
  ariaLabel?: string;
  className?: string;
}

/** Auto-map score → project accent color */
function autoColor(pct: number): string {
  if (pct >= 85) return "bg-accent-green";
  if (pct >= 70) return "bg-accent-blue";
  if (pct >= 55) return "bg-accent-amber";
  if (pct >= 40) return "bg-accent-amber/70";
  return "bg-accent-red";
}

const sizeMap = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
};

export function ProgressBar({
  value,
  max = 100,
  color,
  showLabel = false,
  label,
  size = "sm",
  ariaLabel,
  className = "",
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const barColor = color ?? autoColor(pct);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex-1 ${sizeMap[size]} bg-bg-tertiary rounded-full overflow-hidden`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        <div
          className={`${sizeMap[size]} ${barColor} rounded-full`}
          style={{
            width: `${pct}%`,
            transition: `width var(--transition-normal)`,
          }}
        />
      </div>
      {(showLabel || label) && (
        <span className="text-[10px] font-mono text-text-tertiary tabular-nums min-w-[2.5rem] text-right">
          {label ?? `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  );
}

// ============================================================
// ScoreBar — labeled progress with grade display
// ============================================================

interface ScoreBarProps {
  score: number;
  grade?: string;
  label: string;
  className?: string;
}

export function ScoreBar({ score, grade, label, className = "" }: ScoreBarProps) {
  return (
    <div className={`flex items-center gap-2 py-1 ${className}`}>
      <span className="text-[11px] text-text-secondary w-[100px] truncate">{label}</span>
      <ProgressBar value={score} size="xs" showLabel className="flex-1" />
      {grade && (
        <span className={`text-[10px] font-bold font-mono min-w-[1.5rem] text-center
          ${score >= 85 ? "text-accent-green" : score >= 70 ? "text-accent-blue" : score >= 55 ? "text-accent-amber" : "text-accent-red"}`}>
          {grade}
        </span>
      )}
    </div>
  );
}
