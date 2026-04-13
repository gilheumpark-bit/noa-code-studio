// @ts-nocheck
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useLang } from '@/lib/LangContext';
import type { AuditReport, AuditCategoryResult, AuditAreaResult, AuditSeverity } from '@noa/quill-engine/audit/audit-types';
import { AUDIT_AREA_LABELS, CATEGORY_LABELS } from '@noa/quill-engine/audit/audit-types';
import { ScoreBar } from '@/components/code-studio/ui/ProgressBar';

// ============================================================
// PART 1 — Types & Constants
// ============================================================

interface AuditPanelProps {
  files: { path: string; content: string; language: string }[];
  onRunAudit?: () => void;
  auditResult?: AuditReport | null;
  isRunning?: boolean;
  progress?: { area: string; index: number; total: number } | null;
}

const SEVERITY_ICONS: Record<AuditSeverity, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪',
};

const GRADE_COLORS: Record<string, string> = {
  S: 'text-accent-amber', A: 'text-accent-green', B: 'text-accent-blue',
  C: 'text-accent-amber', D: 'text-accent-red', F: 'text-accent-red',
};

type ViewTab = 'overview' | 'details' | 'urgent';

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=Props,constants

// ============================================================
// PART 2 — Category Card
// ============================================================

function CategoryCard({ cat, lang, onSelectArea }: { cat: AuditCategoryResult; lang: string; onSelectArea: (area: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const catLabel = lang === 'ko' ? CATEGORY_LABELS[cat.category]?.ko : CATEGORY_LABELS[cat.category]?.en;

  return (
    <div className="border border-white/8 rounded-lg p-3 bg-white/[0.02]">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[12px] font-semibold text-text-primary">{catLabel}</span>
        <span className={`text-[13px] font-mono font-bold ${GRADE_COLORS[cat.grade] ?? ''}`}>
          {cat.score}/100
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-0.5">
          {cat.areas.map(area => {
            const areaLabel = lang === 'ko' ? AUDIT_AREA_LABELS[area.area]?.ko : AUDIT_AREA_LABELS[area.area]?.en;
            return (
              <button
                key={area.area}
                className="w-full text-left hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
                onClick={() => onSelectArea(area.area)}
              >
                <ScoreBar score={area.score} grade={area.grade} label={areaLabel ?? area.area} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=category-card | inputs=AuditCategoryResult | outputs=JSX

// ============================================================
// PART 4 — Area Detail View
// ============================================================

function AreaDetail({ area, lang }: { area: AuditAreaResult; lang: string }) {
  const areaLabel = lang === 'ko' ? AUDIT_AREA_LABELS[area.area]?.ko : AUDIT_AREA_LABELS[area.area]?.en;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-text-primary">{areaLabel}</h3>
        <span className={`text-[14px] font-mono font-bold ${GRADE_COLORS[area.grade] ?? ''}`}>
          {area.score}/100 ({area.grade})
        </span>
      </div>
      <div className="text-[10px] text-text-tertiary">
        {area.passed}/{area.checks} {lang === 'ko' ? '통과' : 'passed'}
        {area.metrics && (
          <span className="ml-2">
            {Object.entries(area.metrics).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </span>
        )}
      </div>
      {area.findings.length > 0 && (
        <div className="space-y-1 mt-2 max-h-[300px] overflow-y-auto">
          {area.findings.map(f => (
            <div key={f.id} className="flex items-start gap-1.5 text-[10px] py-1 border-b border-white/5">
              <span className="shrink-0">{SEVERITY_ICONS[f.severity]}</span>
              <div className="min-w-0">
                <span className="text-text-primary">{f.message}</span>
                {f.file && (
                  <span className="text-text-tertiary ml-1">({f.file.split('/').pop()}{f.line ? `:${f.line}` : ''})</span>
                )}
                {f.suggestion && (
                  <div className="text-accent-green mt-0.5">→ {f.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {area.findings.length === 0 && (
        <div className="text-[10px] text-accent-green py-2">{lang === 'ko' ? '이슈 없음' : 'No issues found'}</div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=area-detail | inputs=AuditAreaResult | outputs=JSX

// ============================================================
// PART 5 — Main Panel Component
// ============================================================

export function AuditPanel({ files, onRunAudit, auditResult, isRunning, progress }: AuditPanelProps) {
  const { lang } = useLang();
  const [tab, setTab] = useState<ViewTab>('overview');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const handleSelectArea = useCallback((area: string) => {
    setSelectedArea(area);
    setTab('details');
  }, []);

  const selectedAreaData = useMemo(() => {
    if (!auditResult || !selectedArea) return null;
    return auditResult.areas.find(a => a.area === selectedArea) ?? null;
  }, [auditResult, selectedArea]);

  const isKo = lang === 'ko' || lang === 'ja' || lang === 'zh';

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
        <span className="text-[11px] font-mono font-semibold tracking-wider uppercase text-text-secondary">
          {isKo ? '프로젝트 감사' : 'Project Audit'}
        </span>
        <button
          className="px-2.5 py-1 text-[10px] font-mono rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors disabled:opacity-40"
          onClick={onRunAudit}
          disabled={isRunning || files.length === 0}
        >
          {isRunning
            ? `${progress ? `${progress.index}/${progress.total}` : '...'}`
            : isKo ? '감사 실행' : 'Run Audit'}
        </button>
      </div>

      {/* Progress bar */}
      {isRunning && progress && (
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-accent-green transition-all duration-300"
            style={{ width: `${(progress.index / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* No result yet */}
      {!auditResult && !isRunning && (
        <div className="flex-1 flex items-center justify-center text-[11px] text-text-tertiary">
          {isKo ? '감사 실행 버튼을 눌러 시작하세요' : 'Press Run Audit to start'}
        </div>
      )}

      {/* Result */}
      {auditResult && (
        <>
          {/* Score header */}
          <div className="px-3 py-2 border-b border-white/8 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-[22px] font-mono font-bold ${GRADE_COLORS[auditResult.totalGrade] ?? ''}`}>
                  {auditResult.totalScore}
                </span>
                <span className="text-[11px] text-text-tertiary">/100</span>
                <span className={`ml-2 text-[14px] font-bold ${GRADE_COLORS[auditResult.totalGrade] ?? ''}`}>
                  {auditResult.totalGrade}
                </span>
              </div>
              {auditResult.hardGateFail && (
                <span className="px-2 py-0.5 text-[9px] font-mono bg-red-500/20 text-red-400 rounded">
                  HARD GATE FAIL
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-1 text-[9px] text-text-tertiary">
              <span>🔴 {auditResult.findingsBySeverity.critical}</span>
              <span>🟠 {auditResult.findingsBySeverity.high}</span>
              <span>🟡 {auditResult.findingsBySeverity.medium}</span>
              <span>🔵 {auditResult.findingsBySeverity.low}</span>
              <span className="ml-auto">{auditResult.duration}ms</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/8">
            {(['overview', 'details', 'urgent'] as ViewTab[]).map(t => (
              <button
                key={t}
                className={`flex-1 py-1.5 text-[10px] font-mono transition-colors ${tab === t ? 'text-accent-green border-b-2 border-accent-green' : 'text-text-tertiary hover:text-text-secondary'}`}
                onClick={() => setTab(t)}
              >
                {t === 'overview' ? (isKo ? '개요' : 'Overview') : t === 'details' ? (isKo ? '상세' : 'Details') : (isKo ? '시급' : 'Urgent')}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {tab === 'overview' && (
              <div className="space-y-2">
                {auditResult.categories.map(cat => (
                  <CategoryCard key={cat.category} cat={cat} lang={isKo ? 'ko' : 'en'} onSelectArea={handleSelectArea} />
                ))}
              </div>
            )}

            {tab === 'details' && (
              <div className="space-y-3">
                {selectedAreaData ? (
                  <AreaDetail area={selectedAreaData} lang={isKo ? 'ko' : 'en'} />
                ) : (
                  <div className="space-y-2">
                    {auditResult.areas.map(area => (
                      <button
                        key={area.area}
                        className="w-full text-left hover:bg-white/5 rounded px-2 py-1 transition-colors"
                        onClick={() => setSelectedArea(area.area)}
                      >
                        <ScoreBar
                          score={area.score}
                          grade={area.grade}
                          label={(isKo ? AUDIT_AREA_LABELS[area.area]?.ko : AUDIT_AREA_LABELS[area.area]?.en) ?? area.area}
                        />
                      </button>
                    ))}
                  </div>
                )}
                {selectedAreaData && (
                  <button
                    className="text-[10px] text-text-tertiary hover:text-text-secondary"
                    onClick={() => setSelectedArea(null)}
                  >
                    ← {isKo ? '전체 목록' : 'All areas'}
                  </button>
                )}
              </div>
            )}

            {tab === 'urgent' && (
              <div className="space-y-1">
                {auditResult.urgent.map(item => (
                  <div key={item.rank} className="flex items-start gap-2 py-1.5 border-b border-white/5">
                    <span className="text-[10px] font-mono text-text-tertiary w-5 text-right shrink-0">{item.rank}.</span>
                    <span className="shrink-0">{SEVERITY_ICONS[item.severity]}</span>
                    <div className="min-w-0 text-[10px]">
                      <span className="text-text-primary">{item.message}</span>
                      <span className="text-text-tertiary ml-1 text-[9px]">[{(isKo ? AUDIT_AREA_LABELS[item.area]?.ko : item.area) ?? item.area}]</span>
                      {item.file && <span className="text-text-tertiary ml-1">({item.file.split('/').pop()})</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AuditPanel;

// IDENTITY_SEAL: PART-5 | role=main-panel | inputs=AuditPanelProps | outputs=JSX
