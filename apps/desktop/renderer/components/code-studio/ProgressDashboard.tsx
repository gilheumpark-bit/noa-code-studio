"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  X, Activity, FileText, Brain, TrendingUp,
  Clock, BarChart3, Zap, Trophy, AlertTriangle,
  Loader2, Gauge, CheckCircle, XCircle
} from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import type { StressReport } from "@noa/quill-engine/pipeline/stress-test";
import type { VerificationResult } from "@noa/quill-engine/pipeline/verification-loop";

interface TeamProgress {
  name: string;
  progress: number;
  status: "pending" | "running" | "done" | "error";
  score?: number;
  estimatedMs?: number;
}

interface RecentAction {
  time: number;
  label: string;
  type: "ai" | "edit" | "pipeline" | "system";
}

interface Props {
  teams?: TeamProgress[];
  pipelineScore?: number;
  pipelineStatus?: "pass" | "warn" | "fail";
  onClose?: () => void;
  stressReport?: StressReport | null;
  onRunStress?: () => void;
  isStressTesting?: boolean;
  verificationScore?: number;
  onRunVerification?: () => void;
  isVerifying?: boolean;
  verificationResult?: VerificationResult | null;
  currentVerifyRound?: number;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=TeamProgress,Props

// ============================================================
// PART 2 — Helpers
// ============================================================

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

function loadRecentActions(): RecentAction[] {
  try {
    const raw = localStorage.getItem("eh_recent_actions");
    if (!raw) return [];
    return (JSON.parse(raw) as RecentAction[]).slice(-10).reverse();
  } catch { return []; }
}

function useTimeAgo() {
  return (ts: number): string => {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };
}

function loadSessionStats(): { fileEdits: number; aiCalls: number; tokens: number } {
  try {
    const raw = localStorage.getItem("eh_session_stats");
    if (!raw) return { fileEdits: 0, aiCalls: 0, tokens: 0 };
    return JSON.parse(raw);
  } catch { return { fileEdits: 0, aiCalls: 0, tokens: 0 }; }
}

// IDENTITY_SEAL: PART-2 | role=Helpers | inputs=localStorage | outputs=stats

// ============================================================
// PART 3 — Sub-Components
// ============================================================

function TeamProgressBar({ team }: { team: TeamProgress }) {
  const barColor =
    team.status === "done" ? "#3fb950" :
    team.status === "running" ? "#58a6ff" :
    team.status === "error" ? "#f85149" :
    "#8b949e";

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-[10px] font-medium text-text-secondary truncate">{team.name}</span>
      <div className="flex-1 h-2 rounded-full bg-bg-tertiary/50 overflow-hidden shadow-inner">
        <div className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{
          width: `${Math.max(team.progress, 2)}%`, backgroundColor: barColor,
          boxShadow: team.status === "running" ? "0 0 8px rgba(88,166,255,0.5)" : "none"
        }} />
      </div>
      <span className="w-12 text-right text-[10px] font-mono text-text-tertiary/80">
        {team.status === "done" && team.score != null ? `${team.score}` : team.status === "running" ? `${team.progress}%` : "-"}
      </span>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-bg-tertiary/30 border border-border/20 shadow-sm hover:shadow-md transition-shadow hover:bg-bg-tertiary/50">
      <span className="text-text-tertiary mb-1.5">{icon}</span>
      <span className="text-base font-bold text-text-primary tracking-tight">{value}</span>
      <span className="text-[10px] font-medium text-text-tertiary/70 uppercase tracking-widest mt-0.5">{label}</span>
    </div>
  );
}

function ActionIcon({ type }: { type: RecentAction["type"] }) {
  switch (type) {
    case "ai": return <Brain size={12} className="text-amber-500 shrink-0" />;
    case "edit": return <FileText size={12} className="text-blue-500 shrink-0" />;
    case "pipeline": return <Zap size={12} className="text-accent-amber shrink-0" />;
    default: return <Activity size={12} className="text-text-tertiary shrink-0" />;
  }
}

// IDENTITY_SEAL: PART-3 | role=SubComponents | inputs=team,stats | outputs=JSX

// ============================================================
// PART 3.5 — Stress Test Grade Helpers
// ============================================================

const GRADE_COLOR: Record<string, string> = {
  A: "#3fb950", B: "#58a6ff", C: "#d29922", D: "#e3833a", F: "#f85149",
};

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold shadow-sm border border-black/10 dark:border-white/10"
      style={{ backgroundColor: `${GRADE_COLOR[grade] ?? "#8b949e"}22`, color: GRADE_COLOR[grade] ?? "#8b949e" }}
    >
      {grade}
    </span>
  );
}

function ScoreBar({ score, grade }: { score: number; grade: string }) {
  return (
    <div className="flex-1 h-2 rounded-full bg-bg-tertiary/50 overflow-hidden shadow-inner">
      <div
        className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ width: `${Math.max(score, 2)}%`, backgroundColor: GRADE_COLOR[grade] ?? "#8b949e" }}
      />
    </div>
  );
}

// IDENTITY_SEAL: PART-3.5 | role=StressHelpers | inputs=grade,score | outputs=JSX

// ============================================================
// PART 4 — Main Component
// ============================================================

export function ProgressDashboard({ teams, pipelineScore, pipelineStatus, onClose, stressReport, onRunStress, isStressTesting, verificationScore, onRunVerification, isVerifying, verificationResult, currentVerifyRound }: Props) {
  const { lang } = useLang();
  const timeAgo = useTimeAgo();
  const [sessionStats, setSessionStats] = useState(() => loadSessionStats());
  const [recentActions, setRecentActions] = useState<RecentAction[]>(() => loadRecentActions());

  const refresh = useCallback(() => {
    setSessionStats(loadSessionStats());
    setRecentActions(loadRecentActions());
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Compute overall pipeline progress
  const overallProgress = teams && teams.length > 0
    ? Math.round(teams.reduce((s, t) => s + t.progress, 0) / teams.length)
    : 0;
  const completedTeams = teams?.filter((t) => t.status === "done").length ?? 0;
  const totalTeams = teams?.length ?? 0;
  const runningTeams = teams?.filter((t) => t.status === "running").length ?? 0;

  // Estimated time remaining (simple heuristic)
  const avgEstMs = teams?.reduce((s, t) => s + (t.estimatedMs ?? 0), 0) ?? 0;
  const etaMs = runningTeams > 0 ? Math.round(avgEstMs / runningTeams * (1 - overallProgress / 100)) : 0;

  return (
    <div className="h-full flex flex-col bg-bg-secondary/40 backdrop-blur-xl border-l border-border/40 overflow-hidden shadow-inner" style={{ minWidth: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-bg-primary/30">
        <span className="flex items-center gap-2.5 text-sm font-semibold text-text-primary tracking-tight">
          <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
            <Activity size={14} className="text-blue-500" />
          </div>
          {L4(lang, { ko: "진행 대시보드", en: "Progress Dashboard" })}
        </span>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-bg-tertiary/60 text-text-tertiary hover:text-text-primary transition-colors" title={L4(lang, { ko: "닫기", en: "Close" })} aria-label={L4(lang, { ko: "닫기", en: "Close" })}><X size={14} /></button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs custom-scrollbar">

        {/* Overall Progress */}
        {teams && teams.length > 0 && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 font-semibold text-text-primary">
              <BarChart3 size={14} className="text-amber-500" /> {L4(lang, { ko: "파이프라인 진행", en: "Pipeline Progress" })}
            </h3>
            <div className="space-y-1.5 mb-3 bg-bg-primary/40 rounded-xl p-3 border border-border/30 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-medium text-text-secondary">
                <span>{completedTeams} / {totalTeams} teams</span>
                <span className="font-mono">{overallProgress}%</span>
              </div>
              <div className="h-2 bg-bg-tertiary/50 rounded-full overflow-hidden shadow-inner">
                <div className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" style={{ width: `${overallProgress}%` }} />
              </div>
              {etaMs > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary font-mono pt-1">
                  <Clock size={10} /> Est: {Math.round(etaMs / 1000)}s
                </div>
              )}
            </div>
            <div className="space-y-2 px-1">
              {teams.map((team) => <TeamProgressBar key={team.name} team={team} />)}
            </div>
          </section>
        )}

        {/* Pipeline Score */}
        {pipelineScore != null && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 font-semibold text-text-primary">
              <TrendingUp size={14} className="text-green-500" /> {L4(lang, { ko: "코드 품질", en: "Code Quality" })}
            </h3>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-bg-primary/40 border border-border/30 shadow-sm">
              <div className="text-center shrink-0">
                <div className="text-2xl font-bold font-mono tracking-tighter" style={{
                  color: pipelineScore >= 80 ? "#3fb950" : pipelineScore >= 60 ? "#d29922" : "#f85149",
                }}>{pipelineScore}</div>
                <div className="text-[10px] font-medium tracking-widest uppercase text-text-tertiary/70 mt-0.5">Score</div>
              </div>
              <div className="flex-1 mt-1">
                <div className="h-2.5 bg-bg-tertiary/50 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full rounded-full transition-all duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{
                    width: `${pipelineScore}%`,
                    backgroundColor: pipelineScore >= 80 ? "#3fb950" : pipelineScore >= 60 ? "#d29922" : "#f85149",
                  }} />
                </div>
                {pipelineStatus && (
                  <div className="text-[10px] uppercase font-bold tracking-widest mt-2 flex items-center justify-end" style={{
                    color: pipelineScore >= 80 ? "#3fb950" : pipelineScore >= 60 ? "#d29922" : "#f85149",
                  }}>STATUS: {pipelineStatus}</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Session Stats */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-text-primary">
            <Zap size={14} className="text-accent-amber" /> {L4(lang, { ko: "세션 통계", en: "Session Stats" })}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={L4(lang, { ko: "파일 편집", en: "File Edits" })} value={`${sessionStats.fileEdits}`} icon={<FileText size={14} className="text-blue-500" />} />
            <StatCard label={L4(lang, { ko: "LLM 호출", en: "LLM Calls" })} value={`${sessionStats.aiCalls}`} icon={<Brain size={14} className="text-purple-500" />} />
            <StatCard label={L4(lang, { ko: "토큰", en: "Tokens" })} value={formatTokens(sessionStats.tokens)} icon={<Trophy size={14} className="text-amber-500" />} />
          </div>
        </section>

        {/* Recent Activity */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-text-primary">
            <Clock size={14} className="text-text-tertiary" /> {L4(lang, { ko: "최근 활동", en: "Recent Activity" })}
          </h3>
          <div className="space-y-1.5 p-1">
            {recentActions.length === 0 ? (
              <div className="text-text-tertiary/70 text-center py-6 bg-bg-primary/20 rounded-xl border border-border/20">{L4(lang, { ko: "최근 활동 없음", en: "No recent activity" })}</div>
            ) : (
              recentActions.map((action, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-bg-tertiary/40 transition-colors">
                  <div className="w-6 h-6 rounded-full bg-bg-primary/50 flex items-center justify-center shadow-sm">
                    <ActionIcon type={action.type} />
                  </div>
                  <span className="flex-1 truncate text-text-secondary">{action.label}</span>
                  <span className="text-[10px] text-text-tertiary/60 whitespace-nowrap font-medium">{timeAgo(action.time)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Engine-Predicted Performance Analysis */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-text-primary">
            <Gauge size={14} className="text-orange-500" /> {L4(lang, { ko: "엔진 예측 성능", en: "Engine-Predicted Performance" })}
          </h3>

          {onRunStress && (
            <button
              onClick={onRunStress}
              disabled={isStressTesting}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold transition-all bg-bg-tertiary/50 border border-border/30 hover:bg-bg-tertiary hover:border-text-tertiary/30 text-text-primary disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]"
            >
              {isStressTesting ? (
                <><Loader2 size={14} className="animate-spin" /> Running Stress Test...</>
              ) : (
                <><Zap size={14} className="text-orange-500" /> Run Stress Test</>
              )}
            </button>
          )}

          {stressReport ? (
            <div className="space-y-3 bg-bg-primary/30 p-3.5 rounded-2xl border border-border/30 shadow-inner mt-3">
              {/* Overall score */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-bg-tertiary/20 shadow-sm border border-border/10">
                <div className="text-center shrink-0">
                  <div className="text-2xl font-bold font-mono" style={{ color: GRADE_COLOR[stressReport.grade] }}>
                    {stressReport.grade}
                  </div>
                  <div className="text-[10px] font-medium tracking-widest uppercase text-text-tertiary/70 mt-0.5">Grade</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[11px] font-medium text-text-secondary mb-2">
                    <span>Overall Score</span>
                    <span className="font-mono">{stressReport.overallScore}/100</span>
                  </div>
                  <ScoreBar score={stressReport.overallScore} grade={stressReport.grade} />
                </div>
              </div>

              {/* Per-scenario breakdown */}
              <div className="space-y-2.5 px-1 py-1">
                {stressReport.scenarios.map((r) => {
                  const score = r.grade === "A" ? 100 : r.grade === "B" ? 80 : r.grade === "C" ? 60 : r.grade === "D" ? 40 : 20;
                  return (
                    <div key={r.scenario.id} className="flex items-center gap-3">
                      <span className="w-28 text-[11px] font-medium text-text-secondary truncate" title={`${r.scenario.name} (${r.scenario.virtualUsers}u)`}>
                        {r.scenario.name} <span className="text-[9px] text-text-tertiary ml-1">({r.scenario.virtualUsers}u)</span>
                      </span>
                      <ScoreBar score={score} grade={r.grade} />
                      <GradeBadge grade={r.grade} />
                    </div>
                  );
                })}
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 pt-2 pb-1 text-[10px] text-text-tertiary/80 border-t border-border/20">
                <AlertTriangle size={12} className="shrink-0 mt-px text-accent-amber" />
                <span className="leading-relaxed">Engine-Predicted heuristic estimates — not based on real load test results.</span>
              </div>
            </div>
          ) : !isStressTesting ? (
            <div className="text-text-tertiary/60 text-center py-6 bg-bg-primary/10 rounded-xl border border-dashed border-border/30 text-[11px] mt-3">
              Run a stress test to see predicted performance
            </div>
          ) : null}
        </section>

        {/* Full Verification */}
        <section className="rounded-2xl border border-accent-purple/20 bg-accent-purple/[0.03] p-4 space-y-4 shadow-sm relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-purple/10 via-accent-purple/30 to-accent-purple/10"></div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-accent-purple/20 text-accent-purple shadow-sm">
                <Trophy size={16} />
              </div>
              <h3 className="text-[13px] font-semibold text-text-primary tracking-tight">Full Verification</h3>
            </div>
            <button
              onClick={onRunVerification}
              disabled={isVerifying}
              className="flex items-center gap-1.5 rounded-xl border border-accent-purple/40 bg-accent-purple/15 px-3 py-1.5 text-xs font-medium text-accent-purple hover:bg-accent-purple/30 active:scale-95 transition-all shadow-sm disabled:opacity-40"
            >
              {isVerifying ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {isVerifying ? "Verifying..." : "Run All Checks"}
            </button>
          </div>

          {verificationScore != null && (
            <div className="space-y-3 bg-bg-secondary/40 p-3 rounded-xl border border-border/20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-text-tertiary tracking-tight">Pipeline + Bugs + Stress</span>
                <div className="flex items-center gap-2">
                  <GradeBadge grade={verificationScore >= 77 ? "A" : verificationScore >= 60 ? "B" : verificationScore >= 40 ? "C" : "F"} />
                  <span className="text-lg font-bold font-mono tracking-tighter" style={{ color: verificationScore >= 77 ? "#3fb950" : verificationScore >= 60 ? "#d29922" : "#f85149" }}>{verificationScore}</span>
                </div>
              </div>
              <ScoreBar score={verificationScore} grade={verificationScore >= 77 ? "A" : verificationScore >= 60 ? "C" : "F"} />
              <div className="flex items-center gap-1.5 text-[10px] font-medium pt-1">
                {verificationScore >= 77 ? (
                  <><CheckCircle size={12} className="text-green-500" /> <span className="text-green-500">PASS — Safe to deploy</span></>
                ) : verificationScore >= 60 ? (
                  <><AlertTriangle size={12} className="text-amber-500" /> <span className="text-amber-500">WARN — Review before deploy</span></>
                ) : (
                  <><XCircle size={12} className="text-red-500" /> <span className="text-red-500">FAIL — Critical issues found</span></>
                )}
              </div>
            </div>
          )}

          {/* Verification Loop Details */}
          {isVerifying && currentVerifyRound != null && currentVerifyRound > 0 && (
            <div className="flex items-center justify-center gap-2 py-2 px-3 bg-accent-purple/5 rounded-lg border border-accent-purple/10">
              <Loader2 size={14} className="animate-spin text-accent-purple" />
              <span className="text-[11px] font-medium text-text-secondary">Round {currentVerifyRound}/3 — Auto-fixing bugs...</span>
            </div>
          )}

          {verificationResult && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="flex flex-col items-center bg-bg-primary/40 rounded-lg p-2 border border-border/20 shadow-sm">
                <span className="text-[15px] font-bold text-text-primary mb-0.5">{verificationResult.iterations.length}</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider">Rounds</span>
              </div>
              <div className="flex flex-col items-center bg-bg-primary/40 rounded-lg p-2 border border-border/20 shadow-sm">
                <span className="text-[15px] font-bold text-text-primary mb-0.5">{verificationResult.totalFixesApplied}</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider">Fixes</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-bg-primary/40 rounded-lg p-2 border border-border/20 shadow-sm">
                <span className="text-[10px] font-semibold text-text-secondary text-center px-1 leading-snug break-words">
                  {verificationResult.scoreDelta > 0 && <span className="text-green-500 mr-1">+{verificationResult.scoreDelta}</span>}
                  {verificationResult.stopReason.replace("completed", "Done")}
                </span>
              </div>
            </div>
          )}
          {verificationResult && verificationResult.hardGateFailures.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 mt-2 bg-red-500/10 rounded-lg border border-red-500/20 shadow-sm">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-red-500 mb-0.5">HARD GATE FAILED</span>
                <span className="text-[10px] text-red-400/90 leading-tight">{verificationResult.hardGateFailures.join(", ")}</span>
              </div>
            </div>
          )}

          {verificationScore == null && !isVerifying && !verificationResult && (
            <div className="text-text-tertiary/60 text-center py-5 bg-bg-primary/20 rounded-xl border border-dashed border-border/20 text-[11px] font-medium mt-2">
              Combined verification across pipeline,<br/>bug scan, and stress tests
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=DashboardUI | inputs=Props | outputs=JSX
