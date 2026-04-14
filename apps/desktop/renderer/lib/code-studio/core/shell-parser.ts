// ============================================================
// PART 1 — Token Types & Tokenizer
// ============================================================
// Shell parser for EH Universe Code Studio.
// Ported from CSL IDE shell-parser.ts — self-contained module.
// ============================================================

/** Token types produced by the shell lexer */
export type TokenType =
  | "word"
  | "pipe"
  | "and"
  | "or"
  | "semicolon"
  | "redirect_out"
  | "redirect_append"
  | "redirect_err"
  | "redirect_err_out"
  | "background"
  | "newline"
  | "continuation";

export interface Token {
  type: TokenType;
  value: string;
  /** Start offset in the original input string */
  offset: number;
  /** Whether this word was quoted (globs should NOT expand) */
  quoted?: boolean;
}

/**
 * Tokenize a shell command string into structured tokens.
 * Supports single/double/backtick quotes, escape characters,
 * pipes, logical operators, semicolons, redirects, background
 * operator, and line continuation.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  function peek(offset = 0): string {
    return i + offset < len ? input[i + offset] : "";
  }

  function advance(): string {
    return input[i++];
  }

  function skipWhitespace(): void {
    while (i < len && (input[i] === " " || input[i] === "\t")) i++;
  }

  while (i < len) {
    skipWhitespace();
    if (i >= len) break;

    const startOffset = i;
    const ch = peek();

    // Line continuation (backslash + newline)
    if (ch === "\\" && peek(1) === "\n") {
      tokens.push({ type: "continuation", value: "\\\n", offset: startOffset });
      i += 2;
      continue;
    }

    // Newline
    if (ch === "\n") {
      tokens.push({ type: "newline", value: "\n", offset: startOffset });
      advance();
      continue;
    }

    // Pipe or logical OR
    if (ch === "|") {
      advance();
      if (peek() === "|") {
        advance();
        tokens.push({ type: "or", value: "||", offset: startOffset });
      } else {
        tokens.push({ type: "pipe", value: "|", offset: startOffset });
      }
      continue;
    }

    // Logical AND or background
    if (ch === "&") {
      advance();
      if (peek() === "&") {
        advance();
        tokens.push({ type: "and", value: "&&", offset: startOffset });
      } else {
        tokens.push({ type: "background", value: "&", offset: startOffset });
      }
      continue;
    }

    // Semicolon
    if (ch === ";") {
      advance();
      tokens.push({ type: "semicolon", value: ";", offset: startOffset });
      continue;
    }

    // Redirects: >>, 2>&1, 2>, >
    if (ch === ">" || (ch === "2" && peek(1) === ">")) {
      if (ch === "2" && peek(1) === ">") {
        i += 2;
        if (peek() === "&" && peek(1) === "1") {
          i += 2;
          tokens.push({ type: "redirect_err_out", value: "2>&1", offset: startOffset });
        } else {
          tokens.push({ type: "redirect_err", value: "2>", offset: startOffset });
        }
      } else {
        advance();
        if (peek() === ">") {
          advance();
          tokens.push({ type: "redirect_append", value: ">>", offset: startOffset });
        } else {
          tokens.push({ type: "redirect_out", value: ">", offset: startOffset });
        }
      }
      continue;
    }

    // Words (possibly quoted)
    let word = "";
    let isQuoted = false;

    while (i < len) {
      const c = input[i];

      if (
        c === " " || c === "\t" || c === "\n" ||
        c === "|" || c === "&" || c === ";" ||
        c === ">" || (c === "2" && peek(1) === ">")
      ) {
        break;
      }

      // Escape character
      if (c === "\\") {
        i++;
        if (i < len) { word += input[i]; i++; }
        continue;
      }

      // Single-quoted string
      if (c === "'") {
        isQuoted = true;
        i++;
        while (i < len && input[i] !== "'") { word += input[i]; i++; }
        if (i < len) i++;
        continue;
      }

      // Double-quoted string
      if (c === '"') {
        isQuoted = true;
        i++;
        while (i < len && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < len) { i++; word += input[i]; i++; }
          else { word += input[i]; i++; }
        }
        if (i < len) i++;
        continue;
      }

      // Backtick-quoted string
      if (c === "`") {
        isQuoted = true;
        i++;
        while (i < len && input[i] !== "`") { word += input[i]; i++; }
        if (i < len) i++;
        continue;
      }

      word += c;
      i++;
    }

    if (word.length > 0) {
      tokens.push({ type: "word", value: word, offset: startOffset, quoted: isQuoted });
    }
  }

  return tokens;
}

// IDENTITY_SEAL: PART-1 | role=tokenizer | inputs=input string | outputs=Token[]

// ============================================================
// PART 2 — Variable Expansion & Glob Matching
// ============================================================

/**
 * Expand shell variables in a string.
 * Supports $VAR, ${VAR}, ${VAR:-default}, ${VAR:=default}.
 */
export function expandVariables(
  input: string,
  env: Record<string, string>,
): string {
  return input.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?([-=])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_match, braced, op, fallback, simple) => {
      const varName = braced || simple;
      const value = env[varName];

      if (value !== undefined && value !== "") return value;
      if (op === "-") return fallback ?? "";
      if (op === "=") { const def = fallback ?? ""; env[varName] = def; return def; }
      return "";
    },
  );
}

/**
 * Convert a glob pattern to a RegExp.
 * Supports: *, ?, **, {a,b}, [abc], [!abc]
 */
export function globToRegex(pattern: string): RegExp {
  let regexStr = "^";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") { regexStr += "(?:.+/)?"; i += 3; }
        else { regexStr += ".*"; i += 2; }
      } else {
        regexStr += "[^/]*"; i++;
      }
    } else if (ch === "?") {
      regexStr += "[^/]"; i++;
    } else if (ch === "[") {
      let j = i + 1;
      let bracket = "[";
      if (j < pattern.length && pattern[j] === "!") { bracket += "^"; j++; }
      while (j < pattern.length && pattern[j] !== "]") { bracket += pattern[j]; j++; }
      bracket += "]";
      regexStr += bracket;
      i = j + 1;
    } else if (ch === "{") {
      let j = i + 1;
      const alternatives: string[] = [];
      let current = "";
      while (j < pattern.length && pattern[j] !== "}") {
        if (pattern[j] === ",") { alternatives.push(current); current = ""; }
        else { current += pattern[j]; }
        j++;
      }
      alternatives.push(current);
      regexStr += "(?:" + alternatives.map(escapeRegex).join("|") + ")";
      i = j + 1;
    } else {
      regexStr += escapeRegex(ch); i++;
    }
  }

  regexStr += "$";
  return new RegExp(regexStr);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Check whether a string contains unquoted glob characters. */
export function containsGlob(s: string): boolean {
  return /[*?[\]{]/.test(s);
}

/** Expand a glob pattern against a list of file paths. */
export function expandGlob(pattern: string, filePaths: string[]): string[] {
  const regex = globToRegex(pattern);
  return filePaths.filter((p) => regex.test(p)).sort();
}

// IDENTITY_SEAL: PART-2 | role=variable expansion+glob | inputs=string,env | outputs=expanded string,RegExp

// ============================================================
// PART 3 — Pipeline & Command Chain Parsing
// ============================================================

export interface RedirectSpec {
  type: "out" | "append" | "err" | "err_out";
  target: string;
}

export interface SimpleCommand {
  args: string[];
  redirects: RedirectSpec[];
  background: boolean;
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface CommandChain {
  pipelines: { pipeline: Pipeline; operator: "and" | "or" | "seq" | "none" }[];
}

/** Parse tokens into a CommandChain structure. */
export function parseCommandChain(tokens: Token[]): CommandChain {
  const chain: CommandChain = { pipelines: [] };

  let currentArgs: string[] = [];
  let currentRedirects: RedirectSpec[] = [];
  let currentBackground = false;
  let currentCommands: SimpleCommand[] = [];
  let pendingOperator: "and" | "or" | "seq" | "none" = "none";

  function flushCommand(): void {
    if (currentArgs.length > 0) {
      currentCommands.push({
        args: currentArgs,
        redirects: currentRedirects,
        background: currentBackground,
      });
      currentArgs = [];
      currentRedirects = [];
      currentBackground = false;
    }
  }

  function flushPipeline(): void {
    flushCommand();
    if (currentCommands.length > 0) {
      chain.pipelines.push({
        pipeline: { commands: currentCommands },
        operator: pendingOperator,
      });
      currentCommands = [];
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case "word":
        currentArgs.push(token.value);
        break;
      case "pipe":
        flushCommand();
        break;
      case "and":
        flushPipeline();
        pendingOperator = "and";
        break;
      case "or":
        flushPipeline();
        pendingOperator = "or";
        break;
      case "semicolon":
      case "newline":
        flushPipeline();
        pendingOperator = "seq";
        break;
      case "background":
        currentBackground = true;
        flushPipeline();
        pendingOperator = "seq";
        break;
      case "redirect_out": {
        const next = tokens[i + 1];
        if (next?.type === "word") { currentRedirects.push({ type: "out", target: next.value }); i++; }
        break;
      }
      case "redirect_append": {
        const next = tokens[i + 1];
        if (next?.type === "word") { currentRedirects.push({ type: "append", target: next.value }); i++; }
        break;
      }
      case "redirect_err": {
        const next = tokens[i + 1];
        if (next?.type === "word") { currentRedirects.push({ type: "err", target: next.value }); i++; }
        break;
      }
      case "redirect_err_out":
        currentRedirects.push({ type: "err_out", target: "" });
        break;
      case "continuation":
        break;
    }
  }

  flushPipeline();
  return chain;
}

// IDENTITY_SEAL: PART-3 | role=pipeline parsing | inputs=Token[] | outputs=CommandChain

// ============================================================
// PART 4 — Continuation & Incomplete Detection & Syntax Highlight
// ============================================================

/** Join continuation lines into a single logical line. */
export function joinContinuations(lines: string[]): string {
  let result = "";
  for (const line of lines) {
    if (line.endsWith("\\")) { result += line.slice(0, -1); }
    else { result += line + "\n"; }
  }
  return result.trimEnd();
}

/** Check whether a partial input needs more lines. */
export function isIncomplete(input: string): boolean {
  if (input.trimEnd().endsWith("\\")) return true;

  let singleQuote = false;
  let doubleQuote = false;
  let backtick = false;
  let braceDepth = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\\" && i + 1 < input.length) { i++; continue; }
    if (ch === "'" && !doubleQuote && !backtick) singleQuote = !singleQuote;
    else if (ch === '"' && !singleQuote && !backtick) doubleQuote = !doubleQuote;
    else if (ch === "`" && !singleQuote && !doubleQuote) backtick = !backtick;
    else if (ch === "(" && !singleQuote && !doubleQuote && !backtick) braceDepth++;
    else if (ch === ")" && !singleQuote && !doubleQuote && !backtick) braceDepth--;
  }

  return singleQuote || doubleQuote || backtick || braceDepth > 0;
}

export interface HighlightSpan {
  text: string;
  color: string;
}

const HIGHLIGHT_BUILTINS = new Set([
  "cd", "export", "alias", "unalias", "source", "history", "echo",
  "pwd", "exit", "set", "unset", "jobs", "fg", "bg", "clear",
  "help", "type", "env", "let", "eval",
]);

const HIGHLIGHT_KNOWN = new Set([
  "ls", "cat", "mkdir", "rm", "cp", "mv", "touch", "grep", "find",
  "npm", "npx", "node", "git", "tsc", "eslint", "prettier",
  "curl", "wget", "tar", "zip", "unzip", "chmod", "chown",
]);

/** Produce syntax-highlighted spans for a shell input line. */
export function highlightShellInput(input: string): HighlightSpan[] {
  if (!input) return [];

  const spans: HighlightSpan[] = [];
  const tokens = tokenize(input);
  let lastEnd = 0;
  let isFirstWord = true;
  let afterPipe = false;

  for (const token of tokens) {
    if (token.offset > lastEnd) {
      spans.push({ text: input.slice(lastEnd, token.offset), color: "#e6edf3" });
    }

    const raw = input.slice(token.offset, token.offset + token.value.length);

    switch (token.type) {
      case "pipe":
      case "and":
      case "or":
      case "semicolon":
        spans.push({ text: token.value, color: "#d29922" });
        afterPipe = true;
        break;
      case "redirect_out":
      case "redirect_append":
      case "redirect_err":
      case "redirect_err_out":
        spans.push({ text: token.value, color: "#d29922" });
        break;
      case "background":
        spans.push({ text: "&", color: "#bc8cff" });
        break;
      case "word": {
        if (isFirstWord || afterPipe) {
          if (HIGHLIGHT_BUILTINS.has(token.value)) {
            spans.push({ text: raw, color: "#58a6ff" });
          } else if (HIGHLIGHT_KNOWN.has(token.value)) {
            spans.push({ text: raw, color: "#3fb950" });
          } else {
            spans.push({ text: raw, color: "#e6edf3" });
          }
          isFirstWord = false;
          afterPipe = false;
        } else if (token.value.startsWith("-")) {
          spans.push({ text: raw, color: "#39c5cf" });
        } else if (token.value.startsWith("$")) {
          spans.push({ text: raw, color: "#bc8cff" });
        } else if (token.quoted) {
          spans.push({ text: raw, color: "#d29922" });
        } else if (containsGlob(token.value)) {
          spans.push({ text: raw, color: "#ff7b72" });
        } else {
          spans.push({ text: raw, color: "#e6edf3" });
        }
        break;
      }
      default:
        spans.push({ text: raw, color: "#e6edf3" });
    }

    lastEnd = token.offset + token.value.length;
  }

  if (lastEnd < input.length) {
    spans.push({ text: input.slice(lastEnd), color: "#e6edf3" });
  }

  return spans;
}

// IDENTITY_SEAL: PART-4 | role=continuation+highlight | inputs=string | outputs=boolean,HighlightSpan[]
