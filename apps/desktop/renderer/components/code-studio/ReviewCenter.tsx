"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useMemo } from "react";
import {
  AlertTriangle, GitBranch, BarChart3, Bug, Loader2,
  CheckCircle, ChevronDown, ChevronRight,
  Filter, ThumbsUp, ThumbsDown, MessageSquare,
} from "lucide-react";
import type { TeamResult, Finding, Severity } from "@noa/quill-engine/pipeline/pipeline-teams";
import { getReviewChecklist, type ChecklistItem } from "@noa/quill-engine/pipeline/pipeline-utils";

type ReviewTab = "problems" | "pipeline" | "checklist" | "bugfinder";

interface PipelineResultData {
  stages: TeamResult[];
  overallScore: number;
  overallStatus: "pass" | "warn" | "fail";
  timestamp: number;
}

interface ReviewFile {
  name: string;
  status: "pending" | "approved" | "rejected";
  comments: string[];
  findings: Finding[];
}

interface Props {
  pipelineResult: PipelineResultData | null;
  files?: ReviewFile[];
  onBugScan?: () => Promise<void>;
  onApproveFile?: (fileName: string) => void;
  onOverrideFile?: (fileName: string) => void;
  onRejectFile?: (fileName: string) => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=Props

// ============================================================
// PART 2 — Tab Configuration & Problems Panel
// ============================================================

const TAB_ICONS: Record<ReviewTab, React.ReactNode> = {
  problems: <AlertTriangle size={12} />,
  pipeline: <GitBranch size={12} />,
  checklist: <BarChart3 size={12} />,
  bugfinder: <Bug size={12} />,
};

const TAB_LABELS: Record<ReviewTab, string> = {
  problems: "Problems",
  pipeline: "Pipeline",
  checklist: "Checklist",
  bugfinder: "Bug Finder",
};

const TABS: ReviewTab[] = ["problems", "pipeline", "checklist", "bugfinder"];

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "info"];
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "text-red-400",
  major: "text-accent-amber",
  minor: "text-blue-400",
  info: "text-text-tertiary",
};

// IDENTITY_SEAL: PART-2 | role=TabConfig | inputs=none | outputs=TABS

// ============================================================
// PART 3 — Sub-Components
// ============================================================

function ProblemsView({ findings, severityFilter }: {
  findings: Array<Finding & { team: string }>;
  severityFilter: Severity | null;
}) {
  const filtered = severityFilter
    ? findings.filter((f) => f.severity === severityFilter)
    : findings;

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-text-tertiary">
        {severityFilter ? `No ${severityFilter} findings.` : "No findings. Code looks good!"}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1 overflow-y-auto" style={{ maxHeight: 200 }}>
      {filtered.map((f, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px] px-2 py-1 rounded hover:bg-bg-tertiary">
          <span className={`mt-0.5 ${SEVERITY_COLORS[f.severity]}`}>
            {f.severity === "critical" ? "C" : f.severity === "major" ? "M" : f.severity === "minor" ? "m" : "i"}
          </span>
          <span className="text-text-tertiary shrink-0">[{f.team}]</span>
          <span className="text-text-primary flex-1">{f.message}</span>
          {f.line != null && <span className="text-text-tertiary shrink-0">L{f.line}</span>}
        </div>
      ))}
    </div>
  );
}

function ChecklistView() {
  const checklist = getReviewChecklist();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const passCount = checked.size;
  const total = checklist.items.length;
  const score = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between text-[10px] text-text-tertiary px-2">
        <span>Review Checklist ({passCount}/{total})</span>
        <span className={score >= 77 ? "text-green-400" : score >= 60 ? "text-accent-amber" : "text-red-400"}>
          {score}%
        </span>
      </div>
      <div className="space-y-1 max-h-[180px] overflow-y-auto">
        {checklist.items.map((item: ChecklistItem) => (
          <button key={item.id} onClick={() => toggle(item.id)}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-bg-tertiary text-[10px]">
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
              checked.has(item.id) ? "bg-green-500 border-green-500" : "border-border"
            }`}>
              {checked.has(item.id) && <CheckCircle size={8} className="text-white" />}
            </div>
            <span className="text-text-tertiary shrink-0">[{item.category}]</span>
            <span className="text-text-primary flex-1">{item.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FileReviewList({ files, onApprove, onOverride, onReject }: {
  files: ReviewFile[];
  onApprove?: (name: string) => void;
  onOverride?: (name: string) => void;
  onReject?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (files.length === 0) {
    return <div className="text-center text-xs text-text-tertiary py-8">No files to review.</div>;
  }

  return (
    <div className="space-y-1 p-2 max-h-[180px] overflow-y-auto">
      {files.map((file) => (
        <div key={file.name} className="bg-bg-primary rounded border border-border">
          <button onClick={() => setExpanded(expanded === file.name ? null : file.name)}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] text-text-primary hover:bg-bg-tertiary">
            {expanded === file.name ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="flex-1 text-left font-mono truncate">{file.name}</span>
            <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${
              file.status === "approved" ? "bg-green-500/15 text-green-400" :
              file.status === "rejected" ? "bg-red-500/15 text-red-400" :
              "bg-accent-amber/15 text-accent-amber"
            }`}>{file.status.toUpperCase()}</span>
            <span className="text-text-tertiary">{file.findings.length} issues</span>
          </button>
          {expanded === file.name && (
            <div className="px-2 pb-2 space-y-1">
              {file.findings.map((f, i) => (
                <div key={i} className="text-[9px] text-text-tertiary pl-4">{f.message}</div>
              ))}
              <div className="flex items-center gap-1 pl-4 pt-1">
                <button onClick={() => onApprove?.(file.name)} className="text-[9px] px-2 py-0.5 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25">
                  <ThumbsUp size={8} className="inline mr-1" />Approve
                </button>
                {onOverride && (
                  <button onClick={() => onOverride(file.name)} className="text-[9px] px-2 py-0.5 rounded bg-accent-amber/15 text-accent-amber hover:bg-accent-amber/25">
                    <AlertTriangle size={8} className="inline mr-1" />Override
                  </button>
                )}
                <button onClick={() => onReject?.(file.name)} className="text-[9px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25">
                  <ThumbsDown size={8} className="inline mr-1" />Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=SubComponents | inputs=findings,files | outputs=JSX

// ============================================================
// PART 4 — Main Component
// ============================================================

export function ReviewCenter({ pipelineResult, files, onBugScan, onApproveFile, onOverrideFile, onRejectFile }: Props) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("problems");
  const [bugScanning, setBugScanning] = useState(false);
  const [bugScanDone, setBugScanDone] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null);

  const allFindings = useMemo(() => {
    if (!pipelineResult?.stages) return [];
    return pipelineResult.stages.flatMap((s) =>
      s.findings.map((f) => ({ ...f, team: s.stage })),
    );
  }, [pipelineResult]);

  const problemCount = allFindings.length;

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
    for (const f of allFindings) counts[f.severity]++;
    return counts;
  }, [allFindings]);

  const handleBugScan = useCallback(async () => {
    if (!onBugScan || bugScanning) return;
    setBugScanning(true);
    setBugScanDone(false);
    try { await onBugScan(); setBugScanDone(true); }
    finally { setBugScanning(false); }
  }, [onBugScan, bugScanning]);

  return (
    <div className="flex flex-col border-t border-border bg-bg-secondary overflow-hidden" style={{ minHeight: 160 }}>
      {/* Tab Bar */}
      <div className="flex items-center h-8 border-b border-border bg-bg-secondary px-1 gap-0.5 shrink-0" role="tablist">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-2.5 h-full text-[11px] font-medium transition-colors border-b-2 ${
              activeTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
            }`} role="tab">
            {TAB_ICONS[tab]}
            <span>{TAB_LABELS[tab]}</span>
            {tab === "problems" && problemCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0 text-[9px] rounded-full bg-red-500/20 text-red-400 font-semibold">{problemCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden" role="tabpanel">
        {activeTab === "problems" && (
          <div>
            {/* Severity filter bar */}
            <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
              <Filter size={10} className="text-text-tertiary" />
              <button onClick={() => setSeverityFilter(null)}
                className={`text-[9px] px-1.5 py-0.5 rounded ${!severityFilter ? "bg-bg-tertiary text-text-primary" : "text-text-tertiary"}`}>
                All ({problemCount})
              </button>
              {SEVERITY_ORDER.map((sev) => (
                <button key={sev} onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${severityFilter === sev ? "bg-bg-tertiary" : ""} ${SEVERITY_COLORS[sev]}`}>
                  {sev} ({severityCounts[sev]})
                </button>
              ))}
            </div>
            <ProblemsView findings={allFindings} severityFilter={severityFilter} />
          </div>
        )}

        {activeTab === "pipeline" && pipelineResult && (
          <div className="p-2 space-y-1 overflow-y-auto" style={{ maxHeight: 200 }}>
            <div className="flex items-center gap-2 text-xs text-text-primary px-2 py-1">
              <span>Overall: <strong>{pipelineResult.overallScore}</strong>/100</span>
              <span className={pipelineResult.overallStatus === "pass" ? "text-green-400" : pipelineResult.overallStatus === "warn" ? "text-accent-amber" : "text-red-400"}>
                {pipelineResult.overallStatus.toUpperCase()}
              </span>
            </div>
            {pipelineResult.stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-2 px-2 py-1 text-[10px]">
                <span className="w-20 text-text-tertiary truncate">{s.stage}</span>
                <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.score >= 80 ? "bg-accent-green" : s.score >= 60 ? "bg-accent-amber" : "bg-accent-red"}`} style={{ width: `${s.score}%` }} />
                </div>
                <span className="text-text-primary font-mono w-6 text-right">{s.score}</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === "pipeline" && !pipelineResult && (
          <div className="flex items-center justify-center h-32 text-xs text-text-tertiary">No pipeline results.</div>
        )}

        {activeTab === "checklist" && <ChecklistView />}

        {activeTab === "bugfinder" && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            {bugScanning ? (
              <><Loader2 size={24} className="animate-spin text-blue-400" /><span className="text-xs text-text-tertiary">Scanning for bugs...</span></>
            ) : bugScanDone ? (
              <><Bug size={24} className="text-green-400" /><span className="text-xs text-text-tertiary">Bug scan complete</span>
                <button onClick={handleBugScan} className="px-3 py-1.5 text-xs rounded bg-bg-tertiary hover:bg-border text-text-primary">Scan Again</button></>
            ) : (
              <><Bug size={24} className="text-text-tertiary opacity-40" /><p className="text-xs text-text-tertiary">Engine-powered bug detection across your codebase</p>
                <button onClick={handleBugScan} disabled={!onBugScan}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-500 text-white hover:opacity-90 disabled:opacity-40">
                  Start Bug Scan
                </button></>
            )}
          </div>
        )}
      </div>

      {/* File Reviews (always visible at bottom if files provided) */}
      {files && files.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-tertiary">
            <MessageSquare size={10} /> File Reviews ({files.length})
          </div>
          <FileReviewList files={files} onApprove={onApproveFile} onOverride={onOverrideFile} onReject={onRejectFile} />
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=ReviewUI | inputs=Props | outputs=JSX
