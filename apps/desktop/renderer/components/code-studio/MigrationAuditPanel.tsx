"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback } from 'react';
import { GitCompare, CheckCircle, XCircle, AlertTriangle, Plus } from 'lucide-react';
import {
  auditMigration,
  type MigrationAuditResult,
  type FunctionSignature,
} from '@noa/quill-engine/pipeline/migration-audit';

// ============================================================
// PART 2 — Signature Display
// ============================================================

function SigBadge({ sig, variant }: { sig: FunctionSignature; variant: 'lost' | 'new' | 'matched' }) {
  const color =
    variant === 'lost' ? 'text-text-danger bg-red-500/10 border-red-500/30'
      : variant === 'new' ? 'text-accent-blue bg-accent-blue/10 border-accent-blue/30'
        : 'text-accent-green bg-accent-green/10 border-accent-green/30';

  return (
    <div className={`px-2 py-1 rounded border text-xs font-mono ${color}`}>
      <span className="font-semibold">{sig.name}</span>
      <span className="text-text-secondary ml-1">({sig.params || 'void'})</span>
      {sig.isExported && <span className="ml-1 text-text-tertiary">[export]</span>}
      {sig.isAsync && <span className="ml-1 text-text-tertiary">[async]</span>}
      <span className="ml-1 text-text-tertiary">L{sig.lineNumber}</span>
    </div>
  );
}

// ============================================================
// PART 3 — Main Component
// ============================================================

export function MigrationAuditPanel() {
  const [original, setOriginal] = useState('');
  const [migrated, setMigrated] = useState('');
  const [result, setResult] = useState<MigrationAuditResult | null>(null);

  const handleAudit = useCallback(() => {
    if (!original.trim() || !migrated.trim()) return;
    setResult(auditMigration(original, migrated));
  }, [original, migrated]);

  const handlePasteOriginal = useCallback(() => {
    void navigator.clipboard.readText().then((t) => setOriginal(t));
  }, []);

  const handlePasteMigrated = useCallback(() => {
    void navigator.clipboard.readText().then((t) => setMigrated(t));
  }, []);

  const rateColor = !result ? '' :
    result.matchRate >= 90 ? 'text-accent-green' :
      result.matchRate >= 70 ? 'text-accent-amber' : 'text-text-danger';

  return (
    <div className="flex flex-col h-full text-text-primary text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <GitCompare className="w-4 h-4 text-accent-purple" />
        <span className="font-semibold flex-1">Migration Audit</span>
        {result && (
          <span className={`text-xs font-bold ${rateColor}`}>
            {result.matchRate}% matched
          </span>
        )}
      </div>

      {/* Input panes */}
      <div className="grid grid-rows-2 gap-0 border-b border-border" style={{ height: result ? '200px' : '300px' }}>
        <div className="flex flex-col border-b border-border">
          <div className="flex items-center justify-between px-3 py-1 bg-bg-tertiary">
            <span className="text-xs text-text-secondary font-semibold">Original Code</span>
            <button onClick={handlePasteOriginal} className="text-xs text-accent-blue hover:underline focus-visible:ring-2 ring-accent-blue rounded px-1">
              Paste
            </button>
          </div>
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            placeholder="Paste original code here..."
            className="flex-1 px-2 py-1 bg-bg-primary text-text-primary text-xs font-mono resize-none focus-visible:ring-2 ring-accent-blue"
          />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-1 bg-bg-tertiary">
            <span className="text-xs text-text-secondary font-semibold">Migrated Code</span>
            <button onClick={handlePasteMigrated} className="text-xs text-accent-blue hover:underline focus-visible:ring-2 ring-accent-blue rounded px-1">
              Paste
            </button>
          </div>
          <textarea
            value={migrated}
            onChange={(e) => setMigrated(e.target.value)}
            placeholder="Paste migrated code here..."
            className="flex-1 px-2 py-1 bg-bg-primary text-text-primary text-xs font-mono resize-none focus-visible:ring-2 ring-accent-blue"
          />
        </div>
      </div>

      {/* Audit button */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={handleAudit}
          disabled={!original.trim() || !migrated.trim()}
          className="w-full py-1.5 rounded bg-accent-purple text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus-visible:ring-2 ring-accent-blue"
        >
          Run Migration Audit
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="flex-1 overflow-y-auto">
          {/* Summary */}
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs text-text-secondary">{result.summary}</p>
          </div>

          {/* Lost functions */}
          {result.lostFunctions.length > 0 && (
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-text-danger flex items-center gap-1 mb-1.5">
                <XCircle className="w-3 h-3" /> Lost Functions ({result.lostFunctions.length})
              </p>
              <div className="space-y-1">
                {result.lostFunctions.map((sig) => (
                  <SigBadge key={`${sig.name}-${sig.lineNumber}`} sig={sig} variant="lost" />
                ))}
              </div>
            </div>
          )}

          {/* New functions */}
          {result.newFunctions.length > 0 && (
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-accent-blue flex items-center gap-1 mb-1.5">
                <Plus className="w-3 h-3" /> New Functions ({result.newFunctions.length})
              </p>
              <div className="space-y-1">
                {result.newFunctions.map((sig) => (
                  <SigBadge key={`${sig.name}-${sig.lineNumber}`} sig={sig} variant="new" />
                ))}
              </div>
            </div>
          )}

          {/* Matched */}
          {result.matched.length > 0 && (
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-accent-green flex items-center gap-1 mb-1.5">
                <CheckCircle className="w-3 h-3" /> Matched ({result.matched.length})
              </p>
              <div className="space-y-1.5">
                {result.matched.map((m) => (
                  <div key={m.original.name} className="flex items-center gap-1 text-xs">
                    <span className="font-mono text-text-primary">{m.original.name}</span>
                    <span className="text-text-tertiary">→</span>
                    <span className="font-mono text-text-primary">{m.migrated.name}</span>
                    <span className={`ml-auto ${m.confidence >= 90 ? 'text-accent-green' : 'text-accent-amber'}`}>
                      {m.confidence}%
                    </span>
                    {!m.paramMatch && <AlertTriangle className="w-3 h-3 text-accent-amber" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: MigrationAuditPanel | role=PanelUI | inputs=migration-audit.ts | outputs=TwoPaneDiffUI
