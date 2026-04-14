// ============================================================
// Code Studio AI Features — 15 AI-powered coding assistants
// Unified module consuming streamChat from @/lib/ai-providers
// ============================================================

import { streamChat, getActiveProvider, PROVIDERS } from '@/lib/ai-providers';
import { ariManager } from '@/lib/code-studio/ai/ari-engine';
import { logger } from '@/lib/logger';

/** Build a short prompt suffix to suppress common false-positive lint patterns */
function buildFPSuppressionPrompt(): string {
  return 'Ignore intentional patterns: unused vars prefixed with _, assertion-style casts, and deliberate any escapes.';
}

// ============================================================
// PART 1 — Types & Helpers
// ============================================================

export interface ImportSuggestion {
  module: string;
  importStatement: string;
}

export interface LintResult {
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  fix?: string;
}

export interface CodeAction {
  title: string;
  edit: string;
}

export interface PairComment {
  suggestion: string;
  reasoning: string;
}

/** Internal: collect full streamed response into a string */
async function callAI(
  systemInstruction: string,
  userMessage: string,
  signal?: AbortSignal,
  temperature = 0.3,
): Promise<string> {
  let result = '';
  try {
    result = await streamChat({
      systemInstruction,
      messages: [{ role: 'user', content: userMessage }],
      temperature,
      onChunk: () => {},
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    logger.warn('ai-features', 'callAI failed:', err);
    return '';
  }
  return result.trim();
}

/** Internal: extract the first JSON block from an AI response */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const raw = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (raw) return raw[1].trim();
  return text.trim();
}

/** Safe JSON parse with fallback (kept for backward compat in non-safeAICall paths) */
 
// eslint-disable-next-line unused-imports/no-unused-vars
function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(extractJSON(text)) as T;
  } catch {
    return fallback;
  }
}

// IDENTITY_SEAL: PART-1 | role=shared types & internal helpers | inputs=none | outputs=types, callAI, extractJSON, safeParseJSON

// ============================================================
// PART 1.5 — Resilient AI Call Wrapper (safeAICall)
// ============================================================

/**
 * Schema validator: checks that every item in a value has the required fields
 * with correct types. Accepts a map of fieldName -> expected typeof string.
 */
function validateSchema<T>(
  value: T,
  requiredFields: Record<string, string>,
): boolean {
  if (value === null || value === undefined) return false;
  // For arrays, validate each element
  if (Array.isArray(value)) {
    return value.every((item) => validateSingleItem(item, requiredFields));
  }
  // For single objects
  return validateSingleItem(value, requiredFields);
}

function validateSingleItem(
  item: unknown,
  requiredFields: Record<string, string>,
): boolean {
  if (item === null || item === undefined || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  for (const [field, expectedType] of Object.entries(requiredFields)) {
    if (!(field in record)) return false;
    if (typeof record[field] !== expectedType) return false;
  }
  return true;
}

/** Delay helper for exponential backoff */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SafeAICallOptions<T> {
  systemInstruction: string;
  userMessage: string;
  fallback: T;
  signal?: AbortSignal;
  temperature?: number;
  /** Required field names -> typeof string (e.g. { line: 'number', message: 'string' }) */
  schema?: Record<string, string>;
  /** Post-parse filter for array results (e.g. remove invalid line numbers) */
  postFilter?: (item: unknown) => boolean;
}

/**
 * Resilient AI call wrapper with retry, JSON extraction, schema validation, and ARI awareness.
 * - Checks ARI availability before each retry attempt
 * - If current provider is ARI-unavailable on retry, logs a warning (streamChat handles routing)
 * - Retries up to 2 times with exponential backoff (1s, 2s)
 * - extractJSON + JSON.parse with try/catch
 * - Schema validation: checks required fields exist + correct types
 * - On final failure: returns the provided fallback value (never throws except AbortError)
 */
async function safeAICall<T>(opts: SafeAICallOptions<T>): Promise<T> {
  const maxRetries = 2;
  const backoffMs = [1000, 2000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ARI pre-check: warn if provider circuit is open (streamChat will auto-route)
    if (attempt > 0) {
      const currentProvider = getActiveProvider();
      if (!ariManager.isAvailable(currentProvider)) {
        logger.warn('ai-features', `ARI: provider ${currentProvider} circuit open on retry ${attempt}/${maxRetries} — streamChat will route to healthier provider`);
      }
    }

    try {
      const raw = await callAI(
        opts.systemInstruction,
        opts.userMessage,
        opts.signal,
        opts.temperature ?? 0.3,
      );

      if (!raw) {
        if (attempt < maxRetries) {
          logger.warn('ai-features', `empty response, retry ${attempt + 1}/${maxRetries}`);
          await delay(backoffMs[attempt]);
          continue;
        }
        return opts.fallback;
      }

      const jsonStr = extractJSON(raw);
      let parsed: T;
      try {
        parsed = JSON.parse(jsonStr) as T;
      } catch {
        logger.warn('ai-features', `JSON parse failed on attempt ${attempt + 1}`, jsonStr.slice(0, 200));
        if (attempt < maxRetries) {
          await delay(backoffMs[attempt]);
          continue;
        }
        return opts.fallback;
      }

      // Schema validation
      if (opts.schema) {
        if (!validateSchema(parsed, opts.schema)) {
          logger.warn('ai-features', `schema validation failed on attempt ${attempt + 1}`);
          if (attempt < maxRetries) {
            await delay(backoffMs[attempt]);
            continue;
          }
          return opts.fallback;
        }
      }

      // Post-filter for arrays
      if (opts.postFilter && Array.isArray(parsed)) {
        return (parsed as unknown[]).filter(opts.postFilter) as unknown as T;
      }

      return parsed;
    } catch (err) {
      // AbortError always propagates immediately
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('ai-features', `safeAICall error on attempt ${attempt + 1}:`, err);
      if (attempt < maxRetries) {
        await delay(backoffMs[attempt]);
        continue;
      }
    }
  }

  return opts.fallback;
}

// IDENTITY_SEAL: PART-1.5 | role=resilient AI call wrapper | inputs=prompt,schema,fallback | outputs=validated T or fallback

// ============================================================
// PART 2 — Hover Explanation, Auto-Import, Docstring, Lint
// ============================================================

// IDENTITY_SEAL: PART-2 | role=code understanding features | inputs=code,symbol,language | outputs=explanation,imports,docstring,lints

/**
 * 1. AI Hover Explanation
 * Returns a concise explanation of a symbol in the given code context.
 */
export async function getHoverExplanation(
  code: string,
  symbol: string,
  language: string,
  signal?: AbortSignal,
): Promise<string> {
  const system = `You are a code documentation assistant. Given source code in ${language}, explain the symbol "${symbol}" in 2-3 concise sentences. Focus on what it does, its type, and its role in the surrounding code. Do not include code blocks.`;
  const result = await callAI(system, code, signal);
  return result || `No explanation available for "${symbol}".`;
}

/**
 * 2. Auto-Import Suggestion
 * Detects missing imports and suggests import statements.
 */
export async function findMissingImports(
  code: string,
  language: string,
  signal?: AbortSignal,
): Promise<ImportSuggestion[]> {
  return safeAICall<ImportSuggestion[]>({
    systemInstruction: `You are an import analyzer for ${language}. Analyze the code and find identifiers that are used but not imported or declared. Return a JSON array of objects with "module" (package/path) and "importStatement" (the full import line). Only include high-confidence suggestions. If none are missing, return an empty array []. Return ONLY the JSON array, no explanation.

Example 1:
Input: "const [count, setCount] = useState(0);"
Output: [{"module":"react","importStatement":"import { useState } from 'react';"}]

Example 2:
Input: "const router = useRouter(); const params = useSearchParams();"
Output: [{"module":"next/navigation","importStatement":"import { useRouter, useSearchParams } from 'next/navigation';"}]

Example 3 (nothing missing):
Input: "import { useState } from 'react';\\nconst [x, setX] = useState(0);"
Output: []`,
    userMessage: code,
    fallback: [],
    signal,
    schema: { module: 'string', importStatement: 'string' },
  });
}

/**
 * 3. Docstring Generation
 * Generates a language-appropriate docstring/JSDoc for a function.
 */
export async function generateDocstring(
  functionCode: string,
  language: string,
  signal?: AbortSignal,
): Promise<string> {
  const formatHint = language === 'python'
    ? 'Google-style Python docstring'
    : language === 'typescript' || language === 'javascript'
      ? 'JSDoc comment'
      : 'standard documentation comment';
  const system = `You are a documentation generator. Given a function in ${language}, generate a ${formatHint}. Include parameter descriptions, return type, and a brief summary. Return ONLY the documentation comment, nothing else.`;
  const result = await callAI(system, functionCode, signal);
  return result || '/** No documentation generated. */';
}

/**
 * 4. AI Lint (code quality check)
 * Returns structured lint results with line numbers, messages, and optional fixes.
 * @param totalLines optional — filters out results with line > totalLines
 */
export async function lintCode(
  code: string,
  language: string,
  signal?: AbortSignal,
  totalLines?: number,
): Promise<LintResult[]> {
  const _fpSuppression = buildFPSuppressionPrompt();
  return safeAICall<LintResult[]>({
    systemInstruction: `You are a strict code reviewer for ${language}. Analyze the code for bugs, anti-patterns, security issues, and style problems. Return a JSON array of objects: {"line": number, "message": string, "severity": "error"|"warning"|"info", "fix": string|null}. "line" is the 1-based line number. "fix" is a suggested replacement for that line or null. If the code is clean, return []. Return ONLY the JSON array.
${_fpSuppression}

Example 1 (null dereference):
Input: "const x = null; console.log(x.name);"
Output: [{"line":1,"message":"Potential null dereference: 'x' is null but accessed with '.name'","severity":"error","fix":"Add null check: if (x) { console.log(x.name); }"}]

Example 2 (security + perf):
Input: "function find(items, id) {\\n  eval('return items[' + id + ']');\\n}"
Output: [{"line":2,"message":"eval() usage is a security risk — allows code injection","severity":"error","fix":"return items[id];"},{"line":1,"message":"Missing parameter types","severity":"warning","fix":"function find(items: Item[], id: string)"}]

Example 3 (clean code):
Input: "export function add(a: number, b: number): number { return a + b; }"
Output: []`,
    userMessage: code,
    fallback: [],
    signal,
    schema: { line: 'number', message: 'string', severity: 'string' },
    postFilter: (item) => {
      const r = item as Record<string, unknown>;
      if (typeof r.line !== 'number' || r.line < 1) return false;
      if (totalLines !== undefined && r.line > totalLines) return false;
      const validSeverities = ['error', 'warning', 'info'];
      if (!validSeverities.includes(r.severity as string)) return false;
      return true;
    },
  });
}

// ============================================================
// PART 3 — Rename, Search/Replace, Edit Predictor, Code Actions
// ============================================================

// IDENTITY_SEAL: PART-3 | role=code transformation features | inputs=code,context | outputs=names,replacements,predictions,actions

/**
 * 5. AI Rename (smart variable renaming)
 * Suggests better names for a variable/function.
 */
export async function suggestRename(
  code: string,
  oldName: string,
  language: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const raw = await safeAICall<string[]>({
    systemInstruction: `You are a naming expert for ${language}. Given code containing the identifier "${oldName}", suggest 3-5 better, more descriptive names. Follow ${language} naming conventions. Return a JSON array of strings. Return ONLY the JSON array.`,
    userMessage: code,
    fallback: [],
    signal,
  });
  return raw.filter((n) => typeof n === 'string' && n.length > 0);
}

/**
 * 6. AI Search/Replace (semantic find and replace)
 * Generates find/replace pairs based on a natural language description.
 */
export async function semanticSearchReplace(
  code: string,
  description: string,
  language: string,
  signal?: AbortSignal,
): Promise<{ find: string; replace: string }[]> {
  return safeAICall<{ find: string; replace: string }[]>({
    systemInstruction: `You are a code transformation assistant for ${language}. The user describes a change they want. Generate an array of find/replace pairs to apply. Return a JSON array of {"find": string, "replace": string}. Use exact string matches from the code. Return ONLY the JSON array.`,
    userMessage: `Code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nRequested change: ${description}`,
    fallback: [],
    signal,
    schema: { find: 'string', replace: 'string' },
  });
}

/**
 * 7. Edit Predictor (predict next edit)
 * Predicts what the developer will likely change next based on recent edits.
 */
export async function predictNextEdit(
  code: string,
  recentChanges: string,
  language: string,
  signal?: AbortSignal,
): Promise<string> {
  const system = `You are a code edit predictor for ${language}. Given the current file and a description of recent changes, predict the most likely next edit the developer will make. Be specific — output only the predicted code change as a diff-like snippet (lines to add/remove). Keep it concise.`;
  const userMsg = `Current code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nRecent changes:\n${recentChanges}`;
  const result = await callAI(system, userMsg, signal, 0.5);
  return result || '';
}

/**
 * 8. Code Actions (quick fixes)
 * Given an error message, suggests structured code fixes.
 */
export async function getCodeActions(
  code: string,
  errorMessage: string,
  language: string,
  signal?: AbortSignal,
): Promise<CodeAction[]> {
  return safeAICall<CodeAction[]>({
    systemInstruction: `You are a quick-fix assistant for ${language}. Given code and an error message, suggest 1-3 fixes. Return a JSON array of {"title": string, "edit": string}. "title" is a short description of the fix. "edit" is the corrected code snippet that replaces the problematic section. Return ONLY the JSON array.

Example:
Input: "Type 'string' is not assignable to type 'number'"
Output: [{"title":"Change variable type to string","edit":{"range":{"startLine":5},"newText":"let count: string"}}]`,
    userMessage: `Error: ${errorMessage}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\``,
    fallback: [],
    signal,
    schema: { title: 'string', edit: 'string' },
  });
}

// ============================================================
// PART 4 — Pair Programming, Diff Stream, Tool Use, Model Router
// ============================================================

// IDENTITY_SEAL: PART-4 | role=collaboration & orchestration | inputs=code,context,tool | outputs=comments,diffs,toolResults,modelId,cost

/**
 * 9. Pair Programming (comment-based collaboration)
 * Acts as a pair programmer reviewing code with context.
 */
export async function pairProgramComment(
  code: string,
  context: string,
  language: string,
  signal?: AbortSignal,
): Promise<PairComment> {
  return safeAICall<PairComment>({
    systemInstruction: `You are a pair programmer reviewing ${language} code. Given the code and the developer's context/question, provide a constructive suggestion. Return a JSON object: {"suggestion": string, "reasoning": string}. "suggestion" is the actionable advice or code change. "reasoning" is a 1-2 sentence justification. Return ONLY the JSON object.

Example:
Input: "function save(data) { fetch('/api', {method:'POST', body: JSON.stringify(data)}); fetch('/api', {method:'POST', body: JSON.stringify(data)}); }"
Output: {"suggestion":"Extract duplicate fetch call into a helper function","reasoning":"DRY principle — the identical fetch call is repeated, risking inconsistent changes"}`,
    userMessage: `Context: ${context}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\``,
    fallback: { suggestion: 'No suggestion available.', reasoning: '' },
    signal,
    temperature: 0.4,
    schema: { suggestion: 'string', reasoning: 'string' },
  });
}

/**
 * 10. AI Diff Stream (generate diff from description)
 * Streams a unified diff based on a natural language change description.
 * Calls onChunk for each streamed piece, and returns the full result.
 */
export async function generateDiffFromDescription(
  code: string,
  description: string,
  language: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const system = `You are a diff generator for ${language}. Given source code and a change description, output a unified diff (--- / +++ / @@ format) that applies the described change. Output ONLY the diff, no explanation.`;
  const userMsg = `Description: ${description}\n\nSource:\n\`\`\`${language}\n${code}\n\`\`\``;
  let full = '';
  try {
    full = await streamChat({
      systemInstruction: system,
      messages: [{ role: 'user', content: userMsg }],
      temperature: 0.2,
      onChunk,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    logger.warn('ai-features', 'generateDiffFromDescription failed:', err);
  }
  return full.trim();
}

/**
 * 11. AI Tool Use (execute tool calls)
 * Simulates tool use by asking the AI to produce the result of a tool invocation.
 */
export async function executeToolCall(
  tool: string,
  args: Record<string, string>,
  code: string,
  signal?: AbortSignal,
): Promise<string> {
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const system = `You are a code tool executor. The user invoked tool "${tool}" with arguments: ${argsStr}. Given the current code context, produce the tool's output. If the tool is "explain", explain the code. If "refactor", refactor it. If "test", generate a test. For unknown tools, describe what the tool would do. Output the result directly.`;
  const result = await callAI(system, code, signal, 0.3);
  return result || `Tool "${tool}" produced no output.`;
}

/**
 * Cost tier definitions per task type.
 * Maps task type to desired costTier priority.
 */
const _TASK_COST_MAP: Record<string, ('free' | 'cheap' | 'moderate' | 'expensive')[]> = {
  completion: ['free', 'cheap', 'moderate', 'expensive'],
  explanation: ['cheap', 'moderate', 'free', 'expensive'],
  review: ['expensive', 'moderate', 'cheap', 'free'],
  generation: ['expensive', 'moderate', 'cheap', 'free'],
};

/**
 * Estimates relative cost tier label for a given task type and current provider.
 * Returns 'free' | 'cheap' | 'moderate' | 'expensive'.
 */
export function estimateTaskCost(
  task: 'completion' | 'review' | 'generation' | 'explanation',
): 'free' | 'cheap' | 'moderate' | 'expensive' {
  const provider = getActiveProvider();
  const def = PROVIDERS[provider] ?? PROVIDERS.gemini;

  const providerTier = def.capabilities.costTier;

  // If the task prefers cheap models and the provider has a fast/small model,
  // cost is effectively at most the provider's base tier
  if (task === 'completion' || task === 'explanation') {
    const hasFast = def.models.some((m) => /mini|flash|instant|nano|small|haiku/i.test(m));
    if (hasFast && (providerTier === 'expensive' || providerTier === 'moderate')) {
      return 'cheap';
    }
  }

  return providerTier;
}

/**
 * 12. Model Router (select best model for task)
 * Selects the optimal model string based on task type, active provider, and cost awareness.
 */
export function selectModel(
  task: 'completion' | 'review' | 'generation' | 'explanation',
): string {
  const provider = getActiveProvider();
  const def = PROVIDERS[provider] ?? PROVIDERS.gemini;

  const models = def.models;

  // Cost-aware routing: completion -> cheapest, explanation -> mid-tier, review/generation -> best
  if (task === 'completion') {
    // Prefer the smallest/cheapest model available
    const cheapPatterns = /mini|flash|instant|nano|small|haiku/i;
    const cheap = models.find((m) => cheapPatterns.test(m));
    return cheap ?? models[models.length - 1] ?? def.defaultModel;
  }

  if (task === 'explanation') {
    // Mid-tier: try to find something between default and cheapest
    const cheapPatterns = /mini|flash|instant|nano|small|haiku/i;
    const bestPatterns = /pro|large|gpt-5\.\d(?!-mini)|sonnet|opus/i;
    const mid = models.find((m) => !cheapPatterns.test(m) && !bestPatterns.test(m));
    if (mid) return mid;
    // Fall through: pick cheapest if no mid-tier, but prefer faster than default
    const cheap = models.find((m) => cheapPatterns.test(m));
    return cheap ?? def.defaultModel;
  }

  // review / generation -> best model (default)
  return def.defaultModel;
}

// ============================================================
// PART 5 — Commit Message, PR Description, Code Explanation
// ============================================================

// IDENTITY_SEAL: PART-5 | role=git & documentation features | inputs=diff,commits,code | outputs=commitMsg,prDesc,explanation

/**
 * 13. Commit Message Generation
 * Generates a conventional-commit-style message from a diff.
 */
export async function generateCommitMessage(
  diff: string,
  signal?: AbortSignal,
): Promise<string> {
  const system = `You are a commit message generator. Given a git diff, write a concise conventional commit message (type: description). Use lowercase type (feat, fix, refactor, chore, docs, style, test, perf). The description should be under 72 characters and describe what changed and why. If multiple changes are present, focus on the most significant one. Output ONLY the commit message, nothing else.

Example 1:
Input: "- Added null guard in auth.ts line 45\\n- Removed unused import in utils.ts"
Output: "fix(auth): add null guard for session token access"

Example 2:
Input: "+export function useTheme() { ... }\\n+const ThemeContext = createContext()"
Output: "feat(theme): add useTheme hook and ThemeContext provider"

Example 3:
Input: "-  const data = await fetch(url)\\n+  const data = await fetch(url, { cache: 'force-cache' })"
Output: "perf(api): enable force-cache for static data fetches"`;
  const result = await callAI(system, diff, signal);
  if (!result) return 'chore: update code';
  return result.split('\n')[0].trim();
}

/**
 * 14. PR Description Generation
 * Generates a pull request description from a list of commit messages.
 */
export async function generatePRDescription(
  commits: string[],
  signal?: AbortSignal,
): Promise<string> {
  const system = `You are a pull request description writer. Given a list of commit messages from a branch, generate a clear PR description in Markdown. Include:
- A brief summary (1-2 sentences)
- A "Changes" section with bullet points
- A "Testing" section noting what should be tested
Keep it professional and concise.`;
  const userMsg = `Commits:\n${commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
  const result = await callAI(system, userMsg, signal, 0.4);
  return result || '## Summary\n\nNo description generated.';
}

/**
 * 15. Code Explanation (explain selected code)
 * Returns a detailed explanation of a code snippet.
 */
export async function explainCode(
  code: string,
  language: string,
  signal?: AbortSignal,
): Promise<string> {
  const system = `You are a code explainer for ${language}. Explain the given code clearly and thoroughly. Cover:
1. What the code does (high-level purpose)
2. How it works (step by step)
3. Key concepts or patterns used
Use plain language. Assume the reader knows basic programming but may not know the specific library/framework.`;
  const result = await callAI(system, code, signal, 0.3);
  return result || 'No explanation available.';
}
