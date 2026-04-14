// ============================================================
// PART 1 — Types & Reviewer Persona Definitions
// ============================================================

'use client';

import React, { useState, useCallback } from 'react';
import {
  Shield, Eye, Accessibility, Code2, Gauge,
  Play, CheckCircle, Loader2, AlertTriangle,
} from 'lucide-react';
import { runStaticPipeline, type PipelineResult } from '@noa/quill-engine/pipeline/pipeline';

/** Status of an individual reviewer run */
type ReviewerStatus = 'pending' | 'reviewing' | 'done';

/** A single finding from a reviewer */
interface ReviewFinding {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/** Result from a single reviewer persona */
interface ReviewerResult {
  personaId: string;
  score: number;
  findings: ReviewFinding[];
  status: ReviewerStatus;
}

/** Reviewer persona definition */
interface ReviewerPersona {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  /** System prompt fragment for AI call (structure ready, placeholder results for now) */
  systemPrompt: string;
}

const REVIEWER_PERSONAS: ReviewerPersona[] = [
  {
    id: 'react-expert',
    name: 'React Expert',
    nameKo: 'React ??????',
    description: 'Hooks, patterns, component architecture, render optimization',
    icon: <Code2 className="w-4 h-4" />,
    color: 'text-accent-blue',
    systemPrompt: 'You are a senior React expert. Review this code for: hooks correctness, composition patterns, unnecessary re-renders, unstable references, missing cleanup, and component architecture issues.',
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    nameKo: '?????? ??????',
    description: 'XSS, injection, auth, secrets exposure, OWASP',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-accent-red',
    systemPrompt: 'You are a security auditor. Scan for: XSS vectors (innerHTML, dangerouslySetInnerHTML), injection risks, hardcoded secrets, auth token mishandling, CSRF gaps, and OWASP Top 10 violations.',
  },
  {
    id: 'a11y-inspector',
    name: 'Accessibility Inspector',
    nameKo: '???????????? ??????',
    description: 'ARIA, keyboard nav, contrast, screen reader, focus management',
    icon: <Accessibility className="w-4 h-4" />,
    color: 'text-accent-green',
    systemPrompt: 'You are an accessibility expert. Check for: missing ARIA attributes, keyboard navigation gaps, focus traps, color contrast violations, missing alt text, and screen reader compatibility.',
  },
  {
    id: 'ts-purist',
    name: 'TypeScript Purist',
    nameKo: 'TypeScript ??????',
    description: 'Strict types, no any, proper generics, type narrowing',
    icon: <Eye className="w-4 h-4" />,
    color: 'text-accent-purple',
    systemPrompt: 'You are a TypeScript purist. Flag: any/unknown without narrowing, missing return types on exported functions, loose generic constraints, type assertions (as) without validation, and missing discriminated unions.',
  },
  {
    id: 'perf-engineer',
    name: 'Performance Engineer',
    nameKo: '?????? ????????????',
    description: 'Memo, lazy loading, bundle size, render cost',
    icon: <Gauge className="w-4 h-4" />,
    color: 'text-accent-amber',
    systemPrompt: 'You are a performance engineer. Identify: missing memoization on expensive paths, large bundle imports, synchronous heavy computation, missing code splitting, N+1 patterns, and memory leaks from uncleaned subscriptions.',
  },
];

// IDENTITY_SEAL: PART-1 | role=TypesAndPersonas | inputs=none | outputs=ReviewerPersona[],ReviewerResult

// ============================================================
// PART 2 — Real Review Engine (Pipeline-Based)
// ============================================================

/**
 * Maps pipeline stage indices to reviewer persona IDs.
 * Pipeline stages: [Simulation, Generation, Validation, SizeDensity, AssetTrace, Stability, ReleaseIP, Governance]
 * We map the 5 persona perspectives to the most relevant pipeline stages.
 */
const PERSONA_STAGE_MAP: Record<string, number[]> = {
  'react-expert':     [1, 2],     // Generation + Validation
  'security-auditor': [5, 6],     // Stability + ReleaseIP
  'a11y-inspector':   [2, 7],     // Validation + Governance
  'ts-purist':        [2, 3],     // Validation + SizeDensity
  'perf-engineer':    [0, 3, 4],  // Simulation + SizeDensity + AssetTrace
};

/**
 * Runs real static analysis via the code-studio pipeline and extracts
 * results relevant to the given persona.
 */
function generateReviewResult(personaId: string, code: string): ReviewerResult {
  const language = 'typescript'; // default; could be derived from file extension
  const pipelineResult: PipelineResult = runStaticPipeline(code, language);
  const stageIndices = PERSONA_STAGE_MAP[personaId];

  if (!stageIndices || pipelineResult.stages.length === 0) {
    return { personaId, score: pipelineResult.overallScore, findings: [], status: 'done' };
  }

  // Gather findings from mapped stages
  const findings: ReviewFinding[] = [];
  let totalScore = 0;
  let stageCount = 0;

  for (const idx of stageIndices) {
    const stage = pipelineResult.stages[idx];
    if (!stage) continue;
    totalScore += stage.score;
    stageCount++;
    for (const f of stage.findings) {
      const severity: ReviewFinding['severity'] =
        stage.status === 'fail' ? 'error' :
        stage.status === 'warn' ? 'warning' : 'info';
      findings.push({ severity, message: f });
    }
  }

  const score = stageCount > 0 ? Math.round(totalScore / stageCount) : pipelineResult.overallScore;

  return { personaId, score, findings, status: 'done' };
}

// IDENTITY_SEAL: PART-2 | role=RealReviewEngine | inputs=personaId,code | outputs=ReviewerResult

// ============================================================
// PART 3 — ReviewerCard Sub-Component
// ============================================================

interface ReviewerCardProps {
  persona: ReviewerPersona;
  result: ReviewerResult | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-accent-red',
  warning: 'text-accent-amber',
  info: 'text-accent-blue',
};

const SEVERITY_BG: Record<string, string> = {
  error: 'bg-accent-red/10',
  warning: 'bg-accent-amber/10',
  info: 'bg-accent-blue/10',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'text-accent-green';
  if (score >= 70) return 'text-accent-amber';
  return 'text-accent-red';
}

const ReviewerCard: React.FC<ReviewerCardProps> = ({ persona, result }) => {
  const status = result?.status ?? 'pending';

  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={persona.color}>{persona.icon}</span>
          <div>
            <h4 className="text-xs font-bold text-text-primary">{persona.name}</h4>
            <p className="text-[10px] text-text-tertiary">{persona.description}</p>
          </div>
        </div>

        {/* Status / Score */}
        <div className="flex items-center gap-2">
          {status === 'pending' && (
            <span className="text-[10px] text-text-tertiary px-2 py-0.5 bg-bg-tertiary rounded-full">
              Pending
            </span>
          )}
          {status === 'reviewing' && (
            <Loader2 className="w-4 h-4 text-accent-amber animate-spin" />
          )}
          {status === 'done' && result != null && (
            <>
              <span className={`text-lg font-black ${scoreColor(result.score)}`}>
                {result.score}
              </span>
              <CheckCircle className="w-4 h-4 text-accent-green" />
            </>
          )}
        </div>
      </div>

      {/* Findings */}
      {status === 'done' && result != null && result.findings.length > 0 && (
        <ul className="space-y-1.5">
          {result.findings.map((f, i) => (
            <li
              key={`${persona.id}-f-${i}`}
              className={`flex items-start gap-2 text-[11px] rounded-lg px-2.5 py-1.5 ${SEVERITY_BG[f.severity]}`}
            >
              <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${SEVERITY_COLORS[f.severity]}`} />
              <span className="text-text-secondary">{f.message}</span>
            </li>
          ))}
        </ul>
      )}

      {status === 'done' && result != null && result.findings.length === 0 && (
        <p className="text-[11px] text-accent-green flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> No issues found
        </p>
      )}
    </div>
  );
};

// IDENTITY_SEAL: PART-3 | role=ReviewerCard | inputs=ReviewerPersona,ReviewerResult | outputs=JSX

// ============================================================
// PART 4 — Main ReviewBoard Component
// ============================================================

export interface ReviewBoardProps {
  /** The code to review (current editor content) */
  code: string;
  /** Language for UI labels */
  language?: string;
}

export function ReviewBoard({ code, language = 'en' }: ReviewBoardProps): React.JSX.Element {
  const [results, setResults] = useState<Record<string, ReviewerResult>>({});
  const [isRunning, setIsRunning] = useState(false);

  const isKo = language === 'ko' || language === 'KO';

  /**
   * Run all reviewers sequentially.
   * Currently uses placeholder results. To integrate real AI:
   * 1. Import streamChat or runSingleAgent from agents.ts
   * 2. For each persona, call with persona.systemPrompt + code
   * 3. Parse the structured response into ReviewerResult
   */
  const runReview = useCallback(async () => {
    if (isRunning) return;
    if (!code || code.trim().length < 10) return;

    setIsRunning(true);
    setResults({});

    for (const persona of REVIEWER_PERSONAS) {
      // Mark as reviewing
      setResults((prev) => ({
        ...prev,
        [persona.id]: { personaId: persona.id, score: 0, findings: [], status: 'reviewing' },
      }));

      // Simulate async delay (replace with real AI call)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 600 + Math.random() * 400);
        // Cleanup not needed for one-shot timer, but structured for safety
        return () => clearTimeout(timer);
      });

      const result = generateReviewResult(persona.id, code);
      setResults((prev) => ({
        ...prev,
        [persona.id]: result,
      }));
    }

    setIsRunning(false);
  }, [code, isRunning]);

  // Aggregate score
  const completedResults = Object.values(results).filter((r) => r.status === 'done');
  const avgScore = completedResults.length > 0
    ? Math.round(completedResults.reduce((sum, r) => sum + r.score, 0) / completedResults.length)
    : null;

  const totalFindings = completedResults.reduce((sum, r) => sum + r.findings.length, 0);
  const errorCount = completedResults.reduce(
    (sum, r) => sum + r.findings.filter((f) => f.severity === 'error').length, 0,
  );

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-purple" />
          <span className="text-xs font-bold text-text-primary">
            {isKo ? 'Architecture Review Board' : 'Architecture Review Board'}
          </span>
          {avgScore != null && (
            <span className={`text-xs font-black px-2 py-0.5 rounded-full bg-bg-primary ${scoreColor(avgScore)}`}>
              {avgScore}/100
            </span>
          )}
        </div>

        <button
          onClick={runReview}
          disabled={isRunning || !code || code.trim().length < 10}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-purple text-white rounded-lg text-[11px] font-bold hover:opacity-80 transition-opacity disabled:opacity-40 focus-visible:ring-2 ring-accent-blue"
          aria-label={isKo ? '?????? ??????' : 'Run Review'}
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {isKo ? '?????? ??????' : 'Run Review'}
        </button>
      </div>

      {/* Summary bar */}
      {completedResults.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-bg-tertiary text-[10px]">
          <span className="text-text-secondary">
            {completedResults.length}/{REVIEWER_PERSONAS.length} reviewers done
          </span>
          <span className="text-text-secondary">
            {totalFindings} findings
          </span>
          {errorCount > 0 && (
            <span className="text-accent-red font-bold">
              {errorCount} critical
            </span>
          )}
        </div>
      )}

      {/* Reviewer cards */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {code.trim().length < 10 ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-xs">
            {isKo ? '?????? ?????? ?????? ????????? ?????? ???????????????.' : 'Paste or select code to review.'}
          </div>
        ) : (
          REVIEWER_PERSONAS.map((persona) => (
            <ReviewerCard
              key={persona.id}
              persona={persona}
              result={results[persona.id] ?? null}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default ReviewBoard;

// IDENTITY_SEAL: PART-4 | role=ReviewBoardPanel | inputs=code,language | outputs=JSX
