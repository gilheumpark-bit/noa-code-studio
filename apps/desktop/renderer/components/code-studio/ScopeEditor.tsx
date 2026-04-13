// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import React, { useCallback, useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Files, Columns2, Command, Settings, Loader2
} from "lucide-react";
import type { FileNode, OpenFile, CodeStudioSettings } from "@noa/quill-engine/types";
import type { EditorPane } from "@/components/code-studio/EditorGroup";
import { registerGhostTextProvider, cancelGhostText } from "@/lib/code-studio/ai/ghost";
import { processStealthClipboard } from "@/lib/code-studio/ai/stealth-clipboard";
import { registerEditorFeatures } from "@/lib/code-studio/editor/editor-features";
import { setupMonaco } from "@/lib/code-studio/editor/monaco-setup";
import { registerCrossFileProviders } from "@/lib/code-studio/core/cross-file";
import { findFilePathById, toMonacoModelPath } from "@/lib/code-studio/editor/model-path";
import { attachEditorSurfaceContextMenu, runEditorSurfaceMenuAction } from "@/lib/code-studio/editor/editor-surface-context-menu";
import { iCoreClient } from "@/lib/code-studio/ai/i-core-client";
import { useLang } from "@/lib/LangContext";
import WelcomeScreen from "@/components/code-studio/WelcomeScreen";
import { LocalDesktopStatus } from "@/components/code-studio/LocalDesktopStatus";
import { ContextMenu, buildEditorSurfaceMenu } from "@/components/code-studio/ContextMenu";
import { InlineEditWidget } from "@/components/code-studio/InlineEditWidget";
import * as PI from "@/components/code-studio/PanelImports";
import type * as MonacoNS from "monaco-editor";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
const BreadcrumbComponent = dynamic(
  () => import("@/components/code-studio/Breadcrumb").then((m) => ({ default: m.Breadcrumb })),
  { ssr: false },
);
const ToolbarComponent = dynamic(
  () => import("@/components/code-studio/Toolbar").then((m) => ({ default: m.Toolbar })),
  { ssr: false },
);

/** Search the file tree by file name (basename match). */
function findFileNodeByName(nodes: FileNode[], name: string): FileNode | null {
  const basename = name.includes("/") ? name.split("/").pop()! : name;
  for (const n of nodes) {
    if (n.type === "file" && n.name === basename) return n;
    if (n.children) {
      const found = findFileNodeByName(n.children, basename);
      if (found) return found;
    }
  }
  return null;
}

export interface ScopeEditorProps {
  // Core data
  files: FileNode[];
  openFiles: OpenFile[];
  activeFile: OpenFile | null;
  activeFileId: string | null;
  settings: CodeStudioSettings;
  loaded: boolean;
  hasEverOpened: boolean;
  isMobile: boolean;

  // Editor group
  useEditorGroup: boolean;
  onToggleEditorGroup: () => void;

  // Settings toolbar
  showSettings: boolean;
  onToggleSettings: () => void;
  showMultiKey: boolean;
  onCloseMultiKey: () => void;

  // Cursor
  onCursorChange: (line: number, col: number) => void;

  // Diff
  diffState: { original: string; modified: string; fileName: string } | null;
  onDiffAccept: (content: string) => void;
  onDiffReject: () => void;

  // File operations
  onFileSelect: (node: FileNode) => void;
  onCloseTab: (id: string) => void;
  onEditorChange: (value: string | undefined) => void;
  onApplyCode: (code: string, fileName?: string) => void;
  onSetActiveFileId: (id: string | null) => void;
  onOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>;

  // Welcome actions
  onWelcomeNewFile: () => void;
  onOpenDemo: () => void;
  onBlankProject: () => void;
  onResumeProject: () => void;
  onQuickVerify?: () => void;
  onOpenLocalFolder?: () => void;

  // Command palette
  onShowCommandPalette: () => void;

  // Toolbar callbacks
  rightPanel: string | null;
  showTerminal: boolean;
  onToggleChat: () => void;
  onToggleTerminal: () => void;
  onTogglePipeline: () => void;
  onToggleAgent: () => void;
  onToggleSearch: () => void;
  onNewFile: () => void;
  onToggleProblems: () => void;
  onRunBugFinder: () => void;
  onDeploy: () => void;
  onToggleSplit: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onSaveToast: () => void;
  onSettingsSaved: () => void;

  // Filesystem updater (for cross-file providers)
  fsUpdateContent: (id: string, content: string) => void;

  // i18n
  tcs: Record<string, string>;

  /** Desktop: file explorer sidebar visible — drives welcome layout + hints */
  explorerOpen?: boolean;

  // Children slot for right panel (injected by Shell)
  children?: React.ReactNode;
}

// IDENTITY_SEAL: PART-1 | role=Imports+Types | inputs=none | outputs=imports,ScopeEditorProps

// ============================================================
// PART 2 — Editor Component
// ============================================================

export function ScopeEditor(props: ScopeEditorProps) {
  const {
    files, openFiles, activeFile, activeFileId, settings, loaded,
    hasEverOpened, useEditorGroup, onToggleEditorGroup,
    showSettings, onToggleSettings, showMultiKey, _onCloseMultiKey,
    onCursorChange, diffState, onDiffReject,
    onFileSelect, onCloseTab, onEditorChange, onApplyCode,
    onSetActiveFileId, onOpenFiles,
    onWelcomeNewFile, onOpenDemo, onBlankProject, onResumeProject, onQuickVerify, onOpenLocalFolder,
    onShowCommandPalette,
    rightPanel, showTerminal,
    onToggleChat, onToggleTerminal, onTogglePipeline, onToggleAgent,
    onToggleSearch, onNewFile, onToggleProblems, onRunBugFinder,
    onDeploy, onToggleSplit, onUndo, onRedo, onZoomIn, onZoomOut,
    onZoomReset, onSettingsSaved, onSaveToast, _centerMode, _onToggleCenterMode,
    fsUpdateContent, tcs, explorerOpen, children,
  } = props;

  const { lang } = useLang();
  const editorRef = useRef<unknown>(null);
  const crossFileDisposableRef = useRef<{ dispose(): void } | null>(null);
  const editorSurfaceTargetRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const [editorSurfaceMenu, setEditorSurfaceMenu] = useState<{ x: number; y: number } | null>(null);
  const indexingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleIndexFile = useCallback((fileId: string, content: string, filePath: string) => {
    if (indexingTimerRef.current) clearTimeout(indexingTimerRef.current);
    indexingTimerRef.current = setTimeout(() => {
      iCoreClient.indexFile(filePath, content).catch(err => console.warn("I-Core index error:", err));
    }, 2000); // 2s debounce
  }, []);
  
  // AI Inline Edit State
  const [inlineEditState, setInlineEditState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
    lang: string;
    selection?: MonacoNS.Selection;
  } | null>(null);

  // Ghost text hint bar state
  const [ghostHintVisible, setGhostHintVisible] = useState(false);
  const ghostHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showGhostHint = useCallback(() => {
    setGhostHintVisible(true);
    if (ghostHintTimerRef.current) clearTimeout(ghostHintTimerRef.current);
    ghostHintTimerRef.current = setTimeout(() => setGhostHintVisible(false), 3000);
  }, []);

  const hideGhostHint = useCallback(() => {
    setGhostHintVisible(false);
    if (ghostHintTimerRef.current) {
      clearTimeout(ghostHintTimerRef.current);
      ghostHintTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (ghostHintTimerRef.current) clearTimeout(ghostHintTimerRef.current);
    };
  }, []);

  // Cleanup cross-file disposable on unmount
  useEffect(() => {
    return () => {
      crossFileDisposableRef.current?.dispose();
      crossFileDisposableRef.current = null;
    };
  }, []);

  const triggerInlineEdit = useCallback((ed: MonacoNS.editor.IStandaloneCodeEditor) => {
     const selection = ed.getSelection();
     const model = ed.getModel();
     if (selection && model && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection);
        const pos = ed.getScrolledVisiblePosition(selection.getStartPosition());
        if (pos && selectedText) {
           setInlineEditState({
              visible: true,
              x: pos.left,
              y: Math.max(0, pos.top - 40),
              text: selectedText,
              lang: activeFile?.language || "plaintext",
              selection
           });
        }
     } else {
        // No selection: show a brief inline hint instead of inserting debug text
        const contrib = ed.getContribution?.('editor.contrib.messageController');
        if (contrib && typeof (contrib as { showMessage: unknown }).showMessage === 'function') {
          (contrib as { showMessage: (msg: { value: string }, pos: unknown) => void }).showMessage(
            { value: lang === 'ko' ? '인라인 편집: 먼저 코드를 선택하세요' : 'Select code first to edit inline (Cmd+I)' },
            ed.getPosition()
          );
        }
     }
  }, [activeFile?.language]);

  // EditorGroup per-pane editor renderer (isFocused is read at Monaco mount only; focus changes do not remount.)
  const renderEditorPane = useCallback((pane: EditorPane, isFocused: boolean) => {
    const paneFile = pane.files.find((f) => f.id === pane.activeFileId);
    if (!paneFile) {
      return (
        <div className="h-full flex items-center justify-center text-text-tertiary text-xs">
          {tcs.selectFile}
        </div>
      );
    }
    const panePath = toMonacoModelPath(findFilePathById(files, paneFile.id), paneFile.id, paneFile.name);
    return (
      <MonacoEditor
        height="100%" language={paneFile.language} path={panePath} value={paneFile.content}
        onChange={(value: string | undefined) => {
          if (value === undefined) return;
          onOpenFiles((prev) => prev.map((f) => f.id === paneFile.id ? { ...f, content: value, isDirty: true } : f));
          fsUpdateContent(paneFile.id, value);
          handleIndexFile(paneFile.id, value, panePath);
        }}
        theme="vs-dark"
        options={{
          fontSize: settings.fontSize, tabSize: settings.tabSize, wordWrap: settings.wordWrap,
          minimap: { enabled: isFocused ? settings.minimap : false }, scrollBeyondLastLine: false, padding: { top: 12 },
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          lineNumbers: "on", renderLineHighlight: "line",
          bracketPairColorization: { enabled: true },
          smoothScrolling: true,
          cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on",
          contextmenu: true,
        }}
        onMount={(editor: unknown, monaco: unknown) => {
          const ed = editor as MonacoNS.editor.IStandaloneCodeEditor;
          const mon = monaco as Parameters<typeof setupMonaco>[0];
          const ctxSub = attachEditorSurfaceContextMenu(ed, (pos, target) => {
            editorSurfaceTargetRef.current = target;
            setEditorSurfaceMenu(pos);
          });
          ed.onDidDispose(() => ctxSub.dispose());
          
          ed.addCommand((mon as unknown).KeyMod.CtrlCmd | (mon as unknown).KeyCode.KeyI, () => {
             triggerInlineEdit(ed);
          });

          ed.onDidPaste((e) => {
             processStealthClipboard(mon as Parameters<typeof processStealthClipboard>[0], ed, e.range, paneFile.language);
          });

          if (!isFocused) return;
          editorRef.current = editor;
          setupMonaco(mon, ed, { theme: "dark" });
          registerEditorFeatures(mon as Parameters<typeof registerEditorFeatures>[0], ed);
          registerGhostTextProvider(mon as Parameters<typeof registerGhostTextProvider>[0]);
        }}
      />
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, settings.fontSize, settings.tabSize, settings.wordWrap, settings.minimap, fsUpdateContent, onOpenFiles, tcs.selectFile]);

  const handleMountDesktopEditor = useCallback((editor: unknown, monaco: unknown) => {
    editorRef.current = editor;
    setupMonaco(monaco as Parameters<typeof setupMonaco>[0], editor as Parameters<typeof setupMonaco>[1], { theme: "dark" });
    registerEditorFeatures(monaco as Parameters<typeof registerEditorFeatures>[0], editor as Parameters<typeof registerEditorFeatures>[1]);
    registerGhostTextProvider(monaco as Parameters<typeof registerGhostTextProvider>[0]);
    crossFileDisposableRef.current?.dispose();
    crossFileDisposableRef.current = registerCrossFileProviders(monaco as Parameters<typeof registerCrossFileProviders>[0], {
      onOpenFile: (filePath: string) => {
        const node = findFileNodeByName(files, filePath);
        if (node) onFileSelect(node);
      },
    });
    const ed = editor as MonacoNS.editor.IStandaloneCodeEditor;
    const ctxSub = attachEditorSurfaceContextMenu(ed, (pos, target) => {
      editorSurfaceTargetRef.current = target;
      setEditorSurfaceMenu(pos);
    });
    (editor as { onDidDispose: (cb: () => void) => void }).onDidDispose(() => {
      ctxSub.dispose();
      cancelGhostText();
      crossFileDisposableRef.current?.dispose();
      crossFileDisposableRef.current = null;
    });
    (editor as { onDidChangeCursorPosition: (cb: (e: { position: { lineNumber: number; column: number } }) => void) => void }).onDidChangeCursorPosition((e) => {
      onCursorChange(e.position.lineNumber, e.position.column);
    });

    // Ghost text hint: show when inline suggestion appears, hide on keypress
    const ghostSuggestDisposable = ed.onDidChangeModelContent(() => {
      // Check if ghost text (inline suggestion) widget is visible in DOM
      const ghostWidget = (ed.getDomNode() as HTMLElement | null)?.querySelector('.ghost-text-decoration, .suggest-preview-text, [class*="ghost"]');
      if (ghostWidget) {
        showGhostHint();
      }
    });
    ed.onKeyDown(() => {
      hideGhostHint();
    });
    (editor as { onDidDispose: (cb: () => void) => void }).onDidDispose(() => {
      ghostSuggestDisposable?.dispose?.();
    });
    
    // Register Cmd+I
    ed.addCommand((monaco as unknown).KeyMod.CtrlCmd | (monaco as unknown).KeyCode.KeyI, () => {
      triggerInlineEdit(ed);
    });

    // Register Stealth Clipboard Profiler
    ed.onDidPaste((e) => {
       const currFile = files.find(f => f.id === activeFileId);
       if (currFile) {
          processStealthClipboard(monaco as Parameters<typeof processStealthClipboard>[0], ed, e.range, currFile.language);
       } else {
          processStealthClipboard(monaco as Parameters<typeof processStealthClipboard>[0], ed, e.range, "typescript");
       }
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, onFileSelect, onCursorChange]);


  const handleEditorSurfaceMenuSelect = useCallback(
    (id: string) => {
      runEditorSurfaceMenuAction(editorSurfaceTargetRef.current, id, onShowCommandPalette, {
        onAILint: () => {
          // Run bug finder as manual QA audit
          onRunBugFinder?.();
        },
        onAISnapshot: () => {
          // Trigger a save toast / snapshot creation
          onSaveToast?.();
        },
        onAIPicker: () => {
          const ed = editorSurfaceTargetRef.current;
          if (ed) triggerInlineEdit(ed);
        },
        onScopeLock: () => {
          // Send active selection to GraphRAG explicitly or lock the context to it
          const ed = editorSurfaceTargetRef.current;
          if (ed) {
             const selection = ed.getSelection();
             const model = ed.getModel();
             if (selection && model && !selection.isEmpty()) {
                const text = model.getValueInRange(selection);
                const panePath = model.uri.toString();
                iCoreClient.indexFile(panePath, text, { locked: true }).then(() => {
                  if (onSaveToast) onSaveToast(); // reuse save toast for visual feedback
                });
             }
          }
        }
      });
    },
    [onShowCommandPalette, onRunBugFinder, onSaveToast, triggerInlineEdit],
  );

  const closeEditorSurfaceMenu = useCallback(() => {
    setEditorSurfaceMenu(null);
    editorSurfaceTargetRef.current = null;
  }, []);

  // Expose editor ref for outline navigation etc.
  const _navigateToLine = useCallback((line: number) => {
    const editor = editorRef.current as { revealLineInCenter?: (l: number) => void; setPosition?: (p: { lineNumber: number; column: number }) => void } | null;
    editor?.revealLineInCenter?.(line);
    editor?.setPosition?.({ lineNumber: line, column: 1 });
  }, []);

  // Empty state renderer
  const emptyState = !loaded ? (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent-green/40" />
    </div>
  ) : !hasEverOpened ? (
    <WelcomeScreen
      onNewFile={onWelcomeNewFile}
      onOpenDemo={onOpenDemo}
      onBlankProject={onBlankProject}
      onResumeProject={onResumeProject}
      onQuickVerify={onQuickVerify}
      onOpenLocalFolder={onOpenLocalFolder}
      explorerOpen={explorerOpen}
    />
  ) : (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mb-4 inline-block rounded-full border border-accent-green/20 bg-accent-green/8 p-4"><Files className="h-8 w-8 text-accent-green" /></div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">{tcs.selectFile}</p>
      </div>
    </div>
  );

  const activeFilePath = activeFile
    ? toMonacoModelPath(findFilePathById(files, activeFile.id), activeFile.id, activeFile.name)
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col min-w-0">
      {/* Breadcrumb */}
      {activeFile && (
        <BreadcrumbComponent
          path={["project", "src", activeFile.name]}
          isModified={activeFile.isDirty}
        />
      )}

      {/* Editor Tabs */}
      <div className="flex items-center border-b border-white/8 bg-bg-secondary">
        <div className="flex-1 min-w-0">
          <PI.EditorTabsComponent
            openFiles={openFiles}
            activeFileId={activeFileId}
            onSelectFile={(id) => onSetActiveFileId(id)}
            onCloseFile={onCloseTab}
          />
        </div>
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button
            onClick={onToggleEditorGroup}
            disabled={openFiles.length === 0}
            className={`rounded p-1.5 transition-all duration-150 active:scale-95 ${useEditorGroup ? "text-accent-green" : "text-text-tertiary"} disabled:opacity-30`}
            title="Split Editor (EditorGroup)"
          >
            <Columns2 className="h-4 w-4" />
          </button>
          <button onClick={onShowCommandPalette} className="rounded p-1.5 transition-all duration-150 active:scale-95 text-text-tertiary hover:text-text-secondary" title="Commands (Ctrl+Shift+P)"><Command className="h-4 w-4" /></button>
          <button onClick={() => { if (showSettings) onSettingsSaved(); onToggleSettings(); }} className={`rounded p-1.5 transition-all duration-150 active:scale-95 ${showSettings ? "text-accent-amber" : "text-text-tertiary hover:text-text-secondary"}`} title="Inline Settings" aria-label="인라인 설정"><Settings className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Toolbar */}
      {showSettings && (
        <ToolbarComponent
          onToggleChat={onToggleChat}
          onToggleTerminal={onToggleTerminal}
          onTogglePipeline={onTogglePipeline}
          onToggleAgent={onToggleAgent}
          onToggleSearch={onToggleSearch}
          onNewFile={onNewFile}
          onOpenSettings={() => { onToggleSettings(); onSettingsSaved(); }}
          onOpenPalette={onShowCommandPalette}
          onToggleProblems={onToggleProblems}
          onRunBugFinder={onRunBugFinder}
          onDeploy={onDeploy}
          onToggleSplit={onToggleSplit}
          onUndo={onUndo}
          onRedo={onRedo}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
          fontSize={settings.fontSize}
          showChat={rightPanel === "chat"}
          showAgent={rightPanel === "agents"}
          showTerminal={showTerminal}
          showPipeline={rightPanel === "pipeline"}
        />
      )}

      {/* Multi-Key Panel Modal */}
      {showMultiKey ? null : null}

      {/* Editor + Right Panel area (children injected by Shell) */}
      <div className="relative flex min-h-0 flex-1 flex-row">
        {/* Diff Viewer Overlay */}
        {diffState && (
          <div className="absolute inset-0 z-20 bg-bg-primary">
            <PI.DiffViewerComponent
              original={diffState.original}
              modified={diffState.modified}
              language={activeFile?.language ?? "plaintext"}
              fileName={diffState.fileName}
              onAccept={(content: string) => { onApplyCode(content); onDiffReject(); }}
              onReject={onDiffReject}
            />
          </div>
        )}

        <div id="main-editor" className="flex min-h-0 flex-1 min-w-0 flex-col relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={rightPanel === "canvas" ? "canvas" : useEditorGroup ? "group" : "editor"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="absolute inset-0 flex flex-col bg-bg-primary"
            >
              {rightPanel === "canvas" ? (
                <div className="flex-1 w-full h-full overflow-hidden">
                  <PI.CanvasPanelComponent />
                </div>
              ) : useEditorGroup ? (
                <PI.EditorGroupComponent
                  openFiles={openFiles}
                  activeFileId={activeFileId}
                  onSelectFile={(id: string) => onSetActiveFileId(id)}
                  onCloseFile={onCloseTab}
                  renderEditor={renderEditorPane}
                />
              ) : (
                activeFile ? (
                  <MonacoEditor
                    height="100%" language={activeFile.language} path={activeFilePath} value={activeFile.content}
                    onChange={(val) => {
                       onEditorChange(val);
                       if (val !== undefined && activeFilePath) {
                          handleIndexFile(activeFile.id, val, activeFilePath);
                       }
                    }} theme="vs-dark"
                    options={{
                      fontSize: settings.fontSize, tabSize: settings.tabSize, wordWrap: settings.wordWrap,
                      minimap: { enabled: settings.minimap }, scrollBeyondLastLine: false, padding: { top: 12 },
                      fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                      lineNumbers: "on", renderLineHighlight: "line",
                      bracketPairColorization: { enabled: true },
                      guides: { indentation: true, bracketPairs: true, highlightActiveIndentation: true },
                      smoothScrolling: true,
                      cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on",
                      stickyScroll: { enabled: true },
                      contextmenu: true,
                    }}
                    onMount={handleMountDesktopEditor}
                  />
                ) : emptyState
              )}
            </motion.div>
          </AnimatePresence>
          
          {inlineEditState?.visible && (
            <div 
              className="absolute z-40 transition-all duration-200" 
              style={{ top: inlineEditState.y + 40, left: Math.max(50, inlineEditState.x) }}
            >
              <InlineEditWidget 
                selectedText={inlineEditState.text}
                fullCode={activeFile?.content || ""}
                language={inlineEditState.lang}
                onCancel={() => setInlineEditState(null)}
                onApply={(newText) => {
                  const ed = editorRef.current as MonacoNS.editor.IStandaloneCodeEditor | null;
                  if (ed && inlineEditState.selection) {
                    ed.pushEditOperations(
                      ed.getSelections() || [],
                      [{ range: inlineEditState.selection, text: newText }],
                      () => null // Computes end cursor state automatically
                    );
                  }
                  setInlineEditState(null);
                }}
              />
            </div>
          )}

          <LocalDesktopStatus />

          {/* Ghost text hint bar */}
          <AnimatePresence>
            {ghostHintVisible && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-bg-secondary/80 backdrop-blur-md border border-border/40 shadow-lg"
              >
                <span className="text-[11px] text-text-tertiary font-medium tracking-wide">
                  <kbd className="px-1.5 py-0.5 rounded bg-bg-primary/60 border border-border/30 text-text-secondary text-[10px] font-mono mr-1">Tab</kbd>
                  {lang === 'ko' ? '수락' : 'to accept'}
                  <span className="mx-2 text-border">|</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-bg-primary/60 border border-border/30 text-text-secondary text-[10px] font-mono mr-1">Esc</kbd>
                  {lang === 'ko' ? '닫기' : 'to dismiss'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right panel slot — injected via children from Shell */}
        {children}
      </div>

      {editorSurfaceMenu && (
        <ContextMenu
          x={editorSurfaceMenu.x}
          y={editorSurfaceMenu.y}
          items={buildEditorSurfaceMenu(lang)}
          onSelect={handleEditorSurfaceMenuSelect}
          onClose={closeEditorSurfaceMenu}
        />
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=EditorComponent | inputs=EditorProps | outputs=EditorUI+Monaco
