// @ts-nocheck
// ============================================================
// PART 1 — Types & Constants
// ============================================================

import { streamChat } from '@/lib/ai-providers';
import { DESIGN_SYSTEM_COMPACT } from '@/lib/code-studio/core/design-system-spec';
import { buildQualityRulesPrompt } from '@noa/quill-engine/quality-rules-from-catalog';

export interface StepValidation {
  passed: boolean;
  reason?: string;
}

export interface StepTiming {
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface StepTokenUsage {
  promptEstimate: number;
  completionEstimate: number;
  totalEstimate: number;
}

export interface AutopilotStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error';
  output?: string;
  validation?: StepValidation;
  retried?: boolean;
  timing?: StepTiming;
  tokenUsage?: StepTokenUsage;
  dependsOn?: string[];   // ids of steps this step depends on
}

export interface AutopilotMetrics {
  totalDurationMs: number;
  totalTokensEstimate: number;
  completedSteps: number;
  failedSteps: number;
}

export interface AutopilotPlan {
  task: string;
  steps: AutopilotStep[];
  status: 'planning' | 'executing' | 'done' | 'error';
  metrics?: AutopilotMetrics;
}

/** Step type classification for temperature selection */
type StepType = 'analysis' | 'generation' | 'review' | 'refactor';

/** Temperature per step type — analysis needs precision, generation needs creativity */
const STEP_TEMPERATURE: Record<StepType, number> = {
  analysis: 0.1,
  generation: 0.4,
  review: 0.2,
  refactor: 0.25,
};

/** Predefined fallback templates when AI step splitting fails repeatedly */
const FALLBACK_STEP_TEMPLATES: Record<string, string[]> = {
  component: [
    'Define types and interfaces for the component',
    'Implement the core component logic',
    'Add styling, accessibility, and edge-case handling',
  ],
  utility: [
    'Define types and helper constants',
    'Implement the core utility functions',
    'Add error handling and validation',
  ],
  api: [
    'Define request/response types and endpoints',
    'Implement the API communication layer',
    'Add error handling, retry logic, and response parsing',
  ],
  generic: [
    'Analyze requirements and define types/interfaces',
    'Implement the core logic',
    'Add validation, error handling, and edge cases',
    'Review and refine the implementation',
  ],
};

const PLAN_SYSTEM_PROMPT = `You are an autonomous code generation planner.
Given a task description and project context, break the task into 3-5 atomic steps.
Each step must produce exactly one complete function, component, or module.
If a step depends on a prior step's output, indicate it clearly in the description (e.g. "using the UserCard from step 1").
Respond ONLY with a JSON array of step descriptions. No markdown, no explanation.
Example: ["Create the UserCard component with props interface","Create the fetchUser async function","Create the UserList component that uses UserCard and fetchUser"]`;

const _QUALITY_RULES = buildQualityRulesPrompt(20);

const STEP_SYSTEM_PROMPT_BASE = `You are an autonomous code generator.
You receive a single atomic step description and project context.
Output ONLY the code that implements the step. No explanations, no markdown fences, no comments about what you're doing.
Produce a complete, self-contained function or component.
Use TypeScript. Include necessary imports.

${_QUALITY_RULES}`;

/** Detect if a step description involves UI/component generation. */
function isUIStep(description: string): boolean {
  return /component|button|modal|form|card|page|layout|panel|dialog|input|table|list|grid|sidebar|header|footer|nav|menu|tab|ui|디자인|컴포넌트|버튼|페이지|모달|폼/i.test(description);
}

/** Build step prompt — injects design rules only for UI steps. */
function buildStepSystemPrompt(stepDescription: string): string {
  if (isUIStep(stepDescription)) {
    return `${STEP_SYSTEM_PROMPT_BASE}\n\n${DESIGN_SYSTEM_COMPACT}`;
  }
  return STEP_SYSTEM_PROMPT_BASE;
}

// IDENTITY_SEAL: PART-1 | role=TypeDefinitions | inputs=none | outputs=AutopilotStep,AutopilotPlan,AutopilotMetrics,StepValidation,StepTiming,StepTokenUsage

// ============================================================
// PART 2 — Step Classification & Temperature
// ============================================================

/** Classify a step description into a step type for temperature selection */
function classifyStepType(description: string): StepType {
  const lower = description.toLowerCase();

  if (/analyz|analys|inspect|review|audit|check|evaluat|assess|검토|분석|평가/.test(lower)) {
    return /review|audit|검토/.test(lower) ? 'review' : 'analysis';
  }
  if (/refactor|restructur|reorganiz|clean|simplif|리팩토|정리/.test(lower)) {
    return 'refactor';
  }
  // Default: generation (create, implement, build, add, etc.)
  return 'generation';
}

/** Get the temperature for a specific step based on its classification */
function getStepTemperature(description: string): number {
  const stepType = classifyStepType(description);
  return STEP_TEMPERATURE[stepType];
}

// IDENTITY_SEAL: PART-2 | role=StepClassification | inputs=description | outputs=StepType,temperature

// ============================================================
// PART 3 — Plan Creation (Structured Parsing + Fallback)
// ============================================================

function generateStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Validate parsed steps with schema-like checks:
 * - Must be a non-empty array of strings
 * - Each string must be 6+ chars (non-trivial description)
 * - Max 5 steps enforced
 */
function validateParsedSteps(candidate: unknown): string[] | null {
  if (!Array.isArray(candidate)) return null;
  if (candidate.length === 0) return null;

  const strings = candidate.filter(
    (item): item is string => typeof item === 'string' && item.trim().length >= 6
  );

  if (strings.length === 0) return null;
  return strings.slice(0, 5);
}

/**
 * Parse steps from AI response with structured validation.
 * Strategy: JSON direct -> JSON in markdown -> line-by-line -> null (caller handles fallback)
 */
function parseStepsFromResponse(raw: string): string[] | null {
  const trimmed = raw.trim();

  // Strategy 1: Direct JSON array parse
  try {
    const parsed = JSON.parse(trimmed);
    const validated = validateParsedSteps(parsed);
    if (validated) return validated;
  } catch { /* continue */ }

  // Strategy 2: JSON inside markdown code fences or embedded in text
  const jsonMatch = trimmed.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = validateParsedSteps(parsed);
      if (validated) return validated;
    } catch { /* continue */ }
  }

  // Strategy 3: Line-by-line (numbered/bulleted lists)
  const lines = trimmed
    .split('\n')
    .map(l => l.replace(/^[\s\-*\d.)\]]+/, '').trim())
    .filter(l => l.length >= 6);

  if (lines.length >= 2) return lines.slice(0, 5);

  return null; // Signal failure to caller for fallback handling
}

/**
 * Select fallback template based on task description keywords.
 */
function selectFallbackTemplate(task: string): string[] {
  const lower = task.toLowerCase();
  if (/component|ui|page|layout|button|modal|form|card|컴포넌트|페이지/.test(lower)) {
    return [...FALLBACK_STEP_TEMPLATES.component];
  }
  if (/api|fetch|endpoint|request|http|서버|요청/.test(lower)) {
    return [...FALLBACK_STEP_TEMPLATES.api];
  }
  if (/util|helper|function|lib|유틸|헬퍼/.test(lower)) {
    return [...FALLBACK_STEP_TEMPLATES.utility];
  }
  return [...FALLBACK_STEP_TEMPLATES.generic];
}

/**
 * Detect step dependencies from descriptions.
 * E.g., "using the UserCard from step 1" -> depends on step at index 0
 */
function resolveStepDependencies(
  steps: AutopilotStep[],
): void {
  for (let i = 1; i < steps.length; i++) {
    const desc = steps[i].description.toLowerCase();
    const deps: string[] = [];

    for (let j = 0; j < i; j++) {
      // Check for references like "step 1", "from step 1", "using ... from step N"
      const stepNum = j + 1;
      if (
        desc.includes(`step ${stepNum}`) ||
        desc.includes(`step${stepNum}`)
      ) {
        deps.push(steps[j].id);
      }

      // Check for references to the prior step's key nouns
      const priorKeywords = steps[j].description
        .split(/\s+/)
        .filter(w => w.length > 4)
        .map(w => w.toLowerCase());

      for (const kw of priorKeywords) {
        if (
          /^(create|implement|build|add|define|write|make|the|and|with|for|from|that|using|uses)$/i.test(kw)
        ) continue;
        if (desc.includes(kw)) {
          if (!deps.includes(steps[j].id)) {
            deps.push(steps[j].id);
          }
          break;
        }
      }
    }

    if (deps.length > 0) {
      steps[i].dependsOn = deps;
    }
  }
}

export async function createAutopilotPlan(
  task: string,
  context: string,
  signal?: AbortSignal,
): Promise<AutopilotPlan> {
  const plan: AutopilotPlan = {
    task,
    steps: [],
    status: 'planning',
  };

  let failCount = 0;
  const MAX_PLAN_ATTEMPTS = 2;
  let descriptions: string[] | null = null;

  while (failCount < MAX_PLAN_ATTEMPTS) {
    let response = '';
    try {
      response = await streamChat({
        systemInstruction: PLAN_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Task: ${task}\n\nProject context:\n${context}`,
          },
        ],
        temperature: 0.3,
        signal,
        onChunk: () => { /* planning does not expose stream */ },
      });
    } catch (err) {
      plan.status = 'error';
      plan.steps = [{
        id: generateStepId(),
        description: 'Planning failed',
        status: 'error',
        output: err instanceof Error ? err.message : String(err),
      }];
      return plan;
    }

    descriptions = parseStepsFromResponse(response);
    if (descriptions) break;
    failCount++;
  }

  // Deterministic fallback after 2 AI failures
  if (!descriptions) {
    descriptions = selectFallbackTemplate(task);
  }

  plan.steps = descriptions.map(desc => ({
    id: generateStepId(),
    description: desc,
    status: 'pending' as const,
  }));

  // Resolve inter-step dependencies
  resolveStepDependencies(plan.steps);

  plan.status = 'executing';
  return plan;
}

// IDENTITY_SEAL: PART-3 | role=PlanCreation | inputs=task,context,signal | outputs=AutopilotPlan

// ============================================================
// PART 4 — Step Validation (Enhanced)
// ============================================================

/**
 * Enhanced code detection: checks for real language constructs,
 * not just punctuation.
 */
function looksLikeCode(output: string): boolean {
  // Check for import/export statements
  if (/^(import|export)\s/m.test(output)) return true;

  // Check for function/class/interface/type declarations
  if (/\b(function|class|interface|type|enum|const|let|var)\s+\w+/m.test(output)) return true;

  // Check for arrow functions
  if (/\w+\s*=\s*\(.*\)\s*=>/.test(output)) return true;

  // Check for JSX/TSX tags
  if (/<\w+[\s/>]/.test(output) && /<\/\w+>/.test(output)) return true;

  // Check for TypeScript type annotations
  if (/:\s*(string|number|boolean|void|any|unknown|never|Record|Array|Promise)\b/.test(output)) return true;

  // Fallback: bracket density check (at least 3 code indicators in a short span)
  const codeChars = (output.match(/[{};()=>]/g) || []).length;
  return codeChars >= 3;
}

/**
 * Bracket balance checker that correctly skips brackets
 * inside string literals (single, double, template) and
 * single-line/multi-line comments.
 */
function checkBalancedBrackets(code: string): StepValidation {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const closers = new Set(Object.values(pairs));
  const stack: string[] = [];

  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // Skip single-line comments
    if (ch === '/' && code[i + 1] === '/') {
      while (i < len && code[i] !== '\n') i++;
      continue;
    }

    // Skip multi-line comments
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2; // skip closing */
      continue;
    }

    // Skip string literals (single quotes)
    if (ch === "'") {
      i++;
      while (i < len && code[i] !== "'") {
        if (code[i] === '\\') i++; // skip escaped char
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    // Skip string literals (double quotes)
    if (ch === '"') {
      i++;
      while (i < len && code[i] !== '"') {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }

    // Skip template literals (backticks) — simplified, ignores nested ${} brackets
    if (ch === '`') {
      i++;
      while (i < len && code[i] !== '`') {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }

    // Process brackets
    if (ch in pairs) {
      stack.push(pairs[ch]);
    } else if (closers.has(ch)) {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) {
        return { passed: false, reason: `Unmatched '${ch}' detected` };
      }
      stack.pop();
    }

    i++;
  }

  if (stack.length > 0) {
    return { passed: false, reason: `Unclosed bracket — expected '${stack[stack.length - 1]}'` };
  }
  return { passed: true };
}

/**
 * Validate step output:
 * - Empty/short output: fail
 * - Code output: bracket balance check
 * - Otherwise: pass
 */
function validateStepOutput(output: string | undefined): StepValidation {
  if (output == null || output.trim().length < 10) {
    return { passed: false, reason: 'Output too short or empty (< 10 chars)' };
  }

  if (looksLikeCode(output)) {
    return checkBalancedBrackets(output);
  }

  return { passed: true };
}

// IDENTITY_SEAL: PART-4 | role=StepValidation | inputs=stepOutput | outputs=StepValidation

// ============================================================
// PART 5 — Context Accumulation & Token Estimation
// ============================================================

/**
 * Accumulate prior step outputs into a context string.
 * With dependency resolution: if the current step has explicit deps,
 * prioritize those outputs first.
 */
function buildPriorContext(
  steps: AutopilotStep[],
  currentIndex: number,
): string {
  const currentStep = steps[currentIndex];
  const completed = steps.slice(0, currentIndex).filter(s => s.status === 'done' && s.output);

  if (completed.length === 0) return '';

  // If current step has explicit dependencies, put those first
  let ordered = completed;
  if (currentStep?.dependsOn && currentStep.dependsOn.length > 0) {
    const depSet = new Set(currentStep.dependsOn);
    const deps = completed.filter(s => depSet.has(s.id));
    const others = completed.filter(s => !depSet.has(s.id));
    ordered = [...deps, ...others];
  }

  const sections = ordered.map((s, i) =>
    `--- Step ${i + 1}: ${s.description} ---\n${s.output}`
  );

  return `\n\n## Prior Step Outputs\n${sections.join('\n\n')}`;
}

/**
 * Estimate token usage from input and output text.
 * Rough heuristic: ~4 chars per token for English code.
 */
function estimateTokenUsage(promptText: string, completionText: string): StepTokenUsage {
  const promptEstimate = Math.ceil(promptText.length / 4);
  const completionEstimate = Math.ceil(completionText.length / 4);
  return {
    promptEstimate,
    completionEstimate,
    totalEstimate: promptEstimate + completionEstimate,
  };
}

// IDENTITY_SEAL: PART-5 | role=ContextAccumulation | inputs=steps,currentIndex | outputs=priorContextString,StepTokenUsage

// ============================================================
// PART 6 — Step Execution (with retry + timing + token tracking)
// ============================================================

export async function executeAutopilotStep(
  step: AutopilotStep,
  context: string,
  signal?: AbortSignal,
  onChunk?: (text: string) => void,
  priorContext?: string,
): Promise<string> {
  const fullContext = priorContext
    ? `${context}${priorContext}`
    : context;

  const temperature = getStepTemperature(step.description);
  const userContent = `Step: ${step.description}\n\nProject context:\n${fullContext}`;
  let result = '';

  try {
    result = await streamChat({
      systemInstruction: buildStepSystemPrompt(step.description),
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
      temperature,
      signal,
      onChunk: (text) => {
        if (onChunk) onChunk(text);
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error(
      `Step "${step.description}" failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Track token usage on the step
  step.tokenUsage = estimateTokenUsage(userContent, result);

  return stripCodeFences(result);
}

/**
 * Retry a failed step with error context and lower temperature.
 */
async function retryStep(
  step: AutopilotStep,
  context: string,
  errorReason: string,
  signal?: AbortSignal,
  onChunk?: (text: string) => void,
  priorContext?: string,
): Promise<string> {
  const retryContext = priorContext
    ? `${context}${priorContext}`
    : context;

  const retryPrompt = [
    `Step: ${step.description}`,
    '',
    `Previous attempt failed: ${errorReason}`,
    'Please fix the issue and produce correct, complete output.',
    '',
    `Project context:\n${retryContext}`,
  ].join('\n');

  // Retry with lower temperature for more deterministic output
  const baseTemp = getStepTemperature(step.description);
  const retryTemp = Math.max(0.1, baseTemp - 0.1);
  let result = '';

  try {
    result = await streamChat({
      systemInstruction: buildStepSystemPrompt(step.description),
      messages: [{ role: 'user', content: retryPrompt }],
      temperature: retryTemp,
      signal,
      onChunk: (text) => {
        if (onChunk) onChunk(text);
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error(
      `Retry for "${step.description}" failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Update token usage (accumulate with original attempt)
  const retryTokens = estimateTokenUsage(retryPrompt, result);
  if (step.tokenUsage) {
    step.tokenUsage.promptEstimate += retryTokens.promptEstimate;
    step.tokenUsage.completionEstimate += retryTokens.completionEstimate;
    step.tokenUsage.totalEstimate += retryTokens.totalEstimate;
  } else {
    step.tokenUsage = retryTokens;
  }

  return stripCodeFences(result);
}

// IDENTITY_SEAL: PART-6 | role=StepExecution | inputs=step,context,signal,onChunk,priorContext | outputs=codeString

// ============================================================
// PART 7 — Full Autopilot Runner
// ============================================================

/**
 * Create empty metrics object.
 */
function createEmptyMetrics(): AutopilotMetrics {
  return {
    totalDurationMs: 0,
    totalTokensEstimate: 0,
    completedSteps: 0,
    failedSteps: 0,
  };
}

/**
 * Execute + validate + retry loop for a single step.
 * Tracks per-step timing (start/end timestamps).
 * Returns true on success, false on final failure.
 */
async function executeAndValidateStep(
  step: AutopilotStep,
  stepIndex: number,
  plan: AutopilotPlan,
  context: string,
  onProgress: (plan: AutopilotPlan) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const prior = buildPriorContext(plan.steps, stepIndex);

  // Record timing start
  const stepStart = Date.now();

  // 1st attempt
  const output = await executeAutopilotStep(step, context, signal, undefined, prior);
  step.output = output;

  const validation = validateStepOutput(output);
  step.validation = validation;

  // Validation passed
  if (validation.passed) {
    step.status = 'done';
    step.timing = {
      startedAt: stepStart,
      endedAt: Date.now(),
      durationMs: Date.now() - stepStart,
    };
    return true;
  }

  // Validation failed — 1 retry
  step.retried = true;
  onProgress({ ...plan, steps: [...plan.steps] });

  try {
    const retryOutput = await retryStep(
      step, context, validation.reason ?? 'Validation failed', signal, undefined, prior,
    );
    step.output = retryOutput;

    const retryValidation = validateStepOutput(retryOutput);
    step.validation = retryValidation;

    if (retryValidation.passed) {
      step.status = 'done';
      step.timing = {
        startedAt: stepStart,
        endedAt: Date.now(),
        durationMs: Date.now() - stepStart,
      };
      return true;
    }

    // Retry also failed
    step.status = 'error';
    step.output = `Retry also failed: ${retryValidation.reason ?? 'Unknown'}`;
    step.timing = {
      startedAt: stepStart,
      endedAt: Date.now(),
      durationMs: Date.now() - stepStart,
    };
    return false;
  } catch (err) {
    step.status = 'error';
    step.output = err instanceof Error ? err.message : String(err);
    step.timing = {
      startedAt: stepStart,
      endedAt: Date.now(),
      durationMs: Date.now() - stepStart,
    };
    return false;
  }
}

export async function runAutopilot(
  task: string,
  context: string,
  onProgress: (plan: AutopilotPlan) => void,
  signal?: AbortSignal,
): Promise<AutopilotPlan> {
  const startTime = Date.now();

  // Phase 1: Plan
  const plan = await createAutopilotPlan(task, context, signal);
  plan.metrics = createEmptyMetrics();
  onProgress({ ...plan });

  if (plan.status === 'error') return plan;

  // Phase 2: Execute each step sequentially
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    if (signal?.aborted) {
      step.status = 'error';
      step.output = 'Aborted';
      plan.status = 'error';
      onProgress({ ...plan, steps: [...plan.steps] });
      break;
    }

    step.status = 'running';
    onProgress({ ...plan, steps: [...plan.steps] });

    try {
      const success = await executeAndValidateStep(
        step, i, plan, context, onProgress, signal,
      );

      if (success) {
        plan.metrics!.completedSteps++;
        plan.metrics!.totalTokensEstimate += step.tokenUsage?.totalEstimate ?? Math.ceil((step.output?.length ?? 0) / 4);
      } else {
        plan.metrics!.failedSteps++;
        plan.status = 'error';
        onProgress({ ...plan, steps: [...plan.steps] });
        break;
      }
    } catch (err) {
      step.status = 'error';
      step.output = err instanceof Error ? err.message : String(err);
      plan.metrics!.failedSteps++;
      plan.status = 'error';
      onProgress({ ...plan, steps: [...plan.steps] });
      break;
    }

    onProgress({ ...plan, steps: [...plan.steps] });
  }

  // Finalize
  if (plan.status === 'executing') {
    plan.status = 'done';
  }
  plan.metrics!.totalDurationMs = Date.now() - startTime;
  onProgress({ ...plan, steps: [...plan.steps] });
  return plan;
}

// IDENTITY_SEAL: PART-7 | role=FullAutopilotRunner | inputs=task,context,onProgress,signal | outputs=AutopilotPlan

// ============================================================
// PART 8 — Resume from Step
// ============================================================

/**
 * Resume execution from a specific step index.
 * Prior steps are treated as completed; their context is reused.
 */
export async function runAutopilotFromStep(
  plan: AutopilotPlan,
  fromIndex: number,
  context: string,
  onProgress: (plan: AutopilotPlan) => void,
  signal?: AbortSignal,
): Promise<AutopilotPlan> {
  const startTime = Date.now();
  const safeFrom = Math.max(0, Math.min(fromIndex, plan.steps.length));

  if (!plan.metrics) {
    plan.metrics = createEmptyMetrics();
  }

  plan.status = 'executing';

  // Re-aggregate metrics for steps before fromIndex
  plan.metrics.completedSteps = 0;
  plan.metrics.failedSteps = 0;
  plan.metrics.totalTokensEstimate = 0;
  for (let i = 0; i < safeFrom; i++) {
    const s = plan.steps[i];
    if (s.status === 'done') {
      plan.metrics.completedSteps++;
      plan.metrics.totalTokensEstimate += s.tokenUsage?.totalEstimate ?? Math.ceil((s.output?.length ?? 0) / 4);
    }
  }

  // Reset steps from fromIndex onward
  for (let i = safeFrom; i < plan.steps.length; i++) {
    plan.steps[i].status = 'pending';
    plan.steps[i].output = undefined;
    plan.steps[i].validation = undefined;
    plan.steps[i].retried = undefined;
    plan.steps[i].timing = undefined;
    plan.steps[i].tokenUsage = undefined;
  }

  onProgress({ ...plan, steps: [...plan.steps] });

  for (let i = safeFrom; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    if (signal?.aborted) {
      step.status = 'error';
      step.output = 'Aborted';
      plan.status = 'error';
      onProgress({ ...plan, steps: [...plan.steps] });
      break;
    }

    step.status = 'running';
    onProgress({ ...plan, steps: [...plan.steps] });

    try {
      const success = await executeAndValidateStep(
        step, i, plan, context, onProgress, signal,
      );

      if (success) {
        plan.metrics!.completedSteps++;
        plan.metrics!.totalTokensEstimate += step.tokenUsage?.totalEstimate ?? Math.ceil((step.output?.length ?? 0) / 4);
      } else {
        plan.metrics!.failedSteps++;
        plan.status = 'error';
        onProgress({ ...plan, steps: [...plan.steps] });
        break;
      }
    } catch (err) {
      step.status = 'error';
      step.output = err instanceof Error ? err.message : String(err);
      plan.metrics!.failedSteps++;
      plan.status = 'error';
      onProgress({ ...plan, steps: [...plan.steps] });
      break;
    }

    onProgress({ ...plan, steps: [...plan.steps] });
  }

  if (plan.status === 'executing') {
    plan.status = 'done';
  }
  plan.metrics!.totalDurationMs += Date.now() - startTime;
  onProgress({ ...plan, steps: [...plan.steps] });
  return plan;
}

// IDENTITY_SEAL: PART-8 | role=ResumeFromStep | inputs=plan,fromIndex,context,onProgress,signal | outputs=AutopilotPlan

// ============================================================
// PART 9 — Utilities
// ============================================================

/** Strip markdown code fences (```...```) if wrapping the output */
function stripCodeFences(code: string): string {
  const trimmed = code.trim();
  const fenceMatch = trimmed.match(/^```[\w]*\n([\s\S]*?)\n```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

// IDENTITY_SEAL: PART-9 | role=Utilities | inputs=code | outputs=strippedCode
