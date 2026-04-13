// @ts-nocheck
// ============================================================
// PART 1 — Types & Constants
// ============================================================

import type { FileNode } from "@noa/quill-engine/types";
import { tokenize, type Token } from "@/lib/code-studio/core/shell-parser";

export interface TerminalLine {
  id: string;
  text: string;
  color?: string;
  bold?: boolean;
  isCommand?: boolean;
  rawCommand?: string;
  timestamp?: number;
  executionTime?: number;
}

export interface TerminalJob {
  id: number;
  command: string;
  status: "running" | "stopped" | "done";
  startTime: number;
  pid: number;
}

export interface HistoryEntry {
  command: string;
  timestamp: number;
  cwd: string;
  exitCode?: number;
  duration?: number;
}

const HISTORY_KEY = "eh_cs_terminal_history";
const ENV_KEY = "eh_cs_terminal_env";
const ALIAS_KEY = "eh_cs_terminal_aliases";
const MAX_HISTORY = 500;

const DEFAULT_ALIASES: Record<string, string> = {
  ll: "ls -la", la: "ls -a", cls: "clear",
  ni: "npm install", nr: "npm run", nrd: "npm run dev",
  nrb: "npm run build", nrt: "npm run test",
  gs: "git status", ga: "git add", gc: "git commit",
  gp: "git push", gl: "git log --oneline", gd: "git diff",
  gb: "git branch", gco: "git checkout",
  "..": "cd ..", "...": "cd ../..",
};

const BUILTIN_SET = new Set([
  "cd", "pwd", "echo", "export", "unset", "alias", "unalias",
  "source", "history", "clear", "help", "jobs", "fg", "bg",
  "set", "env", "which", "type", "exit", "true", "false",
  "test", "time", "cat", "ls", "grep", "head", "tail", "wc",
  "touch", "mkdir", "rm", "cp", "mv", "diff", "find", "sort",
]);

// IDENTITY_SEAL: PART-1 | role=types+constants | inputs=none | outputs=interfaces,constants

// ============================================================
// PART 2 — HistoryManager
// ============================================================

export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private cursor = -1;

  constructor() { this.load(); }

  private load(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) this.entries = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  private save(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.entries.slice(-MAX_HISTORY)));
    } catch { /* ignore */ }
  }

  push(command: string, cwd: string): void {
    const last = this.entries[this.entries.length - 1];
    if (last?.command === command) return;
    this.entries.push({ command, timestamp: Date.now(), cwd });
    if (this.entries.length > MAX_HISTORY) this.entries = this.entries.slice(-MAX_HISTORY);
    this.save();
    this.resetCursor();
  }

  updateLast(exitCode: number, duration: number): void {
    const last = this.entries[this.entries.length - 1];
    if (last) { last.exitCode = exitCode; last.duration = duration; this.save(); }
  }

  resetCursor(): void { this.cursor = -1; }

  navigateUp(): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor === -1) this.cursor = this.entries.length - 1;
    else if (this.cursor > 0) this.cursor--;
    else return null;
    return this.entries[this.cursor].command;
  }

  navigateDown(): string | null {
    if (this.cursor === -1) return null;
    this.cursor++;
    if (this.cursor >= this.entries.length) { this.cursor = -1; return ""; }
    return this.entries[this.cursor].command;
  }

  getFormatted(limit = 50): string[] {
    return this.entries.slice(-limit).map((e, i) => {
      const num = String(this.entries.length - limit + i + 1).padStart(4, " ");
      const time = new Date(e.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      const dur = e.duration !== undefined ? ` (${e.duration}ms)` : "";
      return `${num}  ${time}  ${e.command}${dur}`;
    });
  }

  clear(): void { this.entries = []; this.save(); this.resetCursor(); }

  search(query: string): HistoryEntry[] {
    const lower = query.toLowerCase();
    return this.entries.filter((e) => e.command.toLowerCase().includes(lower));
  }

  getAll(): HistoryEntry[] { return [...this.entries]; }
}

// IDENTITY_SEAL: PART-2 | role=history manager | inputs=commands | outputs=history entries

// ============================================================
// PART 3 — EnvironmentManager
// ============================================================

export class EnvironmentManager {
  private variables: Map<string, string>;
  private aliases: Map<string, string>;
  private cwd: string;
  private lastExitCode: number;
  private ps1: string;

  constructor() {
    this.variables = new Map<string, string>([
      ["HOME", "~"], ["USER", "developer"], ["SHELL", "/bin/eh-sh"],
      ["TERM", "xterm-256color"], ["LANG", "ko_KR.UTF-8"],
      ["PATH", "/usr/local/bin:/usr/bin:/bin"],
      ["NODE_ENV", "development"], ["EDITOR", "monaco"],
    ]);
    this.aliases = new Map(Object.entries(DEFAULT_ALIASES));
    this.cwd = "~/project";
    this.lastExitCode = 0;
    this.ps1 = "\\u@eh-studio:\\w$ ";
    this.loadPersisted();
  }

  private loadPersisted(): void {
    if (typeof window === "undefined") return;
    try {
      const envRaw = localStorage.getItem(ENV_KEY);
      if (envRaw) for (const [k, v] of Object.entries(JSON.parse(envRaw) as Record<string, string>)) this.variables.set(k, v);
    } catch { /* ignore */ }
    try {
      const aliasRaw = localStorage.getItem(ALIAS_KEY);
      if (aliasRaw) for (const [k, v] of Object.entries(JSON.parse(aliasRaw) as Record<string, string>)) this.aliases.set(k, v);
    } catch { /* ignore */ }
  }

  private saveVars(): void {
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.variables) obj[k] = v;
      localStorage.setItem(ENV_KEY, JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  private saveAliases(): void {
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.aliases) obj[k] = v;
      localStorage.setItem(ALIAS_KEY, JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  getVar(name: string): string | undefined { return this.variables.get(name); }
  setVar(name: string, value: string): void { this.variables.set(name, value); this.saveVars(); }
  unsetVar(name: string): boolean { const d = this.variables.delete(name); if (d) this.saveVars(); return d; }
  getAllVars(): Map<string, string> { return new Map(this.variables); }

  expandVariables(text: string): string {
    return text
      .replace(/\$\{([A-Za-z_]\w*)\}/g, (_, n) => this.variables.get(n) ?? "")
      .replace(/\$([A-Za-z_]\w*)/g, (_, n) => {
        if (n === "?") return String(this.lastExitCode);
        return this.variables.get(n) ?? "";
      })
      .replace(/\$\?/g, String(this.lastExitCode));
  }

  getAlias(name: string): string | undefined { return this.aliases.get(name); }
  setAlias(name: string, cmd: string): void { this.aliases.set(name, cmd); this.saveAliases(); }
  removeAlias(name: string): boolean { const d = this.aliases.delete(name); if (d) this.saveAliases(); return d; }
  getAllAliases(): Map<string, string> { return new Map(this.aliases); }

  getCwd(): string { return this.cwd; }
  setCwd(path: string): void {
    if (path === "~" || path === "$HOME") { this.cwd = "~"; }
    else if (path === "..") { const p = this.cwd.split("/"); if (p.length > 1) p.pop(); this.cwd = p.join("/") || "~"; }
    else if (path === "-") { const old = this.variables.get("OLDPWD") ?? "~"; this.variables.set("OLDPWD", this.cwd); this.cwd = old; return; }
    else if (path.startsWith("/") || path.startsWith("~")) { this.cwd = path; }
    else { this.cwd = `${this.cwd}/${path}`.replace(/\/+/g, "/"); }
    this.variables.set("OLDPWD", this.cwd);
  }

  getLastExitCode(): number { return this.lastExitCode; }
  setLastExitCode(code: number): void { this.lastExitCode = code; }

  buildPrompt(): string {
    return this.ps1
      .replace(/\\u/g, this.variables.get("USER") ?? "user")
      .replace(/\\h/g, "eh-studio")
      .replace(/\\w/g, this.cwd)
      .replace(/\\W/g, this.cwd.split("/").pop() ?? "~")
      .replace(/\\$/g, this.lastExitCode === 0 ? "$" : "!");
  }

  setPS1(ps1: string): void { this.ps1 = ps1; }
}

// IDENTITY_SEAL: PART-3 | role=environment manager | inputs=vars,aliases,cwd | outputs=expansion,prompt

// ============================================================
// PART 4 — JobManager & Autocomplete
// ============================================================

export class JobManager {
  private jobs: Map<number, TerminalJob> = new Map();
  private nextId = 1;
  private nextPid = 1000;

  add(command: string): TerminalJob {
    const job: TerminalJob = { id: this.nextId++, command, status: "running", startTime: Date.now(), pid: this.nextPid++ };
    this.jobs.set(job.id, job);
    return job;
  }
  complete(id: number): void { const j = this.jobs.get(id); if (j) j.status = "done"; }
  stop(id: number): void { const j = this.jobs.get(id); if (j) j.status = "stopped"; }
  resume(id: number): void { const j = this.jobs.get(id); if (j?.status === "stopped") j.status = "running"; }

  list(): string[] {
    return Array.from(this.jobs.values()).map((j) => {
      const elapsed = Math.round((Date.now() - j.startTime) / 1000);
      return `[${j.id}] ${j.pid}  ${j.status.padEnd(8)} ${elapsed}s  ${j.command}`;
    });
  }

  foreground(): TerminalJob | null {
    const stopped = Array.from(this.jobs.values()).filter((j) => j.status === "stopped");
    if (stopped.length === 0) return null;
    const job = stopped[stopped.length - 1]; job.status = "running"; return job;
  }

  background(): TerminalJob | null {
    const stopped = Array.from(this.jobs.values()).filter((j) => j.status === "stopped");
    if (stopped.length === 0) return null;
    const job = stopped[stopped.length - 1]; job.status = "running"; return job;
  }
}

export interface AutocompleteSuggestion {
  value: string;
  display: string;
  type: "command" | "file" | "directory" | "alias" | "variable" | "history" | "npm-script";
  score: number;
}

const COMMON_COMMANDS = [
  "npm", "npx", "node", "git", "ls", "cd", "cat", "mkdir", "rm", "cp", "mv",
  "pwd", "echo", "clear", "help", "tsc", "eslint", "prettier", "grep", "find",
  "curl", "wget", "tar", "zip", "unzip", "chmod", "chown", "which", "env",
  "export", "alias", "unalias", "history", "jobs", "fg", "bg", "time",
];

const NPM_SUBS = [
  "install", "run", "start", "test", "build", "init", "publish",
  "pack", "link", "unlink", "update", "outdated", "audit", "ls",
];

const GIT_SUBS = [
  "status", "add", "commit", "push", "pull", "fetch", "clone", "branch",
  "checkout", "merge", "rebase", "log", "diff", "stash", "remote", "tag",
  "reset", "revert", "cherry-pick", "bisect", "blame", "show", "init",
];

export function getAutocompleteSuggestions(ctx: {
  input: string; cursorPos: number; files: FileNode[];
  env: EnvironmentManager; history: HistoryManager;
}): AutocompleteSuggestion[] {
  const { input, files, env, history } = ctx;
  const trimmed = input.trimStart();
  const parts = trimmed.split(/\s+/);
  const suggestions: AutocompleteSuggestion[] = [];

  if (parts.length <= 1) {
    const partial = (parts[0] || "").toLowerCase();
    for (const cmd of COMMON_COMMANDS) {
      if (cmd.startsWith(partial)) suggestions.push({ value: cmd, display: cmd, type: "command", score: 100 });
    }
    for (const [a, exp] of env.getAllAliases()) {
      if (a.startsWith(partial)) suggestions.push({ value: a, display: `${a} \u2192 ${exp}`, type: "alias", score: 90 });
    }
    for (const entry of history.search(partial).slice(-5)) {
      if (!suggestions.some((s) => s.value === entry.command)) {
        suggestions.push({ value: entry.command, display: entry.command, type: "history", score: 80 });
      }
    }
  } else {
    const cmd = parts[0];
    const last = parts[parts.length - 1];

    if (cmd === "npm" && parts.length === 2) {
      for (const sub of NPM_SUBS) {
        if (sub.startsWith(last)) suggestions.push({ value: `npm ${sub}`, display: sub, type: "command", score: 100 });
      }
      const pkg = findFileNode(files, "package.json");
      if (pkg?.content) {
        try {
          const parsed = JSON.parse(pkg.content);
          if (parsed.scripts) {
            for (const s of Object.keys(parsed.scripts)) {
              if (s.startsWith(last)) suggestions.push({ value: `npm run ${s}`, display: `run ${s}`, type: "npm-script", score: 95 });
            }
          }
        } catch { /* ignore */ }
      }
    }

    if (cmd === "git" && parts.length === 2) {
      for (const sub of GIT_SUBS) {
        if (sub.startsWith(last)) suggestions.push({ value: `git ${sub}`, display: sub, type: "command", score: 100 });
      }
    }

    // File path completion (simple name match)
    if (last && !last.startsWith("-") && !last.startsWith("$")) {
      const lower = last.toLowerCase();
      const allFiles = flattenAllFiles(files, "");
      for (const { name, path, isDir } of allFiles.slice(0, 50)) {
        if (name.toLowerCase().startsWith(lower)) {
          suggestions.push({
            value: trimmed.slice(0, trimmed.lastIndexOf(last)) + path,
            display: name + (isDir ? "/" : ""),
            type: isDir ? "directory" : "file",
            score: 75,
          });
        }
      }
    }

    if (last.startsWith("$")) {
      const prefix = last.slice(1).toLowerCase();
      for (const [name] of env.getAllVars()) {
        if (name.toLowerCase().startsWith(prefix)) suggestions.push({ value: `$${name}`, display: `$${name}`, type: "variable", score: 85 });
      }
    }
  }

  const seen = new Set<string>();
  return suggestions.sort((a, b) => b.score - a.score).filter((s) => {
    if (seen.has(s.value)) return false; seen.add(s.value); return true;
  }).slice(0, 12);
}

// IDENTITY_SEAL: PART-4 | role=jobs+autocomplete | inputs=context | outputs=suggestions

// ============================================================
// PART 5 — Syntax Highlight & Builtin Executor
// ============================================================

export interface HighlightedSpan { text: string; color: string; bold?: boolean; }

export function highlightInput(input: string, env: EnvironmentManager): HighlightedSpan[] {
  if (!input) return [];
  const spans: HighlightedSpan[] = [];
  const parts = input.split(/(\s+)/);
  let isFirstWord = true;

  for (const part of parts) {
    if (/^\s+$/.test(part)) { spans.push({ text: part, color: "inherit" }); continue; }
    if (isFirstWord) {
      isFirstWord = false;
      if (BUILTIN_SET.has(part)) spans.push({ text: part, color: "var(--accent-yellow)", bold: true });
      else if (env.getAlias(part) !== undefined) spans.push({ text: part, color: "var(--accent-purple)" });
      else if (COMMON_COMMANDS.includes(part)) spans.push({ text: part, color: "var(--accent-green)", bold: true });
      else spans.push({ text: part, color: "var(--accent-green)" });
    } else if (part.startsWith("-")) spans.push({ text: part, color: "var(--accent-blue)" });
    else if (part.startsWith("$")) spans.push({ text: part, color: "var(--accent-purple)" });
    else if (part === "|" || part === "&&" || part === "||" || part === ";") spans.push({ text: part, color: "var(--accent-red)", bold: true });
    else if (part === ">" || part === ">>" || part === "2>&1") spans.push({ text: part, color: "var(--accent-red)" });
    else spans.push({ text: part, color: "inherit" });
  }
  return spans;
}

export interface BuiltinResult { output: TerminalLine[]; exitCode: number; }

export function executeBuiltin(
  command: string, args: string[], env: EnvironmentManager,
  history: HistoryManager, jobs: JobManager, files: FileNode[],
): BuiltinResult | null {
  switch (command) {
    case "cd": { env.setCwd(env.expandVariables(args[0] || "~")); return { output: [], exitCode: 0 }; }
    case "pwd": return { output: [ln(env.getCwd())], exitCode: 0 };
    case "echo": return { output: [ln(env.expandVariables(args.join(" ")))], exitCode: 0 };
    case "export": {
      if (args.length === 0) { return { output: Array.from(env.getAllVars()).map(([k, v]) => ln(`export ${k}="${v}"`, "green")), exitCode: 0 }; }
      for (const a of args) { const eq = a.indexOf("="); if (eq > 0) env.setVar(a.slice(0, eq), env.expandVariables(a.slice(eq + 1))); }
      return { output: [], exitCode: 0 };
    }
    case "unset": { for (const n of args) env.unsetVar(n); return { output: [], exitCode: 0 }; }
    case "alias": {
      if (args.length === 0) { return { output: Array.from(env.getAllAliases()).map(([k, v]) => ln(`alias ${k}='${v}'`, "yellow")), exitCode: 0 }; }
      for (const a of args) { const eq = a.indexOf("="); if (eq > 0) env.setAlias(a.slice(0, eq), a.slice(eq + 1).replace(/^['"]|['"]$/g, "")); }
      return { output: [], exitCode: 0 };
    }
    case "unalias": { for (const n of args) env.removeAlias(n); return { output: [], exitCode: 0 }; }
    case "history": {
      if (args[0] === "-c") { history.clear(); return { output: [ln("History cleared.", "yellow")], exitCode: 0 }; }
      const limit = args[0] ? parseInt(args[0], 10) : 50;
      return { output: history.getFormatted(isNaN(limit) ? 50 : limit).map((l) => ln(l)), exitCode: 0 };
    }
    case "jobs": { const list = jobs.list(); return list.length === 0 ? { output: [ln("No jobs.", "yellow")], exitCode: 0 } : { output: list.map((l) => ln(l)), exitCode: 0 }; }
    case "fg": { const j = jobs.foreground(); return j ? { output: [ln(`[${j.id}] resumed: ${j.command}`, "green")], exitCode: 0 } : { output: [ln("No stopped jobs.", "red")], exitCode: 1 }; }
    case "bg": { const j = jobs.background(); return j ? { output: [ln(`[${j.id}] running in background: ${j.command}`, "green")], exitCode: 0 } : { output: [ln("No stopped jobs.", "red")], exitCode: 1 }; }
    case "env": return { output: Array.from(env.getAllVars()).map(([k, v]) => ln(`${k}=${v}`)), exitCode: 0 };
    case "set": { if (args.length === 0) return { output: Array.from(env.getAllVars()).map(([k, v]) => ln(`${k}=${v}`)), exitCode: 0 }; return { output: [], exitCode: 0 }; }
    case "which": case "type": {
      const t = args[0]; if (!t) return { output: [ln("usage: which <command>", "red")], exitCode: 1 };
      if (BUILTIN_SET.has(t)) return { output: [ln(`${t}: shell builtin`, "blue")], exitCode: 0 };
      const al = env.getAlias(t); if (al) return { output: [ln(`${t}: aliased to '${al}'`, "yellow")], exitCode: 0 };
      if (COMMON_COMMANDS.includes(t)) return { output: [ln(`/usr/bin/${t}`)], exitCode: 0 };
      return { output: [ln(`${t}: not found`, "red")], exitCode: 1 };
    }
    case "clear": return { output: [], exitCode: 0 };
    case "help": return { output: buildHelp(), exitCode: 0 };
    case "cat": return catBuiltin(args, files, env);
    case "ls": return lsBuiltin(args, files, env);
    case "true": return { output: [], exitCode: 0 };
    case "false": return { output: [], exitCode: 1 };
    case "test": return { output: [], exitCode: args.length > 0 ? 0 : 1 };
    case "time": return null;
    default: return null;
  }
}

// IDENTITY_SEAL: PART-5 | role=highlight+builtins | inputs=command,args,env | outputs=BuiltinResult

// ============================================================
// PART 6 — File Builtins & Preprocessor & Helpers
// ============================================================

function catBuiltin(args: string[], files: FileNode[], env: EnvironmentManager): BuiltinResult {
  if (args.length === 0) return { output: [ln("usage: cat <file>", "red")], exitCode: 1 };
  const showN = args.includes("-n");
  const fname = args.find((a) => !a.startsWith("-"));
  if (!fname) return { output: [ln("usage: cat <file>", "red")], exitCode: 1 };
  const node = findInTree(files, fname, env.getCwd());
  if (!node) return { output: [ln(`cat: ${fname}: No such file or directory`, "red")], exitCode: 1 };
  if (node.type === "folder") return { output: [ln(`cat: ${fname}: Is a directory`, "red")], exitCode: 1 };
  const lines = (node.content ?? "").split("\n");
  return { output: lines.map((l, i) => ln(showN ? `${String(i + 1).padStart(4)} ${l}` : l)), exitCode: 0 };
}

function lsBuiltin(args: string[], files: FileNode[], env: EnvironmentManager): BuiltinResult {
  const showAll = args.includes("-a") || args.includes("-la") || args.includes("-al");
  const showLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
  const targetDir = args.find((a) => !a.startsWith("-")) || ".";
  const entries = targetDir === "." || targetDir === "./" ? files : resolveDir(files, targetDir, env.getCwd()) ?? files;
  const out: TerminalLine[] = [];

  if (showAll) {
    out.push(showLong ? ln("drwxr-xr-x  .  ", "blue") : ln(".  ..  ", "blue"));
    if (showLong) out.push(ln("drwxr-xr-x  ..  ", "blue"));
  }

  for (const node of entries) {
    if (!showAll && node.name.startsWith(".")) continue;
    const isDir = node.type === "folder";
    if (showLong) {
      const perms = isDir ? "drwxr-xr-x" : "-rw-r--r--";
      const size = isDir ? "-" : String(node.content?.length ?? 0).padStart(6, " ");
      out.push(ln(`${perms}  ${size}  ${node.name}${isDir ? "/" : ""}`, isDir ? "blue" : undefined));
    } else {
      out.push(ln(`${node.name}${isDir ? "/" : ""}`, isDir ? "blue" : undefined));
    }
  }

  if (out.length === 0 && !showAll) out.push(ln("(empty directory)", "yellow"));
  return { output: out, exitCode: 0 };
}

function buildHelp(): TerminalLine[] {
  return [
    ln("EH Universe Code Studio Terminal", "green"),
    ln("  Navigation: cd, pwd, echo, export, unset, alias, history, env, which, clear", "yellow"),
    ln("  File Ops: cat, ls, head, tail, wc, touch, mkdir, rm, cp, mv, grep, find, sort", "yellow"),
    ln("  Shortcuts: Ctrl+L: Clear | Tab: Autocomplete | Up/Down: History", "blue"),
  ];
}

export interface ProcessedCommand { segments: CommandSegment[]; }
export interface CommandSegment { command: string; args: string[]; redirects: Redirect[]; background: boolean; chainOperator?: "&&" | "||" | ";" | "|"; }
export interface Redirect { type: "out" | "append" | "err" | "err_out"; target: string; }

export function preprocessCommand(raw: string, env: EnvironmentManager): ProcessedCommand {
  const trimmed = raw.trim();
  const firstSpace = trimmed.indexOf(" ");
  const firstWord = firstSpace > 0 ? trimmed.slice(0, firstSpace) : trimmed;
  const alias = env.getAlias(firstWord);
  const expanded = alias ? alias + (firstSpace > 0 ? trimmed.slice(firstSpace) : "") : trimmed;
  const withVars = env.expandVariables(expanded);

  let tokens: Token[];
  try { tokens = tokenize(withVars); }
  catch { return { segments: [{ command: firstWord, args: withVars.split(/\s+/).slice(1), redirects: [], background: false }] }; }

  const segments: CommandSegment[] = [];
  let cur: Partial<CommandSegment> = { args: [], redirects: [] };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "word") { if (!cur.command) cur.command = t.value; else cur.args!.push(t.value); }
    else if (t.type === "pipe" || t.type === "and" || t.type === "or" || t.type === "semicolon") {
      const op = t.type === "pipe" ? "|" as const : t.type === "and" ? "&&" as const : t.type === "or" ? "||" as const : ";" as const;
      segments.push({ command: cur.command || "", args: cur.args || [], redirects: cur.redirects || [], background: false, chainOperator: op });
      cur = { args: [], redirects: [] };
    } else if (t.type === "background") { cur.background = true; }
    else if (t.type === "redirect_out" || t.type === "redirect_append" || t.type === "redirect_err") {
      const next = tokens[i + 1];
      if (next?.type === "word") { const m = { redirect_out: "out" as const, redirect_append: "append" as const, redirect_err: "err" as const }; cur.redirects!.push({ type: m[t.type], target: next.value }); i++; }
    } else if (t.type === "redirect_err_out") { cur.redirects!.push({ type: "err_out", target: "" }); }
  }
  if (cur.command) segments.push({ command: cur.command, args: cur.args || [], redirects: cur.redirects || [], background: cur.background || false });
  return { segments };
}

// -- Helpers --

function ln(text: string, color?: string, bold?: boolean): TerminalLine {
  return { id: crypto.randomUUID(), text, color, bold, timestamp: Date.now() };
}

function findFileNode(files: FileNode[], name: string): FileNode | null {
  for (const f of files) {
    if (f.name === name) return f;
    if (f.children) { const found = findFileNode(f.children, name); if (found) return found; }
  }
  return null;
}

function findInTree(files: FileNode[], name: string, _cwd: string): FileNode | null {
  if (name.includes("/")) {
    const parts = name.split("/").filter(Boolean);
    let current: FileNode[] = files;
    for (let i = 0; i < parts.length; i++) {
      const found = current.find((f) => f.name === parts[i]);
      if (!found) return null;
      if (i === parts.length - 1) return found;
      if (!found.children) return null;
      current = found.children;
    }
    return null;
  }
  return findFileNode(files, name);
}

function resolveDir(files: FileNode[], dir: string, cwd: string): FileNode[] | null {
  if (dir === "." || dir === "./") return files;
  const node = findInTree(files, dir, cwd);
  if (node?.type === "folder" && node.children) return node.children;
  return null;
}

function flattenAllFiles(files: FileNode[], prefix: string): { name: string; path: string; isDir: boolean }[] {
  const result: { name: string; path: string; isDir: boolean }[] = [];
  for (const f of files) {
    const p = prefix ? `${prefix}/${f.name}` : f.name;
    result.push({ name: f.name, path: p, isDir: f.type === "folder" });
    if (f.children) result.push(...flattenAllFiles(f.children, p));
  }
  return result;
}
// IDENTITY_SEAL: PART-6 | role=file builtins+preprocessor+helpers | inputs=args,files,env | outputs=BuiltinResult,ProcessedCommand
