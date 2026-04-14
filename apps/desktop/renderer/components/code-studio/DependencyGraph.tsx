"use client";

/**
 * @module DependencyGraph
 * Real import parsing with force-directed graph visualization.
 *
 * Unlike other simulated panels, this component performs actual import/export
 * statement parsing from file contents to build a real dependency graph.
 * Scope: client-side static analysis only (regex-based parsing of
 * import/require statements). Does not resolve node_modules or dynamic imports.
 */

// ============================================================
// PART 1 — Imports, Types & Import Parser
// ============================================================

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";
import {
  ForceNode,
  ForceEdge,
  simulateForceLayout,
  initializePositions,
  tickForceLayout,
} from "@/lib/force-graph";

/** Files map: path -> content */
interface Props {
  files: Record<string, string>;
}

interface DepEdge {
  source: string;
  target: string;
}

const SVG_W = 700;
const SVG_H = 500;
const NODE_R = 18;

const TYPE_COLORS: Record<string, string> = {
  ".tsx": "#3b82f6",
  ".ts": "#22c55e",
  ".css": "#a855f7",
  ".scss": "#a855f7",
  ".json": "#f59e0b",
};

function getColor(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return TYPE_COLORS[ext] ?? "#6b7280";
}

function getShortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Parse import statements from file content and return imported paths */
function parseImports(content: string): string[] {
  const results: string[] = [];
  const regex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const specifier = match[1];
    // Skip node_modules / bare specifiers
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      results.push(specifier);
    }
  }
  return results;
}

/** Resolve relative import to absolute-ish path within project */
function resolveImport(from: string, specifier: string, knownPaths: Set<string>): string | null {
  let resolved: string;
  if (specifier.startsWith("@/")) {
    resolved = specifier.replace("@/", "src/");
  } else {
    // Relative path resolution
    const fromDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
    const parts = [...fromDir.split("/"), ...specifier.split("/")].filter(Boolean);
    const stack: string[] = [];
    for (const p of parts) {
      if (p === "..") stack.pop();
      else if (p !== ".") stack.push(p);
    }
    resolved = stack.join("/");
  }

  // Try with common extensions
  const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`, `${resolved}/index.tsx`];
  for (const c of candidates) {
    if (knownPaths.has(c)) return c;
  }
  return null;
}

/** Detect circular dependencies using DFS */
function findCircularDeps(edges: DepEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }

  const circularEdges = new Set<string>();
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      // Found cycle — mark edges in cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        for (let i = cycleStart; i < path.length - 1; i++) {
          circularEdges.add(`${path[i]}->${path[i + 1]}`);
        }
        circularEdges.add(`${path[path.length - 1]}->${node}`);
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      dfs(neighbor, [...path, node]);
    }
    inStack.delete(node);
  }

  for (const node of adj.keys()) {
    dfs(node, []);
  }
  return circularEdges;
}

// IDENTITY_SEAL: PART-1 | role=Types+Parser | inputs=files | outputs=DepEdge[],circularDeps

// ============================================================
// PART 2 — Drag Hook (simplified from CharRelationGraph)
// ============================================================

function useDrag(
  nodesRef: React.MutableRefObject<ForceNode[]>,
  edges: ForceEdge[],
  setNodes: (n: ForceNode[]) => void,
) {
  const dragging = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const onPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = id;
    nodesRef.current = nodesRef.current.map((n) =>
      n.id === id ? { ...n, pinned: true } : n,
    );
  }, [nodesRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const y = ((e.clientY - rect.top) / rect.height) * SVG_H;
    nodesRef.current = nodesRef.current.map((n) =>
      n.id === dragging.current ? { ...n, x, y, vx: 0, vy: 0 } : n,
    );
    const updated = tickForceLayout(nodesRef.current, edges, { width: SVG_W, height: SVG_H });
    nodesRef.current = updated;
    setNodes([...updated]);
  }, [edges, nodesRef, setNodes]);

  const onPointerUp = useCallback(() => {
    if (dragging.current) {
      nodesRef.current = nodesRef.current.map((n) =>
        n.id === dragging.current ? { ...n, pinned: false } : n,
      );
      dragging.current = null;
    }
  }, [nodesRef]);

  return { svgRef, onPointerDown, onPointerMove, onPointerUp };
}

// IDENTITY_SEAL: PART-2 | role=DragHook | inputs=ForceNode[],ForceEdge[] | outputs=svgRef,handlers

// ============================================================
// PART 3 — SVG Rendering Components
// ============================================================

function DepEdgeLine({ from, to, isCircular }: { from: ForceNode; to: ForceNode; isCircular: boolean }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;

  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const nx = -dy / dist;
  const ny = dx / dist;
  const curvature = 15;
  const cx = mx + nx * curvature;
  const cy = my + ny * curvature;

  return (
    <path
      d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
      fill="none"
      stroke={isCircular ? "#ef4444" : "#4b5563"}
      strokeWidth={isCircular ? 2.5 : 1.2}
      strokeDasharray={isCircular ? "6,3" : undefined}
      strokeLinecap="round"
      opacity={isCircular ? 0.9 : 0.5}
      markerEnd={isCircular ? "url(#arrowRed)" : "url(#arrowGray)"}
    />
  );
}

function FileNode({ node, path, onPointerDown }: {
  node: ForceNode;
  path: string;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
}) {
  const color = getColor(path);
  const name = getShortName(path);
  const displayName = name.length > 14 ? name.slice(0, 12) + ".." : name;

  return (
    <g
      style={{ cursor: "grab" }}
      onPointerDown={(e) => onPointerDown(node.id, e)}
    >
      <circle cx={node.x} cy={node.y} r={NODE_R} fill={color} opacity={0.2} stroke={color} strokeWidth={1.5} />
      <text x={node.x} y={node.y + 1} fill="white" fontSize="7" textAnchor="middle" dominantBaseline="central" fontWeight="bold" style={{ pointerEvents: "none", userSelect: "none" }}>
        {displayName}
      </text>
    </g>
  );
}

// IDENTITY_SEAL: PART-3 | role=SVGRendering | inputs=ForceNode,path | outputs=JSX

// ============================================================
// PART 4 — Main Component
// ============================================================

function DependencyGraph({ files }: Props) {
  const filePaths = useMemo(() => Object.keys(files), [files]);
  const knownPaths = useMemo(() => new Set(filePaths), [filePaths]);

  // Build edges from import analysis
  const depEdges = useMemo(() => {
    const edges: DepEdge[] = [];
    for (const [path, content] of Object.entries(files)) {
      const imports = parseImports(content);
      for (const imp of imports) {
        const resolved = resolveImport(path, imp, knownPaths);
        if (resolved && resolved !== path) {
          edges.push({ source: path, target: resolved });
        }
      }
    }
    return edges;
  }, [files, knownPaths]);

  // Detect circular dependencies
  const circularEdgeKeys = useMemo(() => findCircularDeps(depEdges), [depEdges]);

  // Force edges
  const forceEdges: ForceEdge[] = useMemo(
    () => depEdges.map((e) => ({ source: e.source, target: e.target })),
    [depEdges],
  );

  // Layout key for re-simulation
  const layoutKey = useMemo(
    () => filePaths.join(",") + "|" + depEdges.map((e) => `${e.source}->${e.target}`).join(","),
    [filePaths, depEdges],
  );

  // Initialize and simulate
  const initialNodes = useMemo(() => {
    if (filePaths.length === 0) return [];
    const positions = initializePositions(filePaths, SVG_W, SVG_H);
    return simulateForceLayout(positions, forceEdges, { width: SVG_W, height: SVG_H });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  const [nodes, setNodes] = useState<ForceNode[]>(initialNodes);
  const nodesRef = useRef(nodes);

  const setNodesAndRef = useCallback((next: ForceNode[]) => {
    nodesRef.current = next;
    setNodes(next);
  }, []);

  useEffect(() => {
    nodesRef.current = initialNodes;
    setNodes(initialNodes);
  }, [initialNodes]);

  const { svgRef, onPointerDown, onPointerMove, onPointerUp } = useDrag(nodesRef, forceEdges, setNodesAndRef);

  const getNode = (id: string) => nodes.find((n) => n.id === id);

  const handleResetLayout = useCallback(() => {
    if (filePaths.length === 0) return;
    const positions = initializePositions(filePaths, SVG_W, SVG_H);
    const fresh = simulateForceLayout(positions, forceEdges, { width: SVG_W, height: SVG_H });
    nodesRef.current = fresh;
    setNodes(fresh);
  }, [filePaths, forceEdges]);

  const circularCount = circularEdgeKeys.size;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">Dependency Graph</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-text-tertiary border border-white/10">
            {filePaths.length} files
          </span>
          {circularCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertTriangle className="w-3 h-3" /> {circularCount} circular
            </span>
          )}
        </div>
        <button onClick={handleResetLayout} className="p-1.5 rounded hover:bg-white/10 text-text-tertiary hover:text-white transition-colors" title="Reset layout">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-hidden">
        {filePaths.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px] text-text-tertiary">
            No files to display. Open a project to see dependencies.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full h-full"
            style={{ fontFamily: "var(--font-mono, monospace)", touchAction: "none" }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              <marker id="arrowGray" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <path d="M0,0 L6,2 L0,4" fill="#4b5563" />
              </marker>
              <marker id="arrowRed" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <path d="M0,0 L6,2 L0,4" fill="#ef4444" />
              </marker>
              <pattern id="depGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-border, #1e2530)" strokeWidth="0.5" opacity="0.2" />
              </pattern>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#depGrid)" rx="8" />

            {/* Edges */}
            {depEdges.map((e, i) => {
              const from = getNode(e.source);
              const to = getNode(e.target);
              if (!from || !to) return null;
              const key = `${e.source}->${e.target}`;
              return <DepEdgeLine key={i} from={from} to={to} isCircular={circularEdgeKeys.has(key)} />;
            })}

            {/* Nodes */}
            {nodes.map((node) => (
              <FileNode key={node.id} node={node} path={node.id} onPointerDown={onPointerDown} />
            ))}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 p-2 border-t border-white/5 text-[9px] text-text-tertiary shrink-0">
        {Object.entries(TYPE_COLORS).map(([ext, color]) => (
          <div key={ext} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
            <span>{ext}</span>
          </div>
        ))}
        <span className="flex items-center gap-1 ml-auto">
          <span className="w-4 h-0.5 inline-block rounded bg-red-500" />
          <span>circular</span>
        </span>
      </div>
    </div>
  );
}

export default React.memo(DependencyGraph);

// IDENTITY_SEAL: PART-4 | role=MainComponent | inputs=files | outputs=JSX
