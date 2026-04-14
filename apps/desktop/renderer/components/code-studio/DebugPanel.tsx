"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  Bug, Trash2, Circle, ToggleLeft, ToggleRight,
  AlertTriangle, Info, XCircle, Play, Square,
} from "lucide-react";
import {
  startConsoleCapture,
  stopConsoleCapture,
  getConsoleLogs,
  clearConsoleLogs,
  getBreakpoints,
  toggleBreakpoint,
  removeBreakpoint,
  clearBreakpoints,
  type ConsoleEntry,
  type Breakpoint,
} from "@/lib/code-studio/features/debugger";

// IDENTITY_SEAL: PART-1 | role=Imports | inputs=none | outputs=types

// ============================================================
// PART 2 — Console Output Section
// ============================================================

function ConsoleSection() {
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [capturing, setCapturing] = useState(false);

  // Refresh logs periodically while capturing
  useEffect(() => {
    if (!capturing) return;
    const interval = setInterval(() => {
      setLogs(getConsoleLogs());
    }, 1000);
    return () => clearInterval(interval);
  }, [capturing]);

  const handleStart = useCallback(() => {
    startConsoleCapture();
    setCapturing(true);
  }, []);

  const handleStop = useCallback(() => {
    stopConsoleCapture();
    setCapturing(false);
    setLogs(getConsoleLogs());
  }, []);

  const handleClear = useCallback(() => {
    clearConsoleLogs();
    setLogs([]);
  }, []);

  const levelIcon = (level: ConsoleEntry["level"]) => {
    switch (level) {
      case "error": return <XCircle size={11} className="text-accent-red shrink-0" />;
      case "warn": return <AlertTriangle size={11} className="text-accent-amber shrink-0" />;
      default: return <Info size={11} className="text-accent-blue shrink-0" />;
    }
  };

  const levelBg = (level: ConsoleEntry["level"]) => {
    switch (level) {
      case "error": return "bg-accent-red/8";
      case "warn": return "bg-accent-amber/8";
      default: return "";
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-tertiary border-b border-border">
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Console</span>
        <div className="flex items-center gap-1">
          {capturing ? (
            <button onClick={handleStop} className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-accent-red hover:bg-accent-red/15 rounded transition-colors">
              <Square size={10} /> Stop
            </button>
          ) : (
            <button onClick={handleStart} className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-accent-green hover:bg-accent-green/15 rounded transition-colors">
              <Play size={10} /> Capture
            </button>
          )}
          <button onClick={handleClear} className="p-1 text-text-tertiary hover:text-accent-red transition-colors" title="Clear logs">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
        {logs.length === 0 ? (
          <div className="px-3 py-4 text-center text-[10px] text-text-tertiary">
            {capturing ? "Listening for console output..." : "Click Capture to start collecting logs"}
          </div>
        ) : (
          logs.map((entry, idx) => (
            <div key={idx} className={`flex items-start gap-1.5 px-3 py-1 text-[11px] font-mono border-b border-border/50 ${levelBg(entry.level)}`}>
              {levelIcon(entry.level)}
              <span className="text-text-primary break-all flex-1">{entry.message}</span>
              {entry.source && (
                <span className="text-[9px] text-text-tertiary shrink-0">{entry.source}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=ConsoleSection | inputs=debugger | outputs=JSX

// ============================================================
// PART 3 — Breakpoints Section
// ============================================================

function BreakpointsSection() {
  const [bps, setBps] = useState<Breakpoint[]>(() => getBreakpoints());

  // Refresh breakpoints periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setBps(getBreakpoints());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = useCallback((id: string) => {
    toggleBreakpoint(id);
    setBps(getBreakpoints());
  }, []);

  const handleRemove = useCallback((file: string, line: number) => {
    removeBreakpoint(file, line);
    setBps(getBreakpoints());
  }, []);

  const handleClearAll = useCallback(() => {
    clearBreakpoints();
    setBps([]);
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-tertiary border-b border-border">
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Breakpoints</span>
        <button onClick={handleClearAll} className="p-1 text-text-tertiary hover:text-accent-red transition-colors" title="Clear all">
          <Trash2 size={11} />
        </button>
      </div>
      <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
        {bps.length === 0 ? (
          <div className="px-3 py-4 text-center text-[10px] text-text-tertiary">
            No breakpoints set. Click the gutter in the editor to add one.
          </div>
        ) : (
          bps.map((bp) => (
            <div key={bp.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary group border-b border-border/50">
              <button onClick={() => handleToggle(bp.id)} className="shrink-0" title={bp.enabled ? "Disable" : "Enable"}>
                {bp.enabled ? (
                  <Circle size={10} className="text-accent-red fill-accent-red" />
                ) : (
                  <Circle size={10} className="text-text-tertiary" />
                )}
              </button>
              <span className="text-[11px] text-text-primary font-mono truncate flex-1">
                {bp.file}:{bp.line}
              </span>
              <button onClick={() => handleToggle(bp.id)} className="text-text-tertiary hover:text-text-secondary transition-colors" title="Toggle">
                {bp.enabled ? <ToggleRight size={14} className="text-accent-green" /> : <ToggleLeft size={14} />}
              </button>
              <button
                onClick={() => handleRemove(bp.file, bp.line)}
                className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent-red transition-all"
                title="Remove"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=BreakpointsSection | inputs=debugger | outputs=JSX

// ============================================================
// PART 4 — Main DebugPanel Component
// ============================================================

export function DebugPanel() {
  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Bug size={14} className="text-accent-red" />
        <span className="text-xs font-semibold text-text-primary">Debugger</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-accent-red/15 text-accent-red rounded">Beta</span>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <ConsoleSection />
        <BreakpointsSection />
      </div>
    </div>
  );
}

export default DebugPanel;

// IDENTITY_SEAL: PART-4 | role=DebugPanel | inputs=none | outputs=JSX
