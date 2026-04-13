// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { BarChart3, AlertTriangle, Info } from 'lucide-react';
import {
  analyzeCodeRhythm,
  type CodeRhythmResult,
  type RhythmSection,
  type CodeLineType,
} from '@noa/quill-engine/pipeline/code-rhythm';

interface Props {
  code?: string;
}

// ============================================================
// PART 2 — Density Bar
// ============================================================

const TYPE_COLORS: Record<CodeLineType, string> = {
  import: 'bg-accent-blue',
  type: 'bg-accent-purple',
  logic: 'bg-accent-amber',
  comment: 'bg-accent-green',
  blank: 'bg-bg-tertiary',
  return: 'bg-orange-400',
  decorator: 'bg-pink-400',
  'block-boundary': 'bg-bg-secondary',
};

function SectionBar({ section }: { section: RhythmSection }) {
  const _total = section.endLine - section.startLine + 1;
  const densityColor =
    section.density >= 90 ? 'bg-red-500'
      : section.density >= 70 ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="group px-3 py-1 hover:bg-bg-tertiary transition-colors">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-tertiary font-mono w-14 shrink-0">
          L{section.startLine}-{section.endLine}
        </span>
        <div className="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${densityColor}`}
            style={{ width: `${section.density}%` }}
          />
        </div>
        <span className="text-text-secondary w-8 text-right">{section.density}%</span>
      </div>

      {/* Expanded breakdown on hover */}
      <div className="hidden group-hover:flex mt-1 gap-1 flex-wrap text-xs text-text-secondary">
        {(Object.entries(section.types) as [CodeLineType, number][])
          .filter(([, count]) => count > 0)
          .map(([type, count]) => (
            <span key={type} className="flex items-center gap-0.5">
              <span className={`w-2 h-2 rounded-sm ${TYPE_COLORS[type]}`} />
              {type}: {count}
            </span>
          ))}
      </div>
    </div>
  );
}

// ============================================================
// PART 3 — Main Component
// ============================================================

export function RhythmPanel({ code }: Props) {
  const [manualCode, setManualCode] = useState('');
  const activeCode = code ?? manualCode;

  const result: CodeRhythmResult | null = useMemo(() => {
    if (!activeCode.trim()) return null;
    return analyzeCodeRhythm(activeCode);
  }, [activeCode]);

  const handlePaste = useCallback(() => {
    void navigator.clipboard.readText().then((t) => setManualCode(t));
  }, []);

  return (
    <div className="flex flex-col h-full text-text-primary text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <BarChart3 className="w-4 h-4 text-accent-blue" />
        <span className="font-semibold flex-1">Code Rhythm</span>
        {result && (
          <span className="text-xs text-text-secondary">
            {result.lines.length} lines
          </span>
        )}
      </div>

      {/* No code */}
      {!activeCode.trim() && (
        <div className="p-3 space-y-2">
          <p className="text-text-secondary text-xs">Open a file or paste code to analyze rhythm.</p>
          <button
            onClick={handlePaste}
            className="px-2 py-1 rounded bg-bg-tertiary border border-border text-xs hover:bg-bg-primary transition-colors focus-visible:ring-2 ring-accent-blue"
          >
            Paste from clipboard
          </button>
        </div>
      )}

      {result && (
        <>
          {/* Summary stats */}
          <div className="px-3 py-2 border-b border-border grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="text-text-secondary">Density</div>
              <div className="font-bold text-accent-amber">{result.overallDensity}%</div>
            </div>
            <div className="text-center">
              <div className="text-text-secondary">Comments</div>
              <div className="font-bold text-accent-green">{result.commentRatio}%</div>
            </div>
            <div className="text-center">
              <div className="text-text-secondary">Blanks</div>
              <div className="font-bold text-text-primary">{result.blankRatio}%</div>
            </div>
          </div>

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="border-b border-border">
              {result.suggestions.map((s, i) => (
                <div key={i} className="px-3 py-1.5 flex items-start gap-1.5 text-xs">
                  {s.severity === 'warn'
                    ? <AlertTriangle className="w-3 h-3 text-accent-amber shrink-0 mt-0.5" />
                    : <Info className="w-3 h-3 text-accent-blue shrink-0 mt-0.5" />
                  }
                  <span className="text-text-secondary">{s.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Section bars */}
          <div className="flex-1 overflow-y-auto">
            {result.sections.map((s) => (
              <SectionBar key={s.startLine} section={s} />
            ))}
          </div>

          {/* Legend */}
          <div className="px-3 py-1.5 border-t border-border flex flex-wrap gap-2 text-xs text-text-secondary">
            {(['logic', 'import', 'type', 'comment', 'blank'] as CodeLineType[]).map((t) => (
              <span key={t} className="flex items-center gap-0.5">
                <span className={`w-2 h-2 rounded-sm ${TYPE_COLORS[t]}`} />
                {t}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// IDENTITY_SEAL: RhythmPanel | role=PanelUI | inputs=code-rhythm.ts | outputs=RhythmVisualization
