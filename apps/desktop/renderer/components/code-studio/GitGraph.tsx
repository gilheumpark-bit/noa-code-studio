"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useMemo } from "react";
import { GitCommit, GitBranch, GitMerge } from "lucide-react";

export interface GitCommitNode {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: number;
  branch: string;
  parents: string[];
  isMerge: boolean;
}

export interface GitBranchInfo {
  name: string;
  color: string;
  headHash: string;
}

interface GitGraphProps {
  commits: GitCommitNode[];
  branches: GitBranchInfo[];
  currentBranch: string;
  onCheckout?: (hash: string) => void;
  onBranchClick?: (branch: string) => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=GitCommitNode,GitBranchInfo

// ============================================================
// PART 2 — Graph Layout
// ============================================================

const BRANCH_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
const LANE_WIDTH = 24;
const ROW_HEIGHT = 36;
const NODE_RADIUS = 5;

interface LayoutNode {
  commit: GitCommitNode;
  lane: number;
  color: string;
}

function computeLayout(commits: GitCommitNode[], branches: GitBranchInfo[]): LayoutNode[] {
  const branchColorMap = new Map<string, string>();
  branches.forEach((b, i) => branchColorMap.set(b.name, b.color || BRANCH_COLORS[i % BRANCH_COLORS.length]));

  const branchLaneMap = new Map<string, number>();
  let nextLane = 0;

  return commits.map((c) => {
    let lane = branchLaneMap.get(c.branch);
    if (lane == null) {
      lane = nextLane++;
      branchLaneMap.set(c.branch, lane);
    }
    return {
      commit: c,
      lane,
      color: branchColorMap.get(c.branch) ?? BRANCH_COLORS[lane % BRANCH_COLORS.length],
    };
  });
}

// IDENTITY_SEAL: PART-2 | role=GraphLayout | inputs=commits,branches | outputs=LayoutNode[]

// ============================================================
// PART 3 — SVG Graph Renderer
// ============================================================

function GraphSVG({
  layoutNodes,
  selectedHash,
  onSelect,
}: {
  layoutNodes: LayoutNode[];
  selectedHash: string | null;
  onSelect: (hash: string) => void;
}) {
  const maxLane = Math.max(0, ...layoutNodes.map((n) => n.lane));
  const svgWidth = (maxLane + 1) * LANE_WIDTH + 20;
  const svgHeight = layoutNodes.length * ROW_HEIGHT + 20;

  const hashToIndex = new Map<string, number>();
  layoutNodes.forEach((n, i) => hashToIndex.set(n.commit.hash, i));

  return (
    <svg width={svgWidth} height={svgHeight} className="shrink-0">
      {/* Connection lines */}
      {layoutNodes.map((node, i) => {
        const x = node.lane * LANE_WIDTH + LANE_WIDTH / 2 + 10;
        const y = i * ROW_HEIGHT + ROW_HEIGHT / 2 + 10;
        return node.commit.parents.map((parentHash) => {
          const pi = hashToIndex.get(parentHash);
          if (pi == null) return null;
          const parent = layoutNodes[pi];
          const px = parent.lane * LANE_WIDTH + LANE_WIDTH / 2 + 10;
          const py = pi * ROW_HEIGHT + ROW_HEIGHT / 2 + 10;
          return (
            <path
              key={`${node.commit.hash}-${parentHash}`}
              d={node.lane === parent.lane
                ? `M${x},${y} L${px},${py}`
                : `M${x},${y} C${x},${(y + py) / 2} ${px},${(y + py) / 2} ${px},${py}`
              }
              fill="none"
              stroke={node.color}
              strokeWidth={1.5}
              opacity={0.5}
            />
          );
        });
      })}

      {/* Commit nodes */}
      {layoutNodes.map((node, i) => {
        const x = node.lane * LANE_WIDTH + LANE_WIDTH / 2 + 10;
        const y = i * ROW_HEIGHT + ROW_HEIGHT / 2 + 10;
        const isSelected = node.commit.hash === selectedHash;
        return (
          <g key={node.commit.hash} onClick={() => onSelect(node.commit.hash)} className="cursor-pointer">
            <circle
              cx={x}
              cy={y}
              r={node.commit.isMerge ? NODE_RADIUS + 2 : NODE_RADIUS}
              fill={isSelected ? "#fff" : node.color}
              stroke={isSelected ? node.color : "none"}
              strokeWidth={2}
            />
            {node.commit.isMerge && (
              <circle cx={x} cy={y} r={NODE_RADIUS - 1} fill="#1e1e2e" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// IDENTITY_SEAL: PART-3 | role=SVGRenderer | inputs=layoutNodes | outputs=SVG

// ============================================================
// PART 4 — Commit Detail
// ============================================================

function CommitDetail({
  commit,
  onCheckout,
}: {
  commit: GitCommitNode | null;
  onCheckout?: (hash: string) => void;
}) {
  if (!commit) return null;
  const date = new Date(commit.date);
  return (
    <div className="border-t border-white/5 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-white">
        {commit.isMerge ? <GitMerge size={14} /> : <GitCommit size={14} />}
        <span className="font-mono text-xs text-gray-400">{commit.shortHash}</span>
        {onCheckout && (
          <button
            onClick={() => onCheckout(commit.hash)}
            className="ml-auto text-xs text-blue-400 hover:text-blue-300"
          >
            Checkout
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-300">{commit.message}</p>
      <div className="mt-1 text-xs text-gray-500">
        {commit.author} | {date.toLocaleString()} | {commit.branch}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=CommitDetail | inputs=GitCommitNode | outputs=JSX

// ============================================================
// PART 5 — Main Component
// ============================================================

export default function GitGraph({
  commits,
  branches,
  currentBranch,
  onCheckout,
  onBranchClick,
}: GitGraphProps) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const layoutNodes = useMemo(() => computeLayout(commits, branches), [commits, branches]);
  const selectedCommit = commits.find((c) => c.hash === selectedHash) ?? null;

  return (
    <div className="flex h-full flex-col bg-[#16161e]">
      {/* Branch tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 px-3 py-1.5">
        <GitBranch size={14} className="text-gray-500 shrink-0" />
        {branches.map((b) => (
          <button
            key={b.name}
            onClick={() => onBranchClick?.(b.name)}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap transition-colors ${
              b.name === currentBranch
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color || "#6b7280" }} />
            {b.name}
          </button>
        ))}
      </div>

      {/* Graph + commit list */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
          <GraphSVG layoutNodes={layoutNodes} selectedHash={selectedHash} onSelect={setSelectedHash} />
          <div className="flex-1 min-w-0">
            {layoutNodes.map((node) => (
              <div
                key={node.commit.hash}
                onClick={() => setSelectedHash(node.commit.hash)}
                className={`flex items-center gap-3 px-3 cursor-pointer transition-colors ${
                  node.commit.hash === selectedHash ? "bg-white/10" : "hover:bg-white/5"
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                <span className="font-mono text-[10px] text-gray-600 shrink-0">{node.commit.shortHash}</span>
                <span className="text-xs text-gray-300 truncate flex-1">{node.commit.message}</span>
                <span className="text-[10px] text-gray-600 shrink-0">{node.commit.author}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CommitDetail commit={selectedCommit} onCheckout={onCheckout} />
    </div>
  );
}

// IDENTITY_SEAL: PART-5 | role=GitGraphUI | inputs=commits,branches | outputs=JSX
