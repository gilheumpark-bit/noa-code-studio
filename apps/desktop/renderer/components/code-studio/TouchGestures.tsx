"use client";

import React, { useRef, useCallback } from "react";

export interface TouchGesturesProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinchZoom?: (scale: number) => void;
  onLongPress?: (x: number, y: number) => void;
  threshold?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  startDistance: number | null;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  swiped: boolean;
}

function getTouchDistance(a: React.Touch, b: React.Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

const LONG_PRESS_MS = 500;

export function TouchGestures({
  onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown,
  onPinchZoom, onLongPress, threshold = 50,
  children, className, style,
}: TouchGesturesProps) {
  const stateRef = useRef<TouchState>({
    startX: 0, startY: 0, startTime: 0,
    startDistance: null, longPressTimer: null, swiped: false,
  });

  const clearLongPress = useCallback(() => {
    const s = stateRef.current;
    if (s.longPressTimer) { clearTimeout(s.longPressTimer); s.longPressTimer = null; }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const s = stateRef.current;
    s.swiped = false;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      s.startX = t.clientX; s.startY = t.clientY; s.startTime = Date.now(); s.startDistance = null;
      if (onLongPress) {
        s.longPressTimer = setTimeout(() => { onLongPress(t.clientX, t.clientY); }, LONG_PRESS_MS);
      }
    } else if (e.touches.length === 2 && onPinchZoom) {
      clearLongPress();
      s.startDistance = getTouchDistance(e.touches[0], e.touches[1]);
    }
  }, [onLongPress, onPinchZoom, clearLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const s = stateRef.current;
    if (e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - s.startX);
      const dy = Math.abs(e.touches[0].clientY - s.startY);
      if (dx > 10 || dy > 10) clearLongPress();
    }
    if (e.touches.length === 2 && onPinchZoom && s.startDistance !== null) {
      const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
      onPinchZoom(currentDist / s.startDistance);
    }
  }, [onPinchZoom, clearLongPress]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    clearLongPress();
    const s = stateRef.current;
    if (e.changedTouches.length !== 1 || s.swiped) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const elapsed = Date.now() - s.startTime;
    if (elapsed > 400) return;

    if (absDx > absDy && absDx >= threshold) {
      s.swiped = true;
      if (dx > 0) onSwipeRight?.(); else onSwipeLeft?.();
    } else if (absDy > absDx && absDy >= threshold) {
      s.swiped = true;
      if (dy > 0) onSwipeDown?.(); else onSwipeUp?.();
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, clearLongPress]);

  return (
    <div className={className} style={style}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {children}
    </div>
  );
}
