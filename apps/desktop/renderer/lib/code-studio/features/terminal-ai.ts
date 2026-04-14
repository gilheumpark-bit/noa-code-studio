// ============================================================
// PART 1 — Types & System Prompt
// ============================================================
// Terminal AI: analyze command errors via streamChat,
// suggest fixes, explain error messages, auto-retry.

import { streamChat } from '@/lib/ai-providers';
import { logger } from '@/lib/logger';

export interface TerminalAISuggestion {
  type: 'command' | 'code-fix' | 'explanation';
  summary: string;
  suggestion: string;
  confidence: number;
}

const TERMINAL_AI_SYSTEM = `You are a terminal error analysis assistant.
When given a failed terminal command and its output, analyze the error and provide a structured fix.

Respond ONLY with a valid JSON object:
{
  "type": "command" | "code-fix" | "explanation",
  "summary": "short summary (1-2 sentences)",
  "suggestion": "suggested fix command or code change",
  "confidence": 0.0-1.0
}

Patterns:
- Missing dependency -> npm install / pip install
- Permission denied -> chmod or sudo
- File not found -> create file or check path
- Syntax error -> code fix
- Port in use -> kill process or alternate port
- TypeScript/ESLint errors -> code fix

Prefer actionable suggestions over generic explanations.`;

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=TerminalAISuggestion

// ============================================================
// PART 2 — Error Analysis
// ============================================================

function buildUserPrompt(command: string, output: string, exitCode: number): string {
  const maxLen = 3000;
  const truncated = output.length > maxLen
    ? output.slice(0, maxLen) + '\n... (truncated)'
    : output;
  return `Failed command: ${command}\nExit code: ${exitCode}\n\nTerminal output:\n${truncated}`;
}

function parseSuggestion(raw: string): TerminalAISuggestion | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = JSON.parse(cleaned);
    if (
      !parsed.type ||
      !['command', 'code-fix', 'explanation'].includes(parsed.type) ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.suggestion !== 'string' ||
      typeof parsed.confidence !== 'number'
    ) {
      return null;
    }
    return {
      type: parsed.type,
      summary: parsed.summary,
      suggestion: parsed.suggestion,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

export async function analyzeTerminalError(
  command: string,
  output: string,
  exitCode: number,
  signal?: AbortSignal,
): Promise<TerminalAISuggestion | null> {
  if (exitCode === 0 && !output.trim()) return null;

  let accumulated = '';
  try {
    await streamChat({
      systemInstruction: TERMINAL_AI_SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(command, output, exitCode) }],
      temperature: 0.3,
      signal,
      onChunk: (text: string) => { accumulated += text; },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    logger.warn('terminal-ai', 'Analysis failed:', err);
    return null;
  }

  return parseSuggestion(accumulated);
}

// IDENTITY_SEAL: PART-2 | role=ErrorAnalysis | inputs=command,output,exitCode | outputs=TerminalAISuggestion

// ============================================================
// PART 3 — Error Explanation & Auto-Retry
// ============================================================

const EXPLAIN_SYSTEM = `You are a terminal output explainer.
Given an error message, explain it clearly in 2-3 sentences.
Focus on: what went wrong, why, and what the user should do.
Respond in plain text, no JSON.`;

export async function explainTerminalError(
  errorOutput: string,
  signal?: AbortSignal,
): Promise<string> {
  let accumulated = '';
  try {
    await streamChat({
      systemInstruction: EXPLAIN_SYSTEM,
      messages: [{ role: 'user', content: `Explain this error:\n${errorOutput.slice(0, 2000)}` }],
      temperature: 0.3,
      signal,
      onChunk: (text: string) => { accumulated += text; },
    });
    return accumulated.trim() || 'Unable to explain this error.';
  } catch {
    return 'Failed to analyze the error.';
  }
}

export interface AutoRetryResult {
  suggestion: TerminalAISuggestion | null;
  retryCommand: string | null;
  explanation: string;
}

/**
 * Analyze a failed command and determine if auto-retry is viable.
 * Returns the suggested retry command only if confidence >= threshold.
 */
export async function analyzeAndSuggestRetry(
  command: string,
  output: string,
  exitCode: number,
  confidenceThreshold = 0.7,
  signal?: AbortSignal,
): Promise<AutoRetryResult> {
  const [suggestion, explanation] = await Promise.all([
    analyzeTerminalError(command, output, exitCode, signal),
    explainTerminalError(output, signal),
  ]);

  const retryCommand =
    suggestion?.type === 'command' && suggestion.confidence >= confidenceThreshold
      ? suggestion.suggestion
      : null;

  return { suggestion, retryCommand, explanation };
}

// IDENTITY_SEAL: PART-3 | role=Retry | inputs=command,output | outputs=AutoRetryResult
