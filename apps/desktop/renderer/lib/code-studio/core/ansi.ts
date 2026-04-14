// ============================================================
// ANSI Color Parser — Convert ANSI escape codes to styled spans
// ============================================================
// Ported from CSL IDE ansi-parser.ts for EH Universe Code Studio.
// Self-contained, no external dependencies.
// ============================================================

export interface AnsiSpan {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

// Foreground colors (30-37 standard, 90-97 bright)
const ANSI_COLORS: Record<number, string> = {
  30: "#1e1e1e", 31: "#f85149", 32: "#3fb950", 33: "#d29922",
  34: "#58a6ff", 35: "#bc8cff", 36: "#39c5cf", 37: "#e6edf3",
  90: "#6e7681", 91: "#ff7b72", 92: "#56d364", 93: "#e3b341",
  94: "#79c0ff", 95: "#d2a8ff", 96: "#56d4dd", 97: "#ffffff",
};

/**
 * Parse a string containing ANSI escape codes into styled spans.
 * Supports SGR codes: reset(0), bold(1), dim(2), italic(3),
 * underline(4), color(30-37, 90-97), and their resets.
 */
export function parseAnsi(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;

  let lastIndex = 0;
  let currentColor: string | undefined;
  let bold = false;
  let italic = false;
  let underline = false;
  let dim = false;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    // Text before this escape sequence
    if (match.index > lastIndex) {
      spans.push({
        text: text.slice(lastIndex, match.index),
        color: currentColor,
        bold,
        italic,
        underline,
        dim,
      });
    }

    // Parse SGR codes
    const codes = match[1].split(";").map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        bold = false;
        italic = false;
        underline = false;
        dim = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 2) {
        dim = true;
      } else if (code === 3) {
        italic = true;
      } else if (code === 4) {
        underline = true;
      } else if (code === 22) {
        bold = false;
        dim = false;
      } else if (code === 23) {
        italic = false;
      } else if (code === 24) {
        underline = false;
      } else if (ANSI_COLORS[code]) {
        currentColor = ANSI_COLORS[code];
      } else if (code === 39) {
        currentColor = undefined;
      }
      // Background colors (40-47, 100-107) are recognized but not rendered
      // in the HTML terminal — they would need background-color styling
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last escape
  if (lastIndex < text.length) {
    spans.push({
      text: text.slice(lastIndex),
      color: currentColor,
      bold,
      italic,
      underline,
      dim,
    });
  }

  return spans;
}

/** Strip all ANSI escape codes from a string. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// IDENTITY_SEAL: role=ANSI parser | inputs=ANSI text | outputs=AnsiSpan[],stripped string
