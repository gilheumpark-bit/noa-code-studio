"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useCallback, useRef, useState } from "react";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  minSize?: number;
  maxSize?: number;
}

export type { ResizeHandleProps };

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ResizeHandleProps

// ============================================================
// PART 2 — ResizeHandle Component
// ============================================================

export function ResizeHandle({
  direction,
  onResize,
  minSize,
  maxSize,
}: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);
  const accumulatedRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      accumulatedRef.current = 0;
      lastPosRef.current =
        direction === "horizontal" ? e.clientX : e.clientY;
      setIsDragging(true);

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const current =
          direction === "horizontal" ? ev.clientX : ev.clientY;
        let delta = current - lastPosRef.current;
        lastPosRef.current = current;

        // Apply min/max constraints if provided
        if (minSize != null || maxSize != null) {
          const projected = accumulatedRef.current + delta;
          if (minSize != null && projected < minSize - 500) {
            delta = 0;
          }
          if (maxSize != null && projected > maxSize) {
            delta = 0;
          }
          accumulatedRef.current += delta;
        }

        onResize(delta);
      };

      const handleMouseUp = () => {
        draggingRef.current = false;
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, onResize, minSize, maxSize],
  );

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`shrink-0 transition-colors group ${
        isHorizontal
          ? "w-1 cursor-col-resize hover:w-1"
          : "h-1 cursor-row-resize hover:h-1"
      } ${
        isDragging
          ? "bg-accent-purple/50"
          : "bg-transparent hover:bg-accent-purple/30"
      }`}
      role="separator"
      aria-orientation={isHorizontal ? "vertical" : "horizontal"}
      aria-label={isHorizontal ? "가로 크기 조절" : "세로 크기 조절"}
    >
      {/* Visual feedback line — appears on hover/drag */}
      <div
        className={`transition-opacity ${
          isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        } ${
          isHorizontal
            ? "w-px h-full mx-auto bg-accent-purple/60"
            : "h-px w-full my-auto bg-accent-purple/60"
        }`}
      />
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=ResizeHandle | inputs=ResizeHandleProps | outputs=JSX
