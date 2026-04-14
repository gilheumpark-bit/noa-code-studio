"use client";

/**
 * @module PreviewPanel
 *
 * SIMULATED -- requires WebContainer/real backend for production use.
 *
 * What is simulated:
 *   - WebContainer boot and dev server start fall back to a simulated
 *     runner when real WebContainer API is unavailable (most browsers)
 *   - `npm install` and dependency resolution are stubbed in simulation mode
 *   - HMR (Hot Module Replacement) bridge sends postMessage events but
 *     actual module-level hot replacement requires a real bundler
 *   - Console capture relies on iframe postMessage protocol; real console
 *     interception needs injected runtime scripts
 *
 * What is real:
 *   - Full preview infrastructure: iframe sandbox, URL bar, navigation
 *   - Device simulation modes (responsive, mobile 375px, tablet 768px, desktop 1280px)
 *   - Framework auto-detection from package.json (Next.js, React, Vue, Svelte, HTML)
 *   - HMR bridge with debounced file-change notifications
 *   - Console panel with log/warn/error/info filtering
 *   - Navigation history (back/forward/refresh) and external open
 *   - Automatic file sync to WebContainer on code changes
 *
 * To make fully functional:
 *   1. Ensure WebContainer API availability (requires cross-origin isolation headers)
 *   2. COOP/COEP headers are already configured in next.config.ts for /code-studio
 *   3. Implement real `npm install` via WebContainer's package manager
 *   4. Wire HMR bridge to Vite/Webpack HMR client for true hot updates
 *   5. Inject console-capture runtime into the iframe for full console interception
 */

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  createWebContainer,
  type WebContainerInstance,
} from "@/lib/code-studio/features/webcontainer";
import { createHMRBridge, type HMRBridge, type HMREvent } from "@/lib/code-studio/features/preview-hmr";
import type { FileNode } from "@noa/quill-engine/types";
import { useCodeStudioT } from "@/lib/use-code-studio-translations";

type PreviewState = "idle" | "booting" | "installing" | "starting" | "ready" | "error";
type DeviceMode = "responsive" | "mobile" | "tablet" | "desktop";

interface ConsoleEntry {
  id: string;
  type: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
}

interface PreviewPanelProps {
  files: FileNode[];
  visible: boolean;
}

const DEVICE_WIDTHS: Record<Exclude<DeviceMode, "responsive">, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
};

// IDENTITY_SEAL: PART-1 | role=타입 정의 | inputs=none | outputs=PreviewState, DeviceMode, PreviewPanelProps

// ============================================================
// PART 2 — File Tree Utility
// ============================================================

function findFile(nodes: FileNode[], name: string): FileNode | null {
  for (const node of nodes) {
    if (node.type === "file" && node.name === name) return node;
    if (node.type === "folder" && node.children) {
      const found = findFile(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// IDENTITY_SEAL: PART-2 | role=파일 탐색 | inputs=FileNode[], name | outputs=FileNode | null

// ============================================================
// PART 3 — PreviewPanel Component
// ============================================================

export default function PreviewPanel({ files, visible }: PreviewPanelProps) {
  const t = useCodeStudioT();
  const [state, setState] = useState<PreviewState>("idle");
  const [previewUrl, setPreviewUrl] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<WebContainerInstance | null>(null);
  const serverReadyRef = useRef(false);
  const lastFilesMapRef = useRef<Record<string, string>>({});

  const [deviceMode, setDeviceMode] = useState<DeviceMode>("responsive");
  const [showConsole, setShowConsole] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [navHistory, setNavHistory] = useState<string[]>([]);
  const [navIndex, setNavIndex] = useState(-1);

  const hmrBridgeRef = useRef<HMRBridge | null>(null);
  const projectFiles = useMemo(() => flattenFiles(files), [files]);
  const previewOrigin = useMemo(() => {
    if (!previewUrl) return "";
    try {
      return new URL(previewUrl).origin;
    } catch {
      return "";
    }
  }, [previewUrl]);

  // Auto-detect framework
  const detectedFramework = useMemo(() => {
    const pkgFile = findFile(files, "package.json");
    if (pkgFile?.content) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps["next"]) return "Next.js";
        if (allDeps["react"]) return "React";
        if (allDeps["vue"]) return "Vue";
        if (allDeps["svelte"]) return "Svelte";
      } catch { /* ignore */ }
    }
    if (findFile(files, "index.html")) return "HTML";
    return null;
  }, [files]);

  const errorCount = useMemo(
    () => consoleEntries.filter((e) => e.type === "error").length,
    [consoleEntries],
  );

  // ── Boot & start dev server ──
  const startPreview = useCallback(async () => {
    try {
      setState("booting");
      const wc = await createWebContainer();
      containerRef.current = wc;

      setState("installing");

      // Write all project files to the container concurrently.
      const initialMap: Record<string, string> = {};
      const writes = projectFiles.map((file) => {
        initialMap[file.path] = file.content;
        return wc.writeFile(file.path, file.content);
      });
      await Promise.all(writes);
      lastFilesMapRef.current = initialMap;

      if (wc.isAvailable) {
        await wc.installDependencies();
      }

      setState("starting");
      const url = await wc.startDevServer(3000);
      serverReadyRef.current = true;
      setPreviewUrl(url);
      setDisplayUrl(url);
      setState("ready");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [projectFiles]);

   // ── Auto-refresh on file changes ──
  useEffect(() => {
    if (!visible || !serverReadyRef.current || !containerRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const wc = containerRef.current;
        if (!wc) return;
        
        // 정밀 진단 Action-1: Diff 기반 Virtual FS 동기화
        const writes: Promise<void>[] = [];
        const currentMap: Record<string, string> = {};
        for (const file of projectFiles) {
          currentMap[file.path] = file.content;
          if (lastFilesMapRef.current[file.path] !== file.content) {
            writes.push(wc.writeFile(file.path, file.content));
          }
        }
        lastFilesMapRef.current = currentMap;
        
        if (writes.length > 0) {
          await Promise.all(writes);
          // Action-2: iframe.src 강제 초기화 제거 (HMR Bridge가 처리하도록 위임)
        }
      } catch { /* silent */ }
    }, 1000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [projectFiles, visible]);

  // ── Initialize HMR Bridge when iframe is ready ──
  useEffect(() => {
    if (state !== "ready" || !iframeRef.current) return;
    if (hmrBridgeRef.current) { hmrBridgeRef.current.dispose(); hmrBridgeRef.current = null; }
    const bridge = createHMRBridge(iframeRef.current, {
      debounceMs: 300,
      targetOrigin: previewOrigin || undefined,
    });
    bridge.on("client-error", (event: HMREvent) => {
      if (event.error) {
        setConsoleEntries((prev) => [...prev, {
          id: crypto.randomUUID(), type: "error", message: `[HMR] ${event.error}`, timestamp: Date.now(),
        }]);
      }
    });
    bridge.on("hmr-fail-full-reload", () => {
      if (iframeRef.current && previewUrl) iframeRef.current.src = previewUrl;
    });
    hmrBridgeRef.current = bridge;
    return () => { hmrBridgeRef.current?.dispose(); hmrBridgeRef.current = null; };
  }, [state, previewOrigin, previewUrl]);

  // ── Notify HMR bridge on file changes ──
  useEffect(() => {
    if (!hmrBridgeRef.current || state !== "ready") return;
    for (const file of projectFiles) {
      if (file.content != null) {
        hmrBridgeRef.current.fileChanged(file.path, file.content);
      }
    }
  }, [projectFiles, state]);

  // ── Start on first visible ──
  useEffect(() => {
    if (visible && state === "idle") {
      const id = requestAnimationFrame(() => startPreview());
      return () => cancelAnimationFrame(id);
    }
  }, [visible, state, startPreview]);

  // ── Console capture from iframe ──
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      if (previewOrigin && event.origin !== previewOrigin) return;
      if (event.data?.__eh_console) {
        const { type, args } = event.data.__eh_console as { type: string; args: string[] };
        setConsoleEntries((prev) => [...prev.slice(-200), {
          id: crypto.randomUUID(), type: (type as ConsoleEntry["type"]) || "log",
          message: args.join(" "), timestamp: Date.now(),
        }]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [previewOrigin]);

  // ── Navigation ──
  const handleRefresh = useCallback(() => {
    if (iframeRef.current && previewUrl) iframeRef.current.src = previewUrl;
  }, [previewUrl]);

  const handleOpenExternal = useCallback(() => {
    if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
  }, [previewUrl]);

  const handleNavBack = useCallback(() => {
    if (navIndex > 0) { const ni = navIndex - 1; setNavIndex(ni); if (iframeRef.current) iframeRef.current.src = navHistory[ni]; }
  }, [navIndex, navHistory]);

  const handleNavForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) { const ni = navIndex + 1; setNavIndex(ni); if (iframeRef.current) iframeRef.current.src = navHistory[ni]; }
  }, [navIndex, navHistory]);

  // Track iframe navigation
  useEffect(() => {
    if (!iframeRef.current || state !== "ready") return;
    const iframe = iframeRef.current;
    const onLoad = () => {
      setIsLoading(false);
      try {
        const currentUrl = iframe.contentWindow?.location.href;
        if (currentUrl && currentUrl !== "about:blank") {
          setNavIndex((prev) => { setNavHistory((h) => [...h.slice(0, prev + 1), currentUrl]); return prev + 1; });
        }
      } catch { /* cross-origin */ }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [state]);

  if (!visible) return null;

  // ── Render ──
  return (
    <div className="flex flex-col h-full bg-[#0a0e17] text-text-secondary">
      {/* Toolbar Row 1 — URL Bar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-white/8 bg-[#0d1117] min-h-[36px]">
        <ToolbarBtn onClick={handleNavBack} disabled={navIndex <= 0} title={t.previewBack}>&larr;</ToolbarBtn>
        <ToolbarBtn onClick={handleNavForward} disabled={navIndex >= navHistory.length - 1} title={t.previewForward}>&rarr;</ToolbarBtn>
        <ToolbarBtn onClick={handleRefresh} disabled={state !== "ready"} title={t.previewRefresh}>&#x21bb;</ToolbarBtn>

        {isLoading && <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin shrink-0" />}

        <input
          type="text" value={displayUrl} readOnly
          className="flex-1 bg-[#0a0e17] border border-white/10 rounded px-2 py-0.5 text-xs font-mono text-text-secondary"
          placeholder={t.previewUrlPlaceholder}
        />

        <ToolbarBtn onClick={handleOpenExternal} disabled={state !== "ready"} title={t.previewOpenNewTab}>&#x2197;</ToolbarBtn>
      </div>

      {/* Toolbar Row 2 — Device simulation, console toggle */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/8 bg-[#0d1117] flex-wrap">
        {detectedFramework && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-700/40 bg-amber-900/15 text-amber-400">
            {detectedFramework}
          </span>
        )}
        {errorCount > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-400">
            {t.previewErrors.replace("{n}", String(errorCount))}
          </span>
        )}

        <div className="w-px h-4 bg-white/8 mx-1" />

        {(["responsive", "mobile", "tablet", "desktop"] as DeviceMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setDeviceMode(mode)}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              deviceMode === mode
                ? "border-amber-700/50 bg-amber-900/30 text-amber-300"
                : "border-white/10 bg-transparent text-text-tertiary hover:bg-white/5"
            }`}
          >
            {mode === "responsive" ? t.previewResponsive : `${DEVICE_WIDTHS[mode]}px`}
          </button>
        ))}

        <div className="w-px h-4 bg-white/8 mx-1" />

        <button
          onClick={() => setShowConsole(!showConsole)}
          className={`ml-auto px-2 py-0.5 text-[10px] rounded border transition-colors ${
            showConsole ? "border-white/20 bg-white/10 text-text-primary" : "border-white/10 bg-transparent text-text-tertiary"
          }`}
        >
          {t.previewConsoleHeader}{" "}
          {consoleEntries.length > 0 && <span className="ml-1 bg-white/10 rounded-full px-1">{consoleEntries.length}</span>}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative flex flex-col min-h-0">
        {/* Loading states */}
        {state !== "ready" && state !== "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-[#0a0e17]">
            <div className="w-8 h-8 border-3 border-white/20 border-t-amber-500 rounded-full animate-spin" />
            <span className="text-xs text-text-secondary">
              {state === "idle" && t.previewIdle}
              {state === "booting" && t.previewBooting}
              {state === "installing" && t.previewInstalling}
              {state === "starting" && t.previewStarting}
            </span>
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-[#0a0e17]">
            <span className="text-2xl">&#x26A0;</span>
            <span className="text-xs text-red-400 text-center max-w-md">{errorMsg}</span>
            <button
              onClick={() => { setState("idle"); setErrorMsg(""); startPreview(); }}
              className="mt-2 px-4 py-1.5 text-xs rounded border border-white/20 bg-white/5 hover:bg-white/10 text-text-primary"
            >
              {t.previewRetry}
            </button>
          </div>
        )}

        {/* iframe with device simulation */}
        <div className={`${showConsole ? "flex-[1_1_60%]" : "flex-1"} overflow-auto flex justify-center ${
          deviceMode === "responsive" ? "items-stretch" : "items-start bg-[#060a12] py-2"
        } min-h-0`}>
          {previewUrl && (
            <iframe
              ref={iframeRef} src={previewUrl} title={t.previewLivePreview}
              style={{
                width: deviceMode === "responsive" ? "100%" : DEVICE_WIDTHS[deviceMode],
                maxWidth: "100%", height: "100%",
                border: deviceMode === "responsive" ? "none" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: deviceMode === "responsive" ? 0 : 6,
                background: "#fff", transition: "width 0.2s ease",
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            />
          )}
        </div>

        {/* Device mode indicator */}
        {deviceMode !== "responsive" && state === "ready" && (
          <div className="absolute top-2 right-2 bg-[#0d1117]/90 border border-white/10 rounded px-2 py-0.5 text-[10px] text-text-tertiary z-5">
            {deviceMode === "mobile" ? t.previewDeviceMobile : deviceMode === "tablet" ? t.previewDeviceTablet : t.previewDeviceDesktop}
          </div>
        )}

        {/* Console panel */}
        {showConsole && (
          <div className="flex-[0_0_35%] min-h-[80px] max-h-[250px] border-t border-white/8 bg-[#060a12] flex flex-col">
            <div className="flex items-center justify-between px-2 py-1 bg-[#0d1117] border-b border-white/8 text-[11px] text-text-tertiary">
              <span>
                {t.previewConsoleHeader} ({consoleEntries.length})
              </span>
              <button
                onClick={() => setConsoleEntries([])}
                className="px-1.5 py-0.5 text-[10px] rounded border border-white/10 hover:bg-white/5"
              >
                {t.previewConsoleClear}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px]">
              {consoleEntries.length === 0 && (
                <div className="text-text-tertiary text-center py-4">{t.previewConsoleEmpty}</div>
              )}
              {consoleEntries.map((entry) => (
                <div key={entry.id} className="py-px border-b border-white/5" style={{
                  color: entry.type === "error" ? "#f85149" : entry.type === "warn" ? "#d29922" : entry.type === "info" ? "#58a6ff" : "#ccc",
                }}>
                  <span className="text-text-tertiary mr-1.5">
                    {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  [{entry.type}] {entry.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=프리뷰 패널 UI | inputs=PreviewPanelProps | outputs=JSX.Element

// ============================================================
// PART 4 — Sub-components & Utilities
// ============================================================

function ToolbarBtn({ onClick, disabled, title, children }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      className="px-1.5 py-0.5 text-sm rounded border border-white/10 bg-transparent text-text-secondary hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function flattenFiles(nodes: FileNode[], prefix = ""): Array<{ path: string; content: string }> {
  const result: Array<{ path: string; content: string }> = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "file" && node.content != null) {
      result.push({ path: fullPath, content: node.content });
    }
    if (node.children) {
      result.push(...flattenFiles(node.children, fullPath));
    }
  }
  return result;
}

// IDENTITY_SEAL: PART-4 | role=서브 컴포넌트 및 유틸 | inputs=FileNode[] | outputs=ToolbarBtn, flattenFiles
