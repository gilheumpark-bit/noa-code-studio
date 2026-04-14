"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useRef, useCallback, useMemo } from "react";
import { Check, X, FileText } from "lucide-react";

interface DiffViewerProps {
  original: string;
  modified: string;
  language: string;
  fileName: string;
  onAccept: (content: string) => void;
  onReject: () => void;
}

type DiffLineType = "add" | "remove" | "unchanged";

interface DiffLine {
  type: DiffLineType;
  line: string;
}

// IDENTITY_SEAL: PART-1 | role=타입 정의 | inputs=none | outputs=DiffViewerProps, DiffLine

// ============================================================
// PART 2 — LCS Diff Algorithm
// ============================================================

/**
 * LCS 기반 라인 단위 diff 계산.
 * O(n*m) DP 테이블로 최장 공통 부분 수열을 구한 뒤,
 * 역추적하여 add/remove/unchanged 시퀀스를 생성한다.
 */
function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const n = origLines.length;
  const m = modLines.length;

  // DP 테이블 구축 — LCS 길이
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 역추적으로 diff 시퀀스 생성
  const result: DiffLine[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      result.push({ type: "unchanged", line: origLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", line: modLines[j - 1] });
      j--;
    } else {
      result.push({ type: "remove", line: origLines[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

/**
 * diff 결과를 좌측(original)/우측(modified) 패널용
 * 행 배열로 변환한다. 각 행에 라인 번호와 내용을 포함.
 */
interface PanelRow {
  lineNum: number | null;
  content: string;
  type: DiffLineType;
}

function buildPanelRows(diff: DiffLine[]): {
  left: PanelRow[];
  right: PanelRow[];
  added: number;
  removed: number;
} {
  const left: PanelRow[] = [];
  const right: PanelRow[] = [];
  let leftNum = 0;
  let rightNum = 0;
  let added = 0;
  let removed = 0;

  for (const entry of diff) {
    switch (entry.type) {
      case "unchanged":
        leftNum++;
        rightNum++;
        left.push({ lineNum: leftNum, content: entry.line, type: "unchanged" });
        right.push({ lineNum: rightNum, content: entry.line, type: "unchanged" });
        break;
      case "remove":
        leftNum++;
        removed++;
        left.push({ lineNum: leftNum, content: entry.line, type: "remove" });
        right.push({ lineNum: null, content: "", type: "remove" });
        break;
      case "add":
        rightNum++;
        added++;
        left.push({ lineNum: null, content: "", type: "add" });
        right.push({ lineNum: rightNum, content: entry.line, type: "add" });
        break;
    }
  }

  return { left, right, added, removed };
}

// IDENTITY_SEAL: PART-2 | role=diff 알고리즘 | inputs=original, modified (string) | outputs=DiffLine[], PanelRow[]

// ============================================================
// PART 3 — DiffViewer Component
// ============================================================

const ROW_BG: Record<DiffLineType, { left: string; right: string }> = {
  add:       { left: "bg-accent-green/5",  right: "bg-accent-green/15" },
  remove:    { left: "bg-accent-red/15",   right: "bg-accent-red/5" },
  unchanged: { left: "",                    right: "" },
};

const GUTTER_TEXT: Record<DiffLineType, { left: string; right: string }> = {
  add:       { left: "text-text-tertiary/40", right: "text-accent-green/60" },
  remove:    { left: "text-accent-red/60",    right: "text-text-tertiary/40" },
  unchanged: { left: "text-text-tertiary",    right: "text-text-tertiary" },
};

export default function DiffViewer({
  original,
  modified,
  language,
  fileName,
  onAccept,
  onReject,
}: DiffViewerProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef<"left" | "right" | null>(null);

  // diff 계산 — 입력이 바뀔 때만 재계산
  const { left, right, added, removed } = useMemo(() => {
    const diff = computeDiff(original, modified);
    return buildPanelRows(diff);
  }, [original, modified]);

  // 스크롤 동기화
  const handleScroll = useCallback(
    (source: "left" | "right") => {
      if (scrollingRef.current !== null && scrollingRef.current !== source) return;
      scrollingRef.current = source;

      const srcEl = source === "left" ? leftRef.current : rightRef.current;
      const tgtEl = source === "left" ? rightRef.current : leftRef.current;

      if (srcEl && tgtEl) {
        tgtEl.scrollTop = srcEl.scrollTop;
        tgtEl.scrollLeft = srcEl.scrollLeft;
      }

      // 프레임 끝에서 잠금 해제하여 무한 루프 방지
      requestAnimationFrame(() => {
        scrollingRef.current = null;
      });
    },
    [],
  );

  // 행 렌더링
  const renderRow = useCallback(
    (row: PanelRow, side: "left" | "right", idx: number) => {
      const bg = ROW_BG[row.type][side];
      const gutterColor = GUTTER_TEXT[row.type][side];
      const prefix = row.type === "add" && side === "right" ? "+" :
                     row.type === "remove" && side === "left" ? "-" : " ";

      return (
        <div
          key={`${side}-${idx}`}
          className={`flex min-h-[1.5rem] leading-6 ${bg}`}
        >
          {/* 라인 번호 거터 */}
          <span
            className={`inline-block w-12 shrink-0 select-none px-2 text-right font-mono text-[11px] ${gutterColor}`}
          >
            {row.lineNum ?? ""}
          </span>

          {/* +/- 기호 */}
          <span
            className={`inline-block w-5 shrink-0 select-none text-center font-mono text-[11px] ${
              prefix === "+" ? "text-accent-green" :
              prefix === "-" ? "text-accent-red" :
              "text-transparent"
            }`}
          >
            {prefix}
          </span>

          {/* 코드 내용 */}
          <span className="flex-1 whitespace-pre font-mono text-[12px] text-text-primary pr-4">
            {row.content}
          </span>
        </div>
      );
    },
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-bg-primary">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between border-b border-border bg-bg-secondary px-4 py-2">
        <div className="flex items-center gap-3">
          <FileText size={14} className="text-text-secondary" />
          <span className="font-mono text-xs font-medium text-text-primary">
            {fileName}
          </span>
          <span className="font-mono text-[10px] text-text-tertiary uppercase">
            {language}
          </span>
          <span className="ml-2 font-mono text-[11px]">
            <span className="text-accent-green">+{added}</span>
            {" "}
            <span className="text-accent-red">-{removed}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onAccept(modified)}
            className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-3 py-1.5 font-mono text-[11px] font-medium text-accent-green transition-colors hover:bg-accent-green/25 active:scale-[0.97]"
          >
            <Check size={12} />
            Accept
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-md bg-accent-red/15 px-3 py-1.5 font-mono text-[11px] font-medium text-accent-red transition-colors hover:bg-accent-red/25 active:scale-[0.97]"
          >
            <X size={12} />
            Reject
          </button>
        </div>
      </div>

      {/* ── 패널 컨테이너 ── */}
      <div className="flex flex-1 min-h-0">
        {/* 좌측: Original */}
        <div className="flex flex-1 flex-col border-r border-border">
          <div className="border-b border-border bg-bg-secondary/60 px-4 py-1">
            <span className="font-mono text-[10px] font-medium tracking-wider text-text-tertiary uppercase">
              Original
            </span>
          </div>
          <div
            ref={leftRef}
            onScroll={() => handleScroll("left")}
            className="flex-1 overflow-auto bg-bg-primary py-1"
          >
            {left.map((row, idx) => renderRow(row, "left", idx))}
          </div>
        </div>

        {/* 우측: Modified */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-border bg-bg-secondary/60 px-4 py-1">
            <span className="font-mono text-[10px] font-medium tracking-wider text-text-tertiary uppercase">
              Modified
            </span>
          </div>
          <div
            ref={rightRef}
            onScroll={() => handleScroll("right")}
            className="flex-1 overflow-auto bg-bg-primary py-1"
          >
            {right.map((row, idx) => renderRow(row, "right", idx))}
          </div>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=UI 렌더링 | inputs=DiffViewerProps | outputs=JSX.Element
