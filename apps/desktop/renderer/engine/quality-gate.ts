export function evaluateQuality(_text: string): unknown {
  return { passed: true, attempt: 1, failReasons: [] };
}

export function getDefaultThresholds(): Record<string, unknown> {
  return {};
}

export function buildRetryHint(): string {
  return "";
}

export function getDefaultGateConfig(): unknown {
  return { enabled: false, autoMode: "off", maxRetries: 1 };
}
