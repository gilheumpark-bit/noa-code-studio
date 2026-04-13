// @ts-nocheck
// ============================================================
// PART 1 — Types & Registry
// ============================================================
// Terminal command system for EH Universe Code Studio.
// Ported from CSL IDE terminal/index.ts with adapted imports.
// ============================================================

import type { FileNode } from "@noa/quill-engine/types";

export interface CommandResult {
  lines: { text: string; color?: string }[];
}

type CommandFn = (
  args: string[],
  ctx: CommandContext,
) => Promise<CommandResult> | CommandResult;

export interface CommandContext {
  files: FileNode[];
  onRunPipeline?: (fileName: string) => void;
  onAskAI?: (prompt: string) => void;
}

const registry = new Map<string, { fn: CommandFn; help: string }>();

function register(name: string, help: string, fn: CommandFn): void {
  registry.set(name, { fn, help });
}

// IDENTITY_SEAL: PART-1 | role=types+registry | inputs=none | outputs=CommandResult,CommandContext

// ============================================================
// PART 2 — executeCommand Entry Point
// ============================================================

export async function executeCommand(
  input: string,
  ctx: CommandContext,
): Promise<CommandResult> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  if (!cmd) return { lines: [] };

  // CSL sub-commands
  if (cmd === "csl") return cslCommand(args, ctx);

  const entry = registry.get(cmd);
  if (entry) return entry.fn(args, ctx);

  return {
    lines: [
      {
        text: `Command not found: ${cmd}. Type 'help' for available commands.`,
        color: "red",
      },
    ],
  };
}

// IDENTITY_SEAL: PART-2 | role=dispatcher | inputs=input string,CommandContext | outputs=CommandResult

// ============================================================
// PART 3 — Built-in Commands
// ============================================================

register("help", "Show available commands", () => ({
  lines: [
    { text: "EH Universe Code Studio Terminal v1.0", color: "green" },
    { text: "" },
    { text: "Commands:", color: "blue" },
    { text: "  help              Show this message" },
    { text: "  clear             Clear terminal" },
    { text: "  version           Show version info" },
    { text: "  ls [path]         List files" },
    { text: "  cat <file>        Show file content" },
    { text: "  csl run [file]    Run pipeline" },
    { text: "  csl review [file] Code review" },
    { text: "  csl status        Pipeline status" },
    { text: "  csl teams         List teams" },
    { text: "  ask <prompt>      Quick AI query" },
  ],
}));

register("version", "Show version", () => ({
  lines: [
    { text: "EH Universe Code Studio v1.0", color: "green" },
    { text: "Next.js 15 + React 19 + Monaco Editor" },
    { text: "Pipeline Integration + WebContainer" },
  ],
}));

register("clear", "Clear terminal", () => ({ lines: [] }));

register("ls", "List files", (_args, ctx) => {
  const list = flattenFileNames(ctx.files);
  if (list.length === 0) {
    return { lines: [{ text: "(empty)", color: "yellow" }] };
  }
  return {
    lines: list.map((f) => ({
      text: `  ${f.type === "folder" ? "\u{1F4C1}" : "\u{1F4C4}"} ${f.path}`,
      color: f.type === "folder" ? "blue" : undefined,
    })),
  };
});

register("cat", "Show file content", (args, ctx) => {
  const name = args[0];
  if (!name) {
    return { lines: [{ text: "Usage: cat <filename>", color: "yellow" }] };
  }
  const file = findFile(ctx.files, name);
  if (!file || file.type === "folder") {
    return { lines: [{ text: `File not found: ${name}`, color: "red" }] };
  }
  const contentLines = (file.content ?? "").split("\n");
  return {
    lines: contentLines.map((l, i) => ({
      text: `${String(i + 1).padStart(3)} \u2502 ${l}`,
      color: "green",
    })),
  };
});

register("ask", "Quick AI query", async (args, ctx) => {
  const prompt = args.join(" ");
  if (!prompt) {
    return { lines: [{ text: "Usage: ask <prompt>", color: "yellow" }] };
  }
  ctx.onAskAI?.(prompt);
  return {
    lines: [{ text: `\u2192 AI \uC9C8\uC758 \uC804\uC1A1: "${prompt}"`, color: "blue" }],
  };
});

// IDENTITY_SEAL: PART-3 | role=built-in commands | inputs=args,ctx | outputs=CommandResult

// ============================================================
// PART 4 — CSL Sub-commands
// ============================================================

function cslCommand(args: string[], ctx: CommandContext): CommandResult {
  const sub = args[0]?.toLowerCase();

  if (sub === "run" || sub === "review") {
    const fileName = args[1] ?? "\uD604\uC7AC \uD30C\uC77C";
    ctx.onRunPipeline?.(fileName);
    return {
      lines: [
        { text: `[CSL] \uD30C\uC774\uD504\uB77C\uC778 \uC2E4\uD589: ${fileName}`, color: "green" },
        {
          text: "[CSL] \uACB0\uACFC\uB294 Pipeline \uD328\uB110\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
          color: "blue",
        },
      ],
    };
  }

  if (sub === "status") {
    return {
      lines: [
        { text: "[CSL] Pipeline: Ready", color: "green" },
        { text: "[CSL] WebContainer: Active", color: "green" },
        { text: "[CSL] System: Online", color: "green" },
      ],
    };
  }

  if (sub === "teams") {
    return {
      lines: [
        { text: "Code Studio Pipeline Teams:", color: "blue" },
        { text: "  1. Simulation    \u2014 \uC758\uB3C4 \uD30C\uC2F1, \uB4DC\uB77C\uC774\uB7F0" },
        { text: "  2. Generation    \u2014 AI \uCF54\uB4DC \uC0DD\uC131" },
        { text: "  3. Validation    \u2014 \uC815\uC801 \uAC80\uC99D" },
        { text: "  4. Size/Density  \u2014 \uBC00\uB3C4 \uAC80\uC99D" },
        { text: "  5. Asset Trace   \u2014 \uC758\uC874\uC131 \uCD94\uC801" },
        { text: "  6. Stability     \u2014 \uD68C\uADC0 \uC704\uD5D8 \uBD84\uC11D" },
        { text: "  7. Release/IP    \u2014 \uBCF4\uC548 \uC2A4\uCE94 + \uB9B4\uB9AC\uC988 \uAC8C\uC774\uD2B8" },
        { text: "  8. Governance    \u2014 \uC2E0\uB8B0\uB3C4 + \uBCF5\uC7A1\uB3C4 \uC608\uC0B0" },
      ],
    };
  }

  return {
    lines: [
      {
        text: "Usage: csl <run|review|status|teams> [file]",
        color: "yellow",
      },
    ],
  };
}

// IDENTITY_SEAL: PART-4 | role=csl sub-commands | inputs=args,ctx | outputs=CommandResult

// ============================================================
// PART 5 — File Helpers
// ============================================================

function flattenFileNames(
  nodes: FileNode[],
  prefix = "",
): { path: string; type: string }[] {
  const result: { path: string; type: string }[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    result.push({ path, type: node.type });
    if (node.children) {
      result.push(...flattenFileNames(node.children, path));
    }
  }
  return result;
}

function findFile(nodes: FileNode[], name: string): FileNode | null {
  for (const node of nodes) {
    if (node.name === name) return node;
    if (node.children) {
      const found = findFile(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// IDENTITY_SEAL: PART-5 | role=file helpers | inputs=FileNode[] | outputs=path list,FileNode|null
