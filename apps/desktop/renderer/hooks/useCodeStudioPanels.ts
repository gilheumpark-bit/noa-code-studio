// ============================================================
// Code Studio — Panel State Hook
// Manages state & logic for stub panels:
// Recent Files, Symbol Palette, Code Actions, Canvas,
// AI Hub, AI Workspace, Database, Merge Conflicts
// ============================================================

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useRef, useMemo } from "react";
import { streamChat, type ChatMsg } from "@/lib/ai-providers";
import type { AgentRole } from "@/lib/code-studio/ai/agents";
import type { FileNode } from "@noa/quill-engine/types";
/** Canvas node representing a file or module on the visual canvas */
export interface CanvasNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type: "file" | "component" | "service" | "module";
}

/** Connection between two canvas nodes */
export interface CanvasConnection {
  id: string;
  from: string;
  to: string;
}
import type { SymbolEntry } from "@/components/code-studio/SymbolPalette";
import type { AIFeature } from "@/components/code-studio/AIHub";
import type { WorkspaceThread, WorkspaceMessage } from "@/components/code-studio/AIWorkspace";
import type { DBConnection, QueryResult } from "@/components/code-studio/DatabasePanel";
import type { ConflictBlock } from "@/components/code-studio/MergeConflictEditor";

/** Recent file entry for the RecentFiles panel */
export interface RecentFileEntry {
  fileId: string;
  fileName: string;
  timestamp: number;
}

interface UseCodeStudioPanelsOptions {
  files: FileNode[];
  activeFileContent: string | null;
  activeFileName: string | null;
  activeFileLanguage: string | null;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=RecentFileEntry,UseCodeStudioPanelsOptions

// ============================================================
// PART 2 — Symbol Extraction
// ============================================================

const SYMBOL_PATTERNS: Array<{ re: RegExp; kind: SymbolEntry["kind"] }> = [
  { re: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, kind: "function" },
  { re: /(?:export\s+)?class\s+(\w+)/g, kind: "class" },
  { re: /(?:export\s+)?interface\s+(\w+)/g, kind: "interface" },
  { re: /(?:export\s+)?type\s+(\w+)\s*=/g, kind: "type" },
  { re: /(?:export\s+)?enum\s+(\w+)/g, kind: "enum" },
  { re: /(?:export\s+)?const\s+(\w+)\s*[=:]/g, kind: "const" },
  { re: /(?:export\s+)?(?:let|var)\s+(\w+)\s*[=:]/g, kind: "variable" },
  { re: /(\w+)\s*\([^)]*\)\s*\{/g, kind: "function" },
  { re: /def\s+(\w+)\s*\(/g, kind: "function" },
  { re: /class\s+(\w+)\s*[:(]/g, kind: "class" },
];

function extractSymbols(content: string, fileName: string): SymbolEntry[] {
  if (!content) return [];
  const symbols: SymbolEntry[] = [];
  const seen = new Set<string>();
  for (const { re, kind } of SYMBOL_PATTERNS) {
    const regex = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const key = `${kind}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lineIdx = content.substring(0, match.index).split("\n").length;
      symbols.push({ name, kind, file: fileName, line: lineIdx });
    }
  }

  return symbols.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

// IDENTITY_SEAL: PART-2 | role=SymbolExtract | inputs=content,fileName | outputs=SymbolEntry[]

// ============================================================
// PART 3 — Canvas Node Generation
// ============================================================

function generateCanvasNodes(fileTree: FileNode[], parentX = 0, parentY = 0): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
  const nodes: CanvasNode[] = [];
  const connections: CanvasConnection[] = [];
  let y = parentY;

  function traverse(items: FileNode[], depth: number, parentId?: string) {
    for (const item of items) {
      const nodeType: CanvasNode["type"] = item.type === "folder"
        ? "module"
        : item.name.endsWith(".tsx") || item.name.endsWith(".jsx")
          ? "component"
          : item.name.includes("service") || item.name.includes("api")
            ? "service"
            : "file";

      const node: CanvasNode = {
        id: item.id,
        label: item.name,
        x: 40 + depth * 200,
        y,
        width: 140,
        height: 50,
        color: "",
        type: nodeType,
      };
      nodes.push(node);

      if (parentId) {
        connections.push({ id: `conn-${parentId}-${item.id}`, from: parentId, to: item.id });
      }

      y += 70;

      if (item.children) {
        traverse(item.children, depth + 1, item.id);
      }
    }
  }

  traverse(fileTree, 0);
  return { nodes, connections };
}

// IDENTITY_SEAL: PART-3 | role=CanvasGen | inputs=FileNode[] | outputs=CanvasNode[],CanvasConnection[]

// ============================================================
// PART 4 — Merge Conflict Parser
// ============================================================

function parseMergeConflicts(content: string): ConflictBlock[] {
  if (!content) return [];
  const conflicts: ConflictBlock[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      const startLine = i + 1;
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      let phase: "ours" | "theirs" = "ours";
      i++;

      while (i < lines.length) {
        if (lines[i].startsWith("=======")) {
          phase = "theirs";
          i++;
          continue;
        }
        if (lines[i].startsWith(">>>>>>>")) {
          conflicts.push({
            id: `conflict-${startLine}`,
            startLine,
            ours: oursLines.join("\n"),
            theirs: theirsLines.join("\n"),
            resolved: false,
          });
          i++;
          break;
        }
        if (phase === "ours") oursLines.push(lines[i]);
        else theirsLines.push(lines[i]);
        i++;
      }
    } else {
      i++;
    }
  }

  return conflicts;
}

// IDENTITY_SEAL: PART-4 | role=ConflictParser | inputs=content | outputs=ConflictBlock[]

// ============================================================
// PART 5 — Default AI Features
// ============================================================

import React from "react";

const DEFAULT_AI_FEATURES: Omit<AIFeature, "icon">[] = [
  { id: "ghost-text", name: "Ghost Text", description: "Inline code completion suggestions as you type", category: "generation", enabled: true, usageCount: 0 },
  { id: "chat-assist", name: "Chat Assistant", description: "AI chat for code questions and generation", category: "generation", enabled: true, usageCount: 0 },
  { id: "code-creator", name: "Code Creator", description: "Generate entire files from natural language", category: "generation", enabled: true, usageCount: 0 },
  { id: "autopilot", name: "Autopilot", description: "Autonomous multi-step code generation", category: "automation", enabled: false, usageCount: 0 },
  { id: "bug-scan", name: "Bug Scanner", description: "Static analysis to detect potential bugs", category: "analysis", enabled: true, usageCount: 0 },
  { id: "pipeline-analysis", name: "Pipeline Analysis", description: "8-team static analysis pipeline", category: "analysis", enabled: true, usageCount: 0 },
  { id: "code-review", name: "AI Code Review", description: "Automated code review with suggestions", category: "analysis", enabled: false, usageCount: 0 },
  { id: "stress-test", name: "Stress Testing", description: "Simulate edge cases and stress scenarios", category: "analysis", enabled: false, usageCount: 0 },
  { id: "safe-fix", name: "Safe Auto-Fix", description: "Automatically apply safe fixes from verification", category: "automation", enabled: true, usageCount: 0 },
  { id: "security-scan", name: "Security Scan", description: "Detect vulnerabilities and unsafe patterns", category: "security", enabled: true, usageCount: 0 },
];

// IDENTITY_SEAL: PART-5 | role=DefaultFeatures | inputs=none | outputs=DEFAULT_AI_FEATURES

// ============================================================
// PART 6 — Demo Database
// ============================================================

const DEMO_DB_CONNECTIONS: DBConnection[] = [
  { id: "local-sqlite", name: "Local SQLite", type: "sqlite", connectionString: ":memory:", connected: true },
];

const DEMO_TABLES = ["users", "projects", "files", "sessions", "settings"];

interface DemoRow { [key: string]: unknown }

const DEMO_DATA: Record<string, { columns: string[]; rows: DemoRow[] }> = {
  users: {
    columns: ["id", "name", "email", "role", "created_at"],
    rows: [
      { id: 1, name: "admin", email: "admin@eh-universe.dev", role: "admin", created_at: "2025-01-01" },
      { id: 2, name: "developer", email: "dev@eh-universe.dev", role: "developer", created_at: "2025-03-15" },
      { id: 3, name: "reviewer", email: "review@eh-universe.dev", role: "reviewer", created_at: "2025-06-01" },
    ],
  },
  projects: {
    columns: ["id", "name", "status", "language", "file_count"],
    rows: [
      { id: 1, name: "eh-universe-web", status: "active", language: "TypeScript", file_count: 142 },
      { id: 2, name: "eh-api", status: "active", language: "Python", file_count: 56 },
      { id: 3, name: "eh-mobile", status: "paused", language: "Dart", file_count: 89 },
    ],
  },
  files: {
    columns: ["id", "project_id", "path", "size_kb", "last_modified"],
    rows: [
      { id: 1, project_id: 1, path: "src/index.ts", size_kb: 2, last_modified: "2026-03-28" },
      { id: 2, project_id: 1, path: "src/App.tsx", size_kb: 5, last_modified: "2026-03-29" },
      { id: 3, project_id: 2, path: "main.py", size_kb: 8, last_modified: "2026-03-27" },
    ],
  },
  sessions: {
    columns: ["id", "user_id", "start_time", "duration_min", "active"],
    rows: [
      { id: 1, user_id: 1, start_time: "2026-03-29 09:00", duration_min: 120, active: true },
      { id: 2, user_id: 2, start_time: "2026-03-29 10:30", duration_min: 45, active: false },
    ],
  },
  settings: {
    columns: ["key", "value", "type", "updated_at"],
    rows: [
      { key: "theme", value: "dark", type: "string", updated_at: "2026-03-29" },
      { key: "fontSize", value: "14", type: "number", updated_at: "2026-03-28" },
      { key: "autoSave", value: "true", type: "boolean", updated_at: "2026-03-27" },
    ],
  },
};

function executeLocalQuery(query: string): QueryResult {
  const start = performance.now();
  const trimmed = query.trim().toLowerCase();

  // SELECT * FROM <table>
  const selectMatch = trimmed.match(/^select\s+(.+?)\s+from\s+(\w+)(?:\s+where\s+(.+?))?(?:\s+limit\s+(\d+))?;?\s*$/i);
  if (selectMatch) {
    const tableName = selectMatch[2];
    const limit = selectMatch[4] ? parseInt(selectMatch[4]) : 100;
    const data = DEMO_DATA[tableName];
    if (!data) {
      return { columns: [], rows: [], rowCount: 0, executionTime: Math.round(performance.now() - start), error: `Table '${tableName}' not found. Available: ${DEMO_TABLES.join(", ")}` };
    }

    let rows = [...data.rows];

    // Basic WHERE support
    if (selectMatch[3]) {
      const whereClause = selectMatch[3];
      const eqMatch = whereClause.match(/(\w+)\s*=\s*['""]?(\w+)['""]?/);
      if (eqMatch) {
        const [, col, val] = eqMatch;
        rows = rows.filter((r) => String(r[col]) === val);
      }
    }

    rows = rows.slice(0, limit);

    // Column selection
    let columns = data.columns;
    if (selectMatch[1] !== "*") {
      columns = selectMatch[1].split(",").map((c) => c.trim());
      rows = rows.map((r) => {
        const filtered: DemoRow = {};
        for (const c of columns) { if (c in r) filtered[c] = r[c]; }
        return filtered;
      });
    }

    return { columns, rows, rowCount: rows.length, executionTime: Math.round(performance.now() - start) };
  }

  // SHOW TABLES
  if (trimmed.startsWith("show tables") || trimmed === "\\dt") {
    return {
      columns: ["table_name"],
      rows: DEMO_TABLES.map((t) => ({ table_name: t })),
      rowCount: DEMO_TABLES.length,
      executionTime: Math.round(performance.now() - start),
    };
  }

  // DESCRIBE <table>
  const descMatch = trimmed.match(/^(?:describe|desc)\s+(\w+)/i);
  if (descMatch) {
    const data = DEMO_DATA[descMatch[1]];
    if (!data) {
      return { columns: [], rows: [], rowCount: 0, executionTime: Math.round(performance.now() - start), error: `Table '${descMatch[1]}' not found` };
    }
    return {
      columns: ["column_name", "type"],
      rows: data.columns.map((c) => ({ column_name: c, type: "TEXT" })),
      rowCount: data.columns.length,
      executionTime: Math.round(performance.now() - start),
    };
  }

  // COUNT
  const countMatch = trimmed.match(/^select\s+count\(\*\)\s+from\s+(\w+)/i);
  if (countMatch) {
    const data = DEMO_DATA[countMatch[1]];
    if (!data) {
      return { columns: [], rows: [], rowCount: 0, executionTime: Math.round(performance.now() - start), error: `Table '${countMatch[1]}' not found` };
    }
    return { columns: ["count"], rows: [{ count: data.rows.length }], rowCount: 1, executionTime: Math.round(performance.now() - start) };
  }

  return {
    columns: [],
    rows: [],
    rowCount: 0,
    executionTime: Math.round(performance.now() - start),
    error: "Supported queries: SELECT * FROM <table> [WHERE col=val] [LIMIT n], SHOW TABLES, DESCRIBE <table>, SELECT COUNT(*) FROM <table>",
  };
}

// IDENTITY_SEAL: PART-6 | role=DemoDB | inputs=query | outputs=QueryResult

// ============================================================
// PART 7 — Main Hook
// ============================================================

/** Aggregate state hook for Code Studio auxiliary panels: recent files, symbols, canvas, AI hub/workspace, DB, merge conflicts */
export function useCodeStudioPanels({ files, activeFileContent, activeFileName, activeFileLanguage: _activeFileLanguage }: UseCodeStudioPanelsOptions) {
  // ── Recent Files ──────────────────────────────────────────
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);

  const trackFileOpen = useCallback((fileId: string, fileName: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.fileId !== fileId);
      return [{ fileId, fileName, timestamp: Date.now() }, ...filtered].slice(0, 30);
    });
  }, []);

  const clearRecentFiles = useCallback(() => setRecentFiles([]), []);

  // ── Symbol Palette ────────────────────────────────────────
  const symbols = useMemo(() => {
    if (!activeFileContent || !activeFileName) return [];
    return extractSymbols(activeFileContent, activeFileName);
  }, [activeFileContent, activeFileName]);

  // ── Code Actions (editor selection state) ─────────────────
  const [editorSelection, setEditorSelection] = useState({ text: "", top: 0, left: 0 });

  const updateEditorSelection = useCallback((text: string, top: number, left: number) => {
    setEditorSelection({ text, top, left });
  }, []);

  // ── Canvas ────────────────────────────────────────────────
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>([]);
  const [canvasConnections, setCanvasConnections] = useState<CanvasConnection[]>([]);
  const [canvasInitialized, setCanvasInitialized] = useState(false);

  const initCanvas = useCallback(() => {
    if (canvasInitialized) return;
    const { nodes, connections } = generateCanvasNodes(files);
    setCanvasNodes(nodes);
    setCanvasConnections(connections);
    setCanvasInitialized(true);
  }, [files, canvasInitialized]);

  const refreshCanvas = useCallback(() => {
    const { nodes, connections } = generateCanvasNodes(files);
    setCanvasNodes(nodes);
    setCanvasConnections(connections);
  }, [files]);

  // ── AI Hub ────────────────────────────────────────────────
  const [aiFeatures, setAiFeatures] = useState<AIFeature[]>(() =>
    DEFAULT_AI_FEATURES.map((f) => ({ ...f, icon: null as unknown as React.ReactNode })),
  );

  const toggleAiFeature = useCallback((id: string, enabled: boolean) => {
    setAiFeatures((prev) => prev.map((f) => f.id === id ? { ...f, enabled } : f));
  }, []);

  // ── AI Workspace ──────────────────────────────────────────
  const [wsThreads, setWsThreads] = useState<WorkspaceThread[]>([]);
  const [wsSharedMemory, _setWsSharedMemory] = useState<Array<{ key: string; value: string; source: AgentRole; timestamp: number }>>([]);
  const wsAbortRef = useRef<AbortController | null>(null);

  const createWsThread = useCallback((persona: AgentRole) => {
    const thread: WorkspaceThread = {
      id: `thread-${Date.now()}`,
      title: `${persona.charAt(0).toUpperCase() + persona.slice(1)} Thread`,
      persona,
      messages: [],
      createdAt: Date.now(),
    };
    setWsThreads((prev) => [...prev, thread]);
  }, []);

  const deleteWsThread = useCallback((threadId: string) => {
    setWsThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

  const sendWsMessage = useCallback(async (threadId: string, content: string): Promise<string> => {
    const userMsg: WorkspaceMessage = { id: `msg-${Date.now()}`, role: "user", content, timestamp: Date.now() };
    setWsThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, messages: [...t.messages, userMsg] } : t));

    const thread = wsThreads.find((t) => t.id === threadId);
    const systemPrompt = `You are a ${thread?.persona ?? "developer"} agent in an AI workspace. Be concise and focused on your role.`;

    try {
      wsAbortRef.current = new AbortController();
      let accumulated = '';
      const response = await streamChat({
        systemInstruction: systemPrompt,
        messages: [
          ...(thread?.messages.map((m): ChatMsg => ({ role: m.role, content: m.content })) ?? []),
          { role: "user", content } as ChatMsg,
        ],
        temperature: 0.7,
        maxTokens: 2048,
        signal: wsAbortRef.current.signal,
        onChunk: (text: string) => { accumulated += text; },
      });

      const assistantMsg: WorkspaceMessage = { id: `msg-${Date.now()}-resp`, role: "assistant", content: response, timestamp: Date.now() };
      setWsThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, messages: [...t.messages, assistantMsg] } : t));

      // Persist key insights to workspace shared memory for cross-thread context
      const persona = thread?.persona ?? "developer";
      _setWsSharedMemory((prev) => [
        ...prev.slice(-(49)),
        { key: `${persona}:${threadId}`, value: response.slice(0, 500), source: persona as AgentRole, timestamp: Date.now() },
      ]);

      return response;
    } catch {
      const errorMsg: WorkspaceMessage = { id: `msg-${Date.now()}-err`, role: "assistant", content: "[Error] Failed to get response. Check API key configuration.", timestamp: Date.now() };
      setWsThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, messages: [...t.messages, errorMsg] } : t));
      return errorMsg.content;
    }
  }, [wsThreads]);

  // ── Database ──────────────────────────────────────────────
  const dbConnections = DEMO_DB_CONNECTIONS;
  const dbTables = DEMO_TABLES;

  const handleDbConnect = useCallback(async (_conn: DBConnection): Promise<boolean> => {
    return true; // Demo: always connected
  }, []);

  const handleDbQuery = useCallback(async (_connId: string, query: string): Promise<QueryResult> => {
    return executeLocalQuery(query);
  }, []);

  // ── Merge Conflicts ───────────────────────────────────────
  const mergeConflicts = useMemo(() => {
    if (!activeFileContent) return [];
    return parseMergeConflicts(activeFileContent);
  }, [activeFileContent]);

  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, ConflictBlock>>({});

  const resolveConflict = useCallback((conflictId: string, resolution: ConflictBlock["resolution"], manualContent?: string) => {
    setResolvedConflicts((prev) => ({
      ...prev,
      [conflictId]: { ...mergeConflicts.find((c) => c.id === conflictId)!, resolved: true, resolution, manualContent },
    }));
  }, [mergeConflicts]);

  const mergeConflictsWithResolutions = useMemo(() => {
    return mergeConflicts.map((c) => resolvedConflicts[c.id] ?? c);
  }, [mergeConflicts, resolvedConflicts]);

  // ── Return ────────────────────────────────────────────────
  return {
    // Recent Files
    recentFiles,
    trackFileOpen,
    clearRecentFiles,

    // Symbol Palette
    symbols,

    // Code Actions
    editorSelection,
    updateEditorSelection,

    // Canvas
    canvasNodes,
    canvasConnections,
    setCanvasNodes,
    setCanvasConnections,
    initCanvas,
    refreshCanvas,

    // AI Hub
    aiFeatures,
    toggleAiFeature,

    // AI Workspace
    wsThreads,
    wsSharedMemory,
    createWsThread,
    deleteWsThread,
    sendWsMessage,

    // Database
    dbConnections,
    dbTables,
    handleDbConnect,
    handleDbQuery,

    // Merge Conflicts
    mergeConflictsWithResolutions,
    resolveConflict,
  };
}

// IDENTITY_SEAL: PART-7 | role=MainHook | inputs=UseCodeStudioPanelsOptions | outputs=PanelStates+Handlers
