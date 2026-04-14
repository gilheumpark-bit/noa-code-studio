export function analyzeManuscript(_text: string): unknown {
  return { findings: [], stats: {}, score: 100 };
}

export function calculateQualityTag(_text: string): unknown {
  return { tag: "A", label: "Good", visibleFindings: [] };
}
