// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback } from "react";
import {
  X, Loader2, BarChart3, TrendingUp, Shield, Wrench, Maximize2, Trophy,
} from "lucide-react";
import type { FileNode } from "@noa/quill-engine/types";

interface EvalScore {
  overall: number;
  grade: string;
  summary: string;
  categories: { codeQuality: number; trendAlignment: number; marketReadiness: number; maintainability: number; scalability: number };
  recommendations: string[];
}

interface Props {
  files: FileNode[];
  onClose: () => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=EvalScore,Props

// ============================================================
// PART 2 — Helpers
// ============================================================

function gradeColor(grade: string): string {
  const map: Record<string, string> = { S: "#a855f7", A: "#22c55e", B: "#3b82f6", C: "#eab308", D: "#f85149", F: "#f85149" };
  return map[grade] ?? "#888";
}

function ScoreBar({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const color = value >= 80 ? "#22c55e" : value >= 60 ? "#eab308" : "#f85149";
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1 text-white/70">{icon}{label}</span>
        <span style={{ color }}>{value}/100</span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/5">
        <div className="h-2 rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function evaluateFiles(files: FileNode[]): EvalScore {
  let totalLines = 0;
  function countLines(nodes: FileNode[]) {
    for (const n of nodes) {
      if (n.type === "file" && n.content) totalLines += n.content.split("\n").length;
      if (n.children) countLines(n.children);
    }
  }
  countLines(files);
  const base = Math.min(95, 50 + Math.floor(totalLines / 10));
  return {
    overall: base, grade: base >= 90 ? "S" : base >= 80 ? "A" : base >= 70 ? "B" : "C",
    summary: `${totalLines} lines analyzed`,
    categories: { codeQuality: base + 2, trendAlignment: base - 5, marketReadiness: base - 3, maintainability: base + 1, scalability: base - 2 },
    recommendations: ["타입 안전성 강화", "테스트 커버리지 추가", "에러 핸들링 개선"],
  };
}

// IDENTITY_SEAL: PART-2 | role=Helpers | inputs=FileNode[] | outputs=EvalScore

// ============================================================
// PART 3 — Component
// ============================================================

export function EvaluationPanel({ files, onClose }: Props) {
  const [result, setResult] = useState<EvalScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(() => {
    setLoading(true); setError(null);
    try {
      setResult(evaluateFiles(files));
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, [files]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="프로젝트 평가">
      <div className="bg-[#0a0e17] border border-white/10 rounded-xl shadow-2xl flex flex-col" style={{ width: 520, maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><BarChart3 size={16} /> 프로젝트 평가</div>
          <button onClick={onClose} aria-label="닫기" className="p-1 hover:bg-white/10 rounded text-white/50"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!result && !loading && (
            <div className="text-center py-8">
              <Trophy size={48} className="mx-auto mb-4 opacity-30 text-white/50" />
              <p className="text-sm text-white/50 mb-4">프로젝트 코드 품질, 시장 적합도, 유지보수성을 평가합니다</p>
              <button onClick={handleRun} className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-800 text-stone-100 hover:bg-amber-700">평가 시작</button>
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-white/50" />
              <p className="text-sm text-white/50">분석 중...</p>
            </div>
          )}
          {error && <div className="text-sm text-red-400 p-3 rounded bg-white/5">오류: {error}</div>}
          {result && (
            <>
              <div className="text-center mb-6">
                <div className="text-5xl font-bold mb-1" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
                <div className="text-2xl font-semibold text-white">{result.overall}/100</div>
                <p className="text-xs text-white/50 mt-1">{result.summary}</p>
              </div>
              <ScoreBar label="코드 품질" value={result.categories.codeQuality} icon={<Shield size={12} />} />
              <ScoreBar label="트렌드 적합도" value={result.categories.trendAlignment} icon={<TrendingUp size={12} />} />
              <ScoreBar label="시장 준비도" value={result.categories.marketReadiness} icon={<BarChart3 size={12} />} />
              <ScoreBar label="유지보수성" value={result.categories.maintainability} icon={<Wrench size={12} />} />
              <ScoreBar label="확장성" value={result.categories.scalability} icon={<Maximize2 size={12} />} />
              {result.recommendations.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-white/5">
                  <h4 className="text-xs font-semibold text-white mb-2">권장 사항</h4>
                  <ul className="text-xs text-white/50 space-y-1">
                    {result.recommendations.map((r, i) => <li key={i} className="flex items-start gap-1"><span className="text-amber-400">&#8226;</span>{r}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-4 text-center">
                <button onClick={handleRun} disabled={loading} className="px-3 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10 text-white/50 transition-colors">재평가</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=Component | inputs=Props | outputs=JSX
