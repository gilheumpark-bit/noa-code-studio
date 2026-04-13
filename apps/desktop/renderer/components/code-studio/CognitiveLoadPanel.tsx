// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { Brain, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  analyzeCognitiveLoad,
  type CognitiveLoadResult,
  type FunctionMetrics,
} from '@noa/quill-engine/pipeline/cognitive-load';

interface Props {
  code?: string;
}

// ============================================================
// PART 2 — Bar Chart Component
// ============================================================

function LoadBar({ fn }: { fn: FunctionMetrics }) {
  const colorClass =
    fn.level === 'critical' ? 'bg-red-500'
      : fn.level === 'warning' ? 'bg-amber-500'
        : 'bg-emerald-500';

  const iconEl =
    fn.level === 'critical' ? <XCircle className="w-3 h-3 text-text-danger shrink-0" />
      : fn.level === 'warning' ? <AlertTriangle className="w-3 h-3 text-accent-amber shrink-0" />
        : <CheckCircle className="w-3 h-3 text-accent-green shrink-0" />;

  return (
    <div className="group px-3 py-1.5 hover:bg-bg-tertiary transition-colors">
      <div className="flex items-center gap-1.5 text-xs">
        {iconEl}
        <span className="truncate flex-1 font-mono text-text-primary">{fn.name}</span>
        <span className="text-text-secondary shrink-0">{fn.score}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${Math.min(fn.score, 100)}%` }}
        />
      </div>
      <div className="hidden group-hover:flex mt-1 gap-2 text-xs text-text-secondary flex-wrap">
        <span>Lines: {fn.lineCount}</span>
        <span>Nest: {fn.nestingDepth}</span>
        <span>Params: {fn.parameterCount}</span>
        <span>CC: {fn.cyclomaticComplexity}</span>
        <span>L{fn.startLine}-{fn.endLine}</span>
      </div>
    </div>
  );
}

// ============================================================
// PART 3 — Main Component
// ============================================================

export function CognitiveLoadPanel({ code }: Props) {
  const [manualCode, setManualCode] = useState('');
  const activeCode = code ?? manualCode;

  const result: CognitiveLoadResult | null = useMemo(() => {
    if (!activeCode.trim()) return null;
    return analyzeCognitiveLoad(activeCode);
  }, [activeCode]);

  const overallColor =
    !result ? 'text-text-secondary'
      : result.level === 'critical' ? 'text-text-danger'
        : result.level === 'warning' ? 'text-accent-amber'
          : 'text-accent-green';

  const handlePaste = useCallback(() => {
    void navigator.clipboard.readText().then((t) => setManualCode(t));
  }, []);

  return (
    <div className="flex flex-col h-full text-text-primary text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Brain className="w-4 h-4 text-accent-purple" />
        <span className="font-semibold flex-1">Cognitive Load</span>
        {result && (
          <span className={`text-xs font-mono font-bold ${overallColor}`}>
            {result.overallScore}/100
          </span>
        )}
      </div>

      {/* No code fallback */}
      {!activeCode.trim() && (
        <div className="p-3 space-y-2">
          <p className="text-text-secondary text-xs">Open a file or paste code to analyze.</p>
          <button
            onClick={handlePaste}
            className="px-2 py-1 rounded bg-bg-tertiary border border-border text-xs hover:bg-bg-primary transition-colors focus-visible:ring-2 ring-accent-blue"
          >
            Paste from clipboard
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs text-text-secondary">{result.summary}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {result.functions.length === 0 && (
              <p className="text-text-secondary text-xs p-3">No functions detected.</p>
            )}
            {result.functions
              .sort((a, b) => b.score - a.score)
              .map((fn) => (
                <LoadBar key={`${fn.name}-${fn.startLine}`} fn={fn} />
              ))}
          </div>

          {/* Legend */}
          <div className="px-3 py-1.5 border-t border-border flex gap-3 text-xs text-text-secondary">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> &lt;70</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 70-84</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> 85+</span>
          </div>
        </>
      )}
    </div>
  );
}

// IDENTITY_SEAL: CognitiveLoadPanel | role=PanelUI | inputs=cognitive-load.ts | outputs=BarChartUI
