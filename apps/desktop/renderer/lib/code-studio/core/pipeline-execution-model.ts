// ============================================================
// PART 1 — Static pipeline team stages (runFullPipeline)
// ============================================================
// Logical "8 teams" execution model: non-blocking stages run in parallel,
// then blocking stages run in order. Keep in sync with pipeline.ts FULL_TEAMS.

export type PipelineTeamStage =
  | 'simulation'
  | 'generation'
  | 'validation'
  | 'size-density'
  | 'asset-trace'
  | 'stability'
  | 'release-ip'
  | 'governance';

export interface PipelineTeamMeta {
  stage: PipelineTeamStage;
  /** When true, must complete before later blocking stages (see runFullPipeline) */
  blocking: boolean;
}

/**
 * Order matches `FULL_TEAMS` in `pipeline/pipeline.ts`.
 * Non-blocking entries are intended to run in parallel with each other.
 */
export const PIPELINE_TEAM_STAGES: readonly PipelineTeamMeta[] = [
  { stage: 'simulation', blocking: false },
  { stage: 'generation', blocking: false },
  { stage: 'validation', blocking: true },
  { stage: 'size-density', blocking: false },
  { stage: 'asset-trace', blocking: false },
  { stage: 'stability', blocking: false },
  { stage: 'release-ip', blocking: true },
  { stage: 'governance', blocking: false },
] as const;

// IDENTITY_SEAL: PART-1 | role=pipeline-execution-model | inputs=none | outputs=PIPELINE_TEAM_STAGES
