"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import React, { useState, useCallback } from "react";
import { PanelLeft, PanelRight, Terminal, X } from "lucide-react";

export interface TabletLayoutProps {
  sidebar: React.ReactNode;
  editor: React.ReactNode;
  rightPanel: React.ReactNode;
  terminal: React.ReactNode;
  statusBar: React.ReactNode;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=TabletLayoutProps

// ============================================================
// PART 2 — Component
// ============================================================

export function TabletLayout({ sidebar, editor, rightPanel, terminal, statusBar }: TabletLayoutProps) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarVisible((v) => !v), []);
  const toggleRightPanel = useCallback(() => setRightPanelVisible((v) => !v), []);
  const toggleTerminal = useCallback(() => setTerminalVisible((v) => !v), []);

  return (
    <div className="flex flex-col h-full">
      {/* Compact toolbar */}
      <div className="flex items-center gap-1 px-2 border-b border-white/8 bg-[#0a0e17]" style={{ height: 44, minHeight: 44 }}>
        <button className="flex items-center justify-center rounded hover:bg-white/10" style={{ minWidth: 44, minHeight: 44 }}
          onClick={toggleSidebar} aria-label="Toggle sidebar" aria-pressed={sidebarVisible}>
          <PanelLeft size={18} className="text-white/60" />
        </button>
        <div className="flex-1" />
        <button className="flex items-center justify-center rounded hover:bg-white/10" style={{ minWidth: 44, minHeight: 44 }}
          onClick={toggleRightPanel} aria-label="Toggle right panel" aria-pressed={rightPanelVisible}>
          <PanelRight size={18} className="text-white/60" />
        </button>
        <button className="flex items-center justify-center rounded hover:bg-white/10" style={{ minWidth: 44, minHeight: 44 }}
          onClick={toggleTerminal} aria-label="Toggle terminal" aria-pressed={terminalVisible}>
          <Terminal size={18} className="text-white/60" />
        </button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden relative">
        {sidebarVisible && (
          <div className="shrink-0 border-r border-white/8 bg-[#0f1419] overflow-y-auto" style={{ width: 200, minWidth: 160 }}>
            {sidebar}
          </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          {editor}
          {terminalVisible && (
            <div className="border-t border-white/8 bg-[#0f1419] flex flex-col" style={{ maxHeight: "40vh", minHeight: 120 }}>
              <div className="flex items-center justify-between px-3 py-1 border-b border-white/8">
                <span className="text-xs text-white/60">터미널</span>
                <button className="flex items-center justify-center rounded hover:bg-white/10" style={{ minWidth: 44, minHeight: 44 }}
                  onClick={() => setTerminalVisible(false)} aria-label="Close terminal"><X size={14} className="text-white/60" /></button>
              </div>
              <div className="flex-1 overflow-hidden">{terminal}</div>
            </div>
          )}
        </div>
        {rightPanelVisible && (
          <>
            <div className="absolute inset-0 z-[59] bg-black/30" onClick={() => setRightPanelVisible(false)} />
            <div className="absolute top-0 right-0 bottom-0 z-[60] bg-[#0f1419] border-l border-white/8 overflow-y-auto" style={{ width: 320 }}>
              <div className="flex items-center justify-between px-3 py-1 border-b border-white/8">
                <span className="text-xs text-white/60">EH 엔진</span>
                <button className="flex items-center justify-center rounded hover:bg-white/10" style={{ minWidth: 44, minHeight: 44 }}
                  onClick={() => setRightPanelVisible(false)} aria-label="Close right panel"><X size={14} className="text-white/60" /></button>
              </div>
              <div className="flex-1 overflow-hidden">{rightPanel}</div>
            </div>
          </>
        )}
      </div>
      {statusBar}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=Component | inputs=TabletLayoutProps | outputs=JSX
