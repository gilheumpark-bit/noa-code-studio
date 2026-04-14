"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Files,
  Code2,
  MessageSquare,
  Terminal,
  Activity,
} from "lucide-react";

// IDENTITY_SEAL: PART-1 | role=imports-types | inputs=none | outputs=MobileLayoutProps,TabId

export interface MobileLayoutProps {
  explorer: React.ReactNode;
  editor: React.ReactNode;
  chat: React.ReactNode;
  terminal: React.ReactNode;
  pipeline: React.ReactNode;
  statusBar: React.ReactNode;
}

type TabId = "explorer" | "editor" | "chat" | "terminal" | "pipeline";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Files;
}

const TABS: TabDef[] = [
  { id: "explorer", label: "Explorer", icon: Files },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "pipeline", label: "Pipeline", icon: Activity },
];

// ============================================================
// PART 2 — useIsMobile Hook
// ============================================================

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    handleChange(mql);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

// IDENTITY_SEAL: PART-2 | role=responsive-hook | inputs=window.matchMedia | outputs=boolean

// ============================================================
// PART 3 — Swipe Gesture Handler
// ============================================================

function useSwipeNavigation(
  activeIndex: number,
  maxIndex: number,
  onSwipe: (newIndex: number) => void,
) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;

      // Only trigger swipe if horizontal distance > 60px and > vertical distance
      const THRESHOLD = 60;
      if (Math.abs(deltaX) > THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0 && activeIndex < maxIndex) {
          onSwipe(activeIndex + 1);
        } else if (deltaX > 0 && activeIndex > 0) {
          onSwipe(activeIndex - 1);
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [activeIndex, maxIndex, onSwipe],
  );

  return { onTouchStart, onTouchEnd };
}

// IDENTITY_SEAL: PART-3 | role=swipe-gesture | inputs=touch-events | outputs=onTouchStart,onTouchEnd

// ============================================================
// PART 4 — MobileLayout Component
// ============================================================

export default function MobileLayout({
  explorer,
  editor,
  chat,
  terminal,
  pipeline,
  statusBar,
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("editor");

  const activeIndex = TABS.findIndex((t) => t.id === activeTab);

  const handleSwipe = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < TABS.length) {
      setActiveTab(TABS[newIndex].id);
    }
  }, []);

  const { onTouchStart, onTouchEnd } = useSwipeNavigation(
    activeIndex,
    TABS.length - 1,
    handleSwipe,
  );

  const panelMap: Record<TabId, React.ReactNode> = {
    explorer,
    editor,
    chat,
    terminal,
    pipeline,
  };

  return (
    <div className="flex flex-col h-dvh w-full bg-bg-primary">
      {/* Active panel — full remaining height */}
      <div
        className="flex-1 overflow-auto"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {panelMap[activeTab]}
      </div>

      {/* Status bar */}
      <div className="shrink-0">{statusBar}</div>

      {/* Bottom tab bar */}
      <nav
        className="shrink-0 bg-bg-secondary border-t border-border"
        style={{
          height: 56,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-center justify-around h-full">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex flex-col items-center justify-center gap-0.5
                  flex-1 h-full transition-colors
                  font-mono
                  ${isActive
                    ? "text-accent-green"
                    : "text-text-tertiary hover:text-text-secondary"
                  }
                `}
              >
                <div className="relative">
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.5} />
                  {isActive && (
                    <span
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-accent-green"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span className="text-[10px] leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=mobile-layout | inputs=MobileLayoutProps | outputs=JSX
