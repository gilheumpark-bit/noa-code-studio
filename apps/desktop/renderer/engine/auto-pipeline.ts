export function executePipeline(): unknown {
  return {
    id: "noop",
    stages: [],
    totalDuration: 0,
    finalStatus: "passed",
  };
}

export function getDefaultPipelineConfig(): Record<string, unknown> {
  return {};
}
