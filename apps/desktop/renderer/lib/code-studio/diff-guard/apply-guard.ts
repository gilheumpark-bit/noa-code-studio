import { runDiffGuard, type DiffGuardFinding } from '@noa/quill-engine/pipeline/diff-guard';
import type { Finding, Severity } from '@noa/quill-engine/pipeline/pipeline-teams';

export type GuardDecision =
  | { status: 'pass'; findings: Finding[] }
  | { status: 'fail'; findings: Finding[] };

function toSeverity(s: DiffGuardFinding['severity']): Severity {
  if (s === 'critical') return 'critical';
  if (s === 'major') return 'major';
  return 'minor';
}

export function runApplyGuard(args: {
  original: string;
  modified: string;
  fileName: string;
  language?: string;
}): GuardDecision {
  const r = runDiffGuard({
    original: args.original,
    modified: args.modified,
    fileName: args.fileName,
    language: args.language,
    policy: { mode: 'soft' },
  });

  const findings: Finding[] = r.findings.map((f) => ({
    severity: toSeverity(f.severity),
    message: `[diff-guard] ${f.message}`,
    line: f.line,
    rule: f.rule,
  }));

  return r.status === 'pass'
    ? { status: 'pass', findings }
    : { status: 'fail', findings };
}

