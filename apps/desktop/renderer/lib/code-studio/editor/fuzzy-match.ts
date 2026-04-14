// ============================================================
// Code Studio — Fuzzy Matching
// ============================================================
// 점수 기반 문자열 매칭, 매치된 문자 하이라이트, 설정 가능한 임계값.

export interface FuzzyMatchResult {
  score: number;
  positions: number[];
  matched: boolean;
}

/**
 * Fuzzy match a query against a target string.
 * Returns score (higher = better) and matched character positions.
 *
 * Scoring:
 * - Consecutive matches: +5
 * - Start of word boundary: +10
 * - Case-exact match: +2
 * - Each matched char: +1
 */
export function fuzzyMatch(
  query: string,
  target: string,
  threshold = 0,
): FuzzyMatchResult {
  if (!query) return { score: 0, positions: [], matched: true };
  if (!target) return { score: 0, positions: [], matched: false };

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let queryIdx = 0;
  let prevMatchIdx = -2;

  for (let i = 0; i < target.length && queryIdx < query.length; i++) {
    if (targetLower[i] === queryLower[queryIdx]) {
      positions.push(i);
      score += 1;

      // Consecutive match bonus
      if (i === prevMatchIdx + 1) score += 5;

      // Word boundary bonus (start, after _ or -, camelCase)
      if (i === 0) score += 10;
      else {
        const prev = target[i - 1];
        if (prev === '_' || prev === '-' || prev === '/' || prev === '.') score += 10;
        else if (/[a-z]/.test(prev) && /[A-Z]/.test(target[i])) score += 8;
      }

      // Case-exact bonus
      if (query[queryIdx] === target[i]) score += 2;

      prevMatchIdx = i;
      queryIdx++;
    }
  }

  const matched = queryIdx === query.length;
  if (!matched) return { score: 0, positions: [], matched: false };

  // Length penalty: prefer shorter targets
  score -= Math.max(0, target.length - query.length) * 0.5;

  return {
    score: score > threshold ? score : 0,
    positions,
    matched: score > threshold,
  };
}

/**
 * Highlight matched characters in a target string with <mark> tags.
 */
export function highlightMatches(target: string, positions: number[]): string {
  if (positions.length === 0) return target;

  const posSet = new Set(positions);
  let result = '';
  let inMark = false;

  for (let i = 0; i < target.length; i++) {
    if (posSet.has(i)) {
      if (!inMark) { result += '<mark>'; inMark = true; }
      result += target[i];
    } else {
      if (inMark) { result += '</mark>'; inMark = false; }
      result += target[i];
    }
  }
  if (inMark) result += '</mark>';

  return result;
}

// IDENTITY_SEAL: role=FuzzyMatch | inputs=query,target | outputs=FuzzyMatchResult,string
