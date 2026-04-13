// @ts-nocheck
"use client";

/**
 * @module PipelinePanel
 *
 * SIMULATED -- requires WebContainer/real backend for production use.
 *
 * What is simulated:
 *   - Pipeline execution is driven by the parent component; this panel
 *     only renders pre-computed `TeamResult[]` data (no analysis runs here)
 *   - The 8-team scores and findings come from a simplified static analysis
 *     engine, not from full AST parsing or runtime verification
 *   - Run/abort controls delegate to parent callbacks (`onRun`, `onAbort`)
 *
 * What is real:
 *   - Full 8-team grid UI (Simulation, Generation, Validation, Size/Density,
 *     Asset Trace, Stability, Release/IP, Governance)
 *   - Per-team score bars, status badges, and expandable findings list
 *   - Overall score aggregation and pass/warn/fail status display
 *   - Markdown report generation, clipboard copy, and file download
 *   - Bilingual labels (KO/EN) via LangContext
 *   - Finding severity filtering (critical/major shown first when >10 items)
 *
 * To make fully functional:
 *   1. Connect to real AST-based static analysis (ESLint, TypeScript compiler)
 *   2. Run security scanning (dependency audit, secret detection)
 *   3. Execute tests in WebContainer for stability/regression checks
 *   4. Implement parallel team execution with real-time progress streaming
 *   5. Add persistent pipeline history with trend analysis
 *   6. Integrate CI/CD webhook triggers for automated pipeline runs
 */

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import {
  CheckCircle, AlertTriangle, XCircle, Shield, Loader2,
  ChevronDown, ChevronRight, Zap, Eye, Code2, Scale,
  Network, ShieldCheck, Gavel, BarChart3, Download, Copy,
  Play, Square, Clock,
} from "lucide-react";
import type { TeamResult, Finding } from "@noa/quill-engine/pipeline/pipeline-teams";
import { useLang } from "@/lib/LangContext";
import { createT } from "@/lib/i18n";
import type { AppLanguage } from "@noa/shared-types";
import { generateReport } from "@noa/quill-engine/pipeline/pipeline-utils";

// ============================================================
// PART 1-B — Progress Streaming Types
// ============================================================

type ProgressStatus = "pending" | "running" | "pass" | "warn" | "fail";

interface TeamProgress {
  teamName: string;
  status: ProgressStatus;
  score: number;
  elapsedMs: number;
}

interface PipelineResultData {
  stages: TeamResult[];
  overallScore: number;
  overallStatus: "pass" | "warn" | "fail";
  timestamp: number;
}

interface Props {
  result: PipelineResultData | null;
  onRun?: () => Promise<void>;
  onAbort?: () => void;
  isRunning?: boolean;
  lastRunTimestamp?: number;
  /** SSE-style callback: fired each time a team completes */
  onTeamProgress?: (teamName: string, status: "running" | "pass" | "warn" | "fail", score: number) => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=Props

// ============================================================
// PART 2 — Team Configuration & Icons
// ============================================================

const TEAM_CONFIG: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
  simulation:     { label: "Simulation",   icon: <Zap size={14} />,          colorClass: "text-accent-blue" },
  generation:     { label: "Generation",   icon: <Code2 size={14} />,        colorClass: "text-accent-green" },
  validation:     { label: "Validation",   icon: <Eye size={14} />,          colorClass: "text-accent-amber" },
  "size-density": { label: "Size/Density", icon: <Scale size={14} />,        colorClass: "text-accent-purple" },
  "asset-trace":  { label: "Asset Trace",  icon: <Network size={14} />,      colorClass: "text-accent-blue" },
  stability:      { label: "Stability",    icon: <ShieldCheck size={14} />,  colorClass: "text-accent-green" },
  "release-ip":   { label: "Release/IP",   icon: <Gavel size={14} />,        colorClass: "text-accent-red" },
  governance:     { label: "Governance",   icon: <BarChart3 size={14} />,    colorClass: "text-accent-purple" },
};

function TeamStatusIcon({ status }: { status: string }) {
  if (status === "running") return <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin text-accent-blue" /><span className="sr-only">Running</span></span>;
  if (status === "pass") return <span className="flex items-center gap-1"><CheckCircle size={12} className="text-accent-green" /><span className="sr-only">Pass</span></span>;
  if (status === "warn") return <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-accent-amber" /><span className="sr-only">Warning</span></span>;
  if (status === "fail") return <span className="flex items-center gap-1"><XCircle size={12} className="text-accent-red" /><span className="sr-only">Fail</span></span>;
  return <div className="w-3 h-3 rounded-full bg-border animate-pulse" aria-label="Pending" />;
}

function StatusBadge({ status, lang }: { status: string; lang: string }) {
  const t = createT(lang as AppLanguage);
  const icon = status === "pass" ? <CheckCircle size={10} /> : status === "warn" ? <AlertTriangle size={10} /> : <XCircle size={10} />;
  const colors =
    status === "pass" ? "bg-accent-green/15 text-accent-green" :
    status === "warn" ? "bg-accent-amber/15 text-accent-amber" :
    "bg-accent-red/15 text-accent-red";
  
  const text = status === "pass" ? t('pipelinePanel.pass') :
               status === "warn" ? t('pipelinePanel.warn') :
               t('pipelinePanel.fail');

  return <span className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${colors}`}>{icon}{text}</span>;
}

/** Ordered team keys for sequential progress display */
const TEAM_ORDER = [
  "simulation", "generation", "validation", "size-density",
  "asset-trace", "stability", "release-ip", "governance",
] as const;

// IDENTITY_SEAL: PART-2 | role=TeamConfig | inputs=none | outputs=TEAM_CONFIG,TEAM_ORDER

// ============================================================
// PART 2-B — Animated Progress Bar
// ============================================================

function AnimatedProgressBar({ status, score }: { status: ProgressStatus; score: number }) {
  const barColor =
    status === "running" ? "bg-accent-blue" :
    status === "pass"    ? "bg-accent-green" :
    status === "fail"    ? "bg-accent-red" :
    status === "warn"    ? "bg-accent-amber" :
    "bg-border";

  const width = status === "pending" ? 0 : status === "running" ? 100 : score;

  return (
    <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${barColor} ${
          status === "running" ? "animate-pulse opacity-70" : ""
        } ${status === "pending" ? "opacity-0" : ""}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// IDENTITY_SEAL: PART-2B | role=AnimatedProgressBar | inputs=status,score | outputs=JSX

// ============================================================
// PART 2-C — useRunPipeline Hook
// ============================================================

const SIMULATED_DELAY_MS = 400;

function useRunPipeline(
  result: PipelineResultData | null,
  onTeamProgress?: Props["onTeamProgress"],
) {
  const [liveRunning, setLiveRunning] = useState(false);
  const [teamProgress, setTeamProgress] = useState<Map<string, TeamProgress>>(new Map());
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Reset progress map to all-pending */
  const resetProgress = useCallback(() => {
    const m = new Map<string, TeamProgress>();
    for (const t of TEAM_ORDER) {
      m.set(t, { teamName: t, status: "pending", score: 0, elapsedMs: 0 });
    }
    setTeamProgress(m);
    setElapsedMs(0);
  }, []);

  /** Run pipeline: accepts pre-computed result and streams team statuses sequentially */
  const runPipeline = useCallback(async (
    _code: string,
    precomputedResult?: PipelineResultData | null,
  ) => {
    const stages = precomputedResult?.stages ?? result?.stages;
    if (!stages || stages.length === 0) return;

    abortRef.current = false;
    setLiveRunning(true);
    resetProgress();

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    for (const teamKey of TEAM_ORDER) {
      if (abortRef.current) break;

      const stage = stages.find((s) => s.stage === teamKey);
      const teamStatus: ProgressStatus = stage?.status ?? "pass";
      const teamScore = stage?.score ?? 100;

      // Mark running
      setTeamProgress((prev) => {
        const next = new Map(prev);
        next.set(teamKey, { teamName: teamKey, status: "running", score: 0, elapsedMs: Date.now() - startTime });
        return next;
      });
      onTeamProgress?.(teamKey, "running", 0);

      // Simulate processing delay
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, SIMULATED_DELAY_MS + Math.random() * 300);
        const checkAbort = setInterval(() => {
          if (abortRef.current) { clearTimeout(timeout); clearInterval(checkAbort); resolve(); }
        }, 50);
        // Clean interval on resolve
        void new Promise<void>((r) => { setTimeout(() => { clearInterval(checkAbort); r(); }, SIMULATED_DELAY_MS + 400); });
      });

      if (abortRef.current) break;

      // Mark completed
      const finalStatus = teamStatus === "running" ? "pass" : teamStatus;
      setTeamProgress((prev) => {
        const next = new Map(prev);
        next.set(teamKey, { teamName: teamKey, status: finalStatus, score: teamScore, elapsedMs: Date.now() - startTime });
        return next;
      });
      if (finalStatus !== "pending") {
        onTeamProgress?.(teamKey, finalStatus as "pass" | "warn" | "fail", teamScore);
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setElapsedMs(Date.now() - startTime);
    setLiveRunning(false);
  }, [result, resetProgress, onTeamProgress]);

  /** Abort the live run */
  const abortPipeline = useCallback(() => {
    abortRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setLiveRunning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { liveRunning, teamProgress, elapsedMs, runPipeline, abortPipeline, resetProgress };
}

// IDENTITY_SEAL: PART-2C | role=useRunPipeline | inputs=result,onTeamProgress | outputs=hook

// ============================================================
// PART 3 — Main Component
// ============================================================

export function PipelinePanel({ result, onRun, onAbort, isRunning, lastRunTimestamp, onTeamProgress }: Props) {
  const { lang } = useLang();
  const t = createT(lang as AppLanguage);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const {
    liveRunning,
    teamProgress,
    elapsedMs,
    runPipeline,
    abortPipeline,
  } = useRunPipeline(result, onTeamProgress);

  /** Wrap onRun to also trigger live progress streaming */
  const handleRunWithProgress = useCallback(async () => {
    if (onRun) {
      // Start live progress display immediately (streams pre-computed results)
      const progressPromise = runPipeline("", result);
      // Also call the parent's onRun (which may update `result` prop)
      await Promise.all([onRun(), progressPromise]);
    } else {
      await runPipeline("", result);
    }
  }, [onRun, runPipeline, result]);

  const handleAbort = useCallback(() => {
    abortPipeline();
    onAbort?.();
  }, [abortPipeline, onAbort]);

  const handleCopyReport = useCallback(() => {
    if (!result) return;
    const report = generateReport(result.stages, result.timestamp);
    navigator.clipboard.writeText(report.markdown).catch(() => {});
  }, [result]);

  const handleDownloadReport = useCallback(() => {
    if (!result) return;
    const report = generateReport(result.stages, result.timestamp);
    const blob = new Blob([report.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  /** Bilingual team label helper */
  const getTeamLabel = useCallback((key: string) => {
    const labels: Record<string, string> = {
      simulation:     t('pipelinePanel.teamSimulation'),
      generation:     t('pipelinePanel.teamGeneration'),
      validation:     t('pipelinePanel.teamValidation'),
      "size-density": t('pipelinePanel.teamSizeDensity'),
      "asset-trace":  t('pipelinePanel.teamAssetTrace'),
      stability:      t('pipelinePanel.teamStability'),
      "release-ip":   t('pipelinePanel.teamReleaseIp'),
      governance:     t('pipelinePanel.teamGovernance'),
    };
    return labels[key] ?? TEAM_CONFIG[key]?.label ?? key;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /** Format elapsed time as seconds with 1 decimal */
  const formatElapsed = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const showLiveProgress = liveRunning || (teamProgress.size > 0 && !liveRunning);
  const completedTeams = Array.from(teamProgress.values()).filter((t) => t.status !== "pending" && t.status !== "running").length;

  // No result state
  if (!result && !isRunning && !liveRunning) {
    return (
      <div className="h-64 border-t border-border bg-bg-secondary flex flex-col items-center justify-center gap-3">
        <Shield size={32} className="text-text-tertiary opacity-30" />
        <p className="text-xs text-text-tertiary">{t('pipelinePanel.noResults')}</p>
        {onRun && (
          <button onClick={handleRunWithProgress} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-amber-800 text-stone-100 hover:opacity-90 transition-opacity">
            <Play size={12} /> {t('pipelinePanel.runTitle')}
          </button>
        )}
        {lastRunTimestamp && (
          <span className="text-[9px] text-text-tertiary">{t('pipelinePanel.lastRun')} {new Date(lastRunTimestamp).toLocaleString()}</span>
        )}
      </div>
    );
  }

  // Running state (parent-driven, no result yet, no live progress yet)
  if (isRunning && !result && !liveRunning) {
    return (
      <div className="h-64 border-t border-border bg-bg-secondary flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-amber-400" />
        <p className="text-xs text-text-tertiary">{t('pipelinePanel.running')}</p>
        {onAbort && (
          <button onClick={handleAbort} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-border text-accent-amber hover:bg-bg-tertiary">
            <Square size={12} /> {t('pipelinePanel.abort')}
          </button>
        )}
      </div>
    );
  }

  if (!result && !liveRunning) return null;

  return (
    <div className="border-t border-border bg-bg-secondary flex flex-col overflow-hidden" style={{ minHeight: "16rem" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
          <Shield size={12} className="text-amber-400" />
          {liveRunning
            ? t('pipelinePanel.runningTitle')
            : t('pipelinePanel.resultsTitle')
          }
          {result && !liveRunning && (
            <>
              <StatusBadge status={result.overallStatus} lang={lang} />
              <span className="text-text-tertiary font-mono">{result.overallScore}/100</span>
            </>
          )}
          {liveRunning && (
            <span className="flex items-center gap-1 text-[10px] text-text-tertiary font-mono">
              <Clock size={10} className="text-accent-blue" />
              {formatElapsed(elapsedMs)}
              <span className="text-text-tertiary ml-1">{completedTeams}/{TEAM_ORDER.length}</span>
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {liveRunning ? (
            <button onClick={handleAbort} className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border text-accent-amber hover:bg-bg-tertiary">
              <Square size={10} /> {t('pipelinePanel.abort')}
            </button>
          ) : (
            <>
              <button onClick={handleRunWithProgress} className="p-1 rounded hover:bg-bg-tertiary text-blue-400" title={t('pipelinePanel.rerun')} aria-label={t('pipelinePanel.rerun')}><Play size={12} /></button>
              {result && (
                <>
                  <button onClick={handleCopyReport} className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary" title={t('pipelinePanel.copyReport')} aria-label={t('pipelinePanel.copyReport')}><Copy size={12} /></button>
                  <button onClick={handleDownloadReport} className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary" title={t('pipelinePanel.downloadReport')} aria-label={t('pipelinePanel.downloadReport')}><Download size={12} /></button>
                </>
              )}
            </>
          )}
        </span>
      </div>

      {/* PART 3-B: Live Progress Strip (shown ON TOP of results) */}
      {showLiveProgress && (
        <div className="px-3 py-2 border-b border-border bg-bg-primary/50 shrink-0">
          <div className="grid grid-cols-8 gap-1.5">
            {TEAM_ORDER.map((teamKey) => {
              const progress = teamProgress.get(teamKey);
              const status: ProgressStatus = progress?.status ?? "pending";
              const score = progress?.score ?? 0;
              const config = TEAM_CONFIG[teamKey];

              return (
                <div key={teamKey} className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <span className={`${config?.colorClass ?? "text-text-tertiary"} opacity-70`}>
                      {config?.icon}
                    </span>
                    <TeamStatusIcon status={status} />
                  </div>
                  <AnimatedProgressBar status={status} score={score} />
                  <span className="text-[8px] font-mono text-text-tertiary leading-none">
                    {status === "pending" ? "--" : status === "running" ? "..." : score}
                  </span>
                </div>
              );
            })}
          </div>
          {liveRunning && (
            <div className="mt-1.5 w-full h-0.5 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-blue rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(completedTeams / TEAM_ORDER.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* PART 3-C: Existing 8-Team Grid (result display) */}
      {result && (
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-4 gap-2">
            {result.stages.map((stage) => {
              const stageKey = stage.stage;
              const config = TEAM_CONFIG[stageKey] ?? { label: stageKey, icon: <Shield size={14} />, colorClass: "text-text-tertiary" };
              const isExpanded = expandedTeam === stageKey;

              return (
                <div key={stageKey} className="flex flex-col">
                  <button
                    onClick={() => setExpandedTeam(isExpanded ? null : stageKey)}
                    className={`p-2 rounded-lg border transition-all ${
                      stage.status === "pass" ? "border-green-500/30 hover:border-green-500/60" :
                      stage.status === "warn" ? "border-accent-amber/30 hover:border-accent-amber/60" :
                      stage.status === "fail" ? "border-accent-red/30 hover:border-accent-red/60" :
                      "border-border"
                    } bg-bg-primary`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={config.colorClass}>{config.icon}</span>
                      <span className="text-[10px] font-semibold flex-1 text-left text-text-primary">{getTeamLabel(stageKey)}</span>
                      <TeamStatusIcon status={stage.status} />
                    </div>
                    <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden mb-1">
                      <div className={`h-full rounded-full transition-all duration-500 ${stage.score >= 80 ? "bg-accent-green" : stage.score >= 60 ? "bg-accent-amber" : "bg-accent-red"}`}
                        style={{ width: `${stage.score}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-text-primary">{stage.score}</span>
                    </div>
                    {stage.findings.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-[9px] text-text-tertiary">
                        {isExpanded ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
                        {stage.findings.length} {t('pipelinePanel.findingsCount')}
                      </div>
                    )}
                  </button>

                  {isExpanded && stage.findings.length > 0 && (
                    <div className="mt-1 p-2 bg-bg-primary border border-border rounded text-[9px] space-y-1 max-h-32 overflow-y-auto">
                      {(stage.findings.length > 10 ? stage.findings.filter((f: Finding) => f.severity === 'critical' || f.severity === 'major').slice(0, 10) : stage.findings).map((f: Finding, i: number) => (
                        <div key={i} className="flex items-start gap-1">
                          <span className={
                            f.severity === "critical" ? "text-red-400" :
                            f.severity === "major" ? "text-accent-amber" :
                            "text-text-tertiary"
                          }>
                            {f.severity === "critical" ? "C" : f.severity === "major" ? "M" : "m"}
                          </span>
                          <span className="flex-1 text-text-primary">{f.message}</span>
                          {f.line != null && <span className="text-text-tertiary">L{f.line}</span>}
                        </div>
                      ))}
                      {stage.findings.length > 10 && (
                        <div className="text-center pt-1 text-text-tertiary">
                          +{stage.findings.length - stage.findings.filter((f: Finding) => f.severity === 'critical' || f.severity === 'major').length} minor items hidden
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=PipelineUI | inputs=Props | outputs=JSX
