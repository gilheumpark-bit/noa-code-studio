"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useMemo } from "react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import {
  XCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";

interface ProblemFinding {
  severity: "critical" | "major" | "minor" | "info";
  message: string;
  line?: number;
  team?: string;
}

interface ProblemsPanelProps {
  findings: ProblemFinding[];
}

export type { ProblemsPanelProps, ProblemFinding };

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ProblemFinding,ProblemsPanelProps

// ============================================================
// PART 2 — Severity Helpers
// ============================================================

function severityIcon(severity: ProblemFinding["severity"]) {
  switch (severity) {
    case "critical":
      return <XCircle size={10} className="text-red-400 shrink-0" />;
    case "major":
      return <AlertTriangle size={10} className="text-accent-amber shrink-0" />;
    case "minor":
      return <Info size={10} className="text-blue-400 shrink-0" />;
    case "info":
      return <CheckCircle2 size={10} className="text-green-400 shrink-0" />;
  }
}

const SEVERITY_ORDER: Record<ProblemFinding["severity"], number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

const TEAM_LOCALE: Record<string, {ko:string, en:string, ja:string, zh:string}> = {
  teamSimulation: { ko: "시뮬레이션", en: "Simulation", ja: "シミュレーション", zh: "模拟" },
  teamGeneration: { ko: "생성", en: "Generation", ja: "生成", zh: "生成" },
  teamValidation: { ko: "검증", en: "Validation", ja: "検証", zh: "验证" },
  teamSizeDensity: { ko: "크기/밀도", en: "Size/Density", ja: "サイズ/密度", zh: "大小/密度" },
  teamAssetTrace: { ko: "자산 추적", en: "Asset Trace", ja: "資産追跡", zh: "资产追踪" },
  teamStability: { ko: "안정성", en: "Stability", ja: "安定性", zh: "稳定性" },
  teamReleaseIp: { ko: "릴리스/IP", en: "Release/IP", ja: "リリース/IP", zh: "发布/IP" },
  teamGovernance: { ko: "거버넌스", en: "Governance", ja: "ガバナンス", zh: "治理" }
};

// IDENTITY_SEAL: PART-2 | role=SeverityHelpers | inputs=severity | outputs=icon,order,teamLocale

// ============================================================
// PART 3 — ProblemsPanel Component
// ============================================================

export function ProblemsPanel({ findings }: ProblemsPanelProps) {
  const { lang } = useLang();
  
  const sorted = useMemo(
    () =>
      [...findings].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
      ),
    [findings],
  );

  const counts = useMemo(() => {
    const c = { critical: 0, major: 0, minor: 0, info: 0 };
    for (const f of findings) {
      c[f.severity]++;
    }
    return c;
  }, [findings]);

  return (
    <div className="h-40 border-t border-white/[0.08] bg-[#0d1220] flex flex-col overflow-hidden">
      {/* Header with count summary */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/[0.08] text-[10px]">
        <span className="font-semibold text-xs text-text-primary">
          {L4(lang, { ko: "문제", en: "Problems", ja: "問題", zh: "问题" })}
        </span>
        {counts.critical > 0 && (
          <span className="flex items-center gap-0.5 text-red-400">
            <XCircle size={10} /> {counts.critical}
          </span>
        )}
        {counts.major > 0 && (
          <span className="flex items-center gap-0.5 text-accent-amber">
            <AlertTriangle size={10} /> {counts.major}
          </span>
        )}
        {counts.minor > 0 && (
          <span className="flex items-center gap-0.5 text-blue-400">
            <Info size={10} /> {counts.minor}
          </span>
        )}
        {counts.info > 0 && (
          <span className="flex items-center gap-0.5 text-green-400">
            <CheckCircle2 size={10} /> {counts.info}
          </span>
        )}
      </div>

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto text-xs">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1.5">
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-green-400 text-xs font-medium">
              {L4(lang, { 
                ko: "문제 없음 — 모든 검사 통과", 
                en: "No problems — all checks passed", 
                ja: "問題なし — すべての検査に合格しました", 
                zh: "没有问题 — 所有检查通过" 
              })}
            </span>
          </div>
        ) : (
          <div role="list">
            {sorted.map((f, i) => (
              <div
                key={i}
                role="listitem"
                className="flex items-center gap-2 px-3 py-1 hover:bg-white/5 transition-colors"
              >
                {severityIcon(f.severity)}
                <span className="flex-1 truncate text-text-primary">
                  {f.message}
                </span>
                {f.line != null && (
                  <span className="text-text-secondary shrink-0">
                    L{f.line}
                  </span>
                )}
                {f.team && (
                  <span className="text-[9px] text-text-secondary shrink-0">
                    {TEAM_LOCALE[f.team] ? L4(lang, TEAM_LOCALE[f.team]) : f.team}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=ProblemsPanel | inputs=ProblemsPanelProps | outputs=JSX
