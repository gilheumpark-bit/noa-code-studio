"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as TerminalIcon, Loader2 } from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { createT } from "@/lib/i18n";
import type { AppLanguage } from "@noa/shared-types";
import "@xterm/xterm/css/xterm.css";

// ============================================================
// PART 1 — Imports & Definitions
// ============================================================

export interface NativeTerminalProps {
  cwd?: string;
}

// IDENTITY_SEAL: PART-1 | role=imports | inputs=none | outputs=NativeTerminalProps

// ============================================================
// PART 2 — Component
// ============================================================

export function NativeTerminal({ cwd }: NativeTerminalProps) {
  const { lang } = useLang();
  const t = createT(lang as AppLanguage);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const shellIdRef = useRef<string | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const hasShell = typeof window !== "undefined" && !!window.cs?.shell;
  const [booting, setBooting] = useState(hasShell);
  const [error, setError] = useState<string | null>(() => hasShell ? null : (t('terminalPanel.fallbackToBuiltin') ?? "window.cs.shell not available"));

  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Initialize terminal and hook up to Electron IPC
  useEffect(() => {
    let active = true;
    const container = containerRef.current;

    if (!container || !hasShell) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace",
      fontSize: 12,
      theme: {
        background: 'transparent',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    fitAddon.fit();

    term.writeln("\x1b[38;2;88;166;255mEH Code Studio Terminal v2.0 \u2014 Native Local PTY Ready\x1b[0m");

    const sessionId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    shellIdRef.current = sessionId;

    let cleanupData: (() => void) | undefined;
    let cleanupExit: (() => void) | undefined;

    window.cs.shell.create({ id: sessionId, cwd, cols: term.cols, rows: term.rows })
      .then((res) => {
        if (!active) return window.cs.shell.dispose(sessionId);
        if (!res.ok) throw new Error("Failed to create pty session");
        
        setBooting(false);

        // Listen for data from system shell to xterm
        cleanupData = window.cs.shell.onData(sessionId, (data) => {
          term.write(data);
        });

        // Listen for exit
        cleanupExit = window.cs.shell.onExit(sessionId, (e) => {
          term.writeln(`\r\n\x1b[31m[Process exited with code ${e.exitCode}]\x1b[0m`);
        });

        // Send data from xterm to system shell
        term.onData((data) => {
          window.cs.shell.write(sessionId, data);
        });

        // Handle resize
        term.onResize((dim) => {
          window.cs.shell.resize(sessionId, dim.cols, dim.rows);
        });

        // Auto-fit on container resize
        const ro = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (active && fitAddonRef.current) fitAddonRef.current.fit();
          });
        });
        ro.observe(container);
        resizeObserverRef.current = ro;
      })
      .catch((err) => {
        console.warn('[NativeTerminal] PTY start:', err);
        if (active) {
          term.writeln(`\r\n\x1b[31mError starting PTY: ${err.message}\x1b[0m`);
          setError(err.message);
          setBooting(false);
        }
      });

    return () => {
      active = false;
      if (cleanupData) cleanupData();
      if (cleanupExit) cleanupExit();
      if (shellIdRef.current) window.cs.shell.dispose(shellIdRef.current);
      if (resizeObserverRef.current) resizeObserverRef.current.unobserve(container);
      term.dispose();
    };
  }, [cwd, t]);

  return (
    <div className="h-48 border-t border-white/8 bg-bg-primary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-bg-secondary border-b border-white/8">
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <TerminalIcon size={12} /> {t('terminalPanel.terminal') || "Terminal"}
          <span className="text-[9px] px-1 py-0.5 bg-blue-500/15 text-blue-400 rounded">
            Local PTY
          </span>
          {booting && <Loader2 size={10} className="animate-spin text-blue-400" />}
        </span>
      </div>

      {error ? (
        <div className="p-4 text-xs text-red-400 font-mono">
          PTY Initialization Failed: {error}
        </div>
      ) : (
        <div className="flex-1 w-full overflow-hidden p-2" ref={containerRef} />
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=component | inputs=NativeTerminalProps | outputs=JSX terminal UI
