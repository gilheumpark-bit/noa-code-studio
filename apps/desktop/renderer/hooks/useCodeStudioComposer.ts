// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useRef, useMemo } from 'react';
import { streamChat } from '@/lib/ai-providers';
import { logger } from '@/lib/logger';
import {
  type ComposerMode,
  canTransition,
  createModeTransition,
} from '@/lib/code-studio/core/composer-state';
import { buildFileGraph, resolveChangeScope } from '@/lib/code-studio/core/dependency-analyzer';
import { generatePlan, type CompositionPlan } from '@/lib/code-studio/ai/composer-planner';
import { snapshotManager, type Snapshot } from '@/lib/code-studio/core/snapshot-manager';

export type { ComposerMode } from '@/lib/code-studio/core/composer-state';
export { canTransition, createModeTransition } from '@/lib/code-studio/core/composer-state';

export interface ComposerChange {
  fileId: string;
  fileName: string;
  original: string;
  modified: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface UseCodeStudioComposerReturn {
  /** Current state-machine mode */
  mode: ComposerMode;
  /** Guarded transition — returns false on invalid transition */
  transitionMode: (next: ComposerMode) => boolean;
  /** Backward-compat: true when mode is 'generating' */
  composing: boolean;
  changes: ComposerChange[];
  compose: (
    fileIds: string[],
    instruction: string,
    getContent: (id: string) => string | null,
    getFileName: (id: string) => string,
  ) => Promise<void>;
  accept: (fileId: string) => void;
  reject: (fileId: string) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  getAccepted: () => ComposerChange[];
  abort: () => void;
  reset: () => void;
  /** Multi-file composition with planning + dependency analysis + snapshots */
  plan: CompositionPlan | null;
  snapshot: Snapshot | null;
  composeMulti: (
    fileIds: string[],
    instruction: string,
    getContent: (id: string) => string | null,
    getFileName: (id: string) => string,
    options?: { withPlanning?: boolean },
  ) => Promise<void>;
  rollback: (writeContent: (fileId: string, content: string) => void) => { restoredCount: number } | null;
}

// IDENTITY_SEAL: PART-1 | role=types-and-imports | inputs=none | outputs=interfaces

// ============================================================
// PART 2 — Hook Implementation
// ============================================================

/** State-machine-driven code composition hook: generate diffs, review, accept/reject changes with guarded transitions */
export function useCodeStudioComposer(): UseCodeStudioComposerReturn {
  const [mode, setMode] = useState<ComposerMode>('idle');
  const [changes, setChanges] = useState<ComposerChange[]>([]);
  const [plan, setPlan] = useState<CompositionPlan | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Guarded transition derived from current mode
  const transitionMode = useMemo(
    () => createModeTransition(mode, setMode),
    [mode],
  );

  // Backward-compat derived state
  const composing = mode === 'generating';

  const compose = useCallback(async (
    fileIds: string[],
    instruction: string,
    getContent: (id: string) => string | null,
    getFileName: (id: string) => string,
  ) => {
    // Guard: only idle → generating is valid
    if (!canTransition(mode, 'generating')) {
      logger.warn('Composer', `Cannot start composing from mode "${mode}"`);
      return;
    }
    setMode('generating');
    setChanges([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const results: ComposerChange[] = [];

      for (const fileId of fileIds) {
        if (controller.signal.aborted) break;

        const original = getContent(fileId);
        if (original == null) continue;

        const fileName = getFileName(fileId);
        let modified = '';

        // Default: fast path (no calc). The strict calc protocol is injected on demand
        // by apply-boundary diff-guard failures (soft gate + override flow).
        const systemPrompt = [
          'You are a code editor. Apply the user\'s instruction to the provided file.',
          'Output ONLY the modified file content, nothing else.',
          `File: ${fileName}`,
        ].join('\n');

        await streamChat({
          systemInstruction: systemPrompt,
          messages: [
            { role: 'user', content: `Instruction: ${instruction}\n\n---\n\n${original}` },
          ],
          signal: controller.signal,
          onChunk: (chunk) => {
            modified += chunk;
          },
        });

        results.push({
          fileId,
          fileName,
          original,
          modified: modified.trim(),
          status: 'pending',
        });

        setChanges([...results]);
      }

      // generating → verifying (auto-transition after successful generation)
      setMode('verifying');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User-initiated abort — back to idle
        setMode('idle');
      } else {
        // Non-abort error → error state
        setMode('error');
      }
    } finally {
      abortRef.current = null;
    }
  }, [mode]);

  // IDENTITY_SEAL: PART-2 | role=compose-flow | inputs=fileIds,instruction | outputs=changes,mode

  // ============================================================
  // PART 3 — Change Accept/Reject & Utilities
  // ============================================================

  const updateStatus = useCallback((fileId: string, status: 'accepted' | 'rejected') => {
    setChanges((prev) => prev.map((c) => (c.fileId === fileId ? { ...c, status } : c)));
  }, []);

  const accept = useCallback((fileId: string) => updateStatus(fileId, 'accepted'), [updateStatus]);
  const reject = useCallback((fileId: string) => updateStatus(fileId, 'rejected'), [updateStatus]);

  const acceptAll = useCallback(() => {
    setChanges((prev) => prev.map((c) => (c.status === 'pending' ? { ...c, status: 'accepted' } : c)));
  }, []);

  const rejectAll = useCallback(() => {
    setChanges((prev) => prev.map((c) => (c.status === 'pending' ? { ...c, status: 'rejected' } : c)));
  }, []);

  const getAccepted = useCallback((): ComposerChange[] => {
    return changes.filter((c) => c.status === 'accepted');
  }, [changes]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setChanges([]);
    setPlan(null);
    setSnapshot(null);
    setMode('idle');
  }, []);

  // ============================================================
  // PART 4 — Multi-file composition with planning
  // ============================================================

  const composeMulti = useCallback(async (
    fileIds: string[],
    instruction: string,
    getContent: (id: string) => string | null,
    getFileName: (id: string) => string,
    options?: { withPlanning?: boolean },
  ) => {
    if (!canTransition(mode, 'generating')) {
      logger.warn('Composer', `Cannot start multi-compose from mode "${mode}"`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1. Build dependency graph + resolve scope
      const graph = buildFileGraph(fileIds, getContent, getFileName);
      const scope = resolveChangeScope(graph, fileIds);

      // 2. Generate plan (optional)
      let compositionPlan: CompositionPlan | null = null;
      if (options?.withPlanning) {
        const fileContents = new Map<string, { id: string; name: string; content: string }>();
        for (const id of scope.executionOrder) {
          const content = getContent(id);
          if (content) fileContents.set(id, { id, name: getFileName(id), content });
        }
        compositionPlan = await generatePlan(instruction, scope, fileContents, controller.signal);
        setPlan(compositionPlan);
      }

      // 3. Create snapshot for rollback
      const snap = await snapshotManager.create(scope.executionOrder, getContent, instruction);
      setSnapshot(snap);

      // 4. Generate changes in topological order
      setMode('generating');
      setChanges([]);
      const results: ComposerChange[] = [];
      const priorChangeSummaries: string[] = [];

      for (const fileId of scope.executionOrder) {
        if (controller.signal.aborted) break;

        const original = getContent(fileId);
        if (original == null) continue;

        const fileName = getFileName(fileId);
        const planStep = compositionPlan?.steps.find((s) => s.fileId === fileId);

        // Build prompt with cross-file context
        const contextBlock = priorChangeSummaries.length > 0
          ? `\n\nPreviously modified files in this session:\n${priorChangeSummaries.join('\n')}\n`
          : '';

        const stepDescription = planStep
          ? `\nPlan step: ${planStep.description}`
          : '';

        const systemPrompt = [
          'You are a code editor performing a multi-file refactoring.',
          'Output ONLY the modified file content, nothing else.',
          `File: ${fileName}`,
          stepDescription,
          contextBlock,
        ].join('\n');

        let modified = '';
        await streamChat({
          systemInstruction: systemPrompt,
          messages: [
            { role: 'user', content: `Instruction: ${instruction}\n\n---\n\n${original}` },
          ],
          signal: controller.signal,
          onChunk: (chunk) => { modified += chunk; },
        });

        const trimmed = modified.trim();
        results.push({ fileId, fileName, original, modified: trimmed, status: 'pending' });
        setChanges([...results]);

        // Track summary for cross-file context
        const diffSummary = trimmed.length !== original.length
          ? `- ${fileName}: modified (${original.length} → ${trimmed.length} chars)`
          : `- ${fileName}: checked (no changes)`;
        priorChangeSummaries.push(diffSummary);
      }

      setMode('verifying');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMode('idle');
      } else {
        setMode('error');
      }
    } finally {
      abortRef.current = null;
    }
  }, [mode]);

  const rollback = useCallback((writeContent: (fileId: string, content: string) => void) => {
    if (!snapshot) return null;
    const result = snapshotManager.rollback(snapshot, writeContent);
    setSnapshot(null);
    setPlan(null);
    setChanges([]);
    setMode('idle');
    return result;
  }, [snapshot]);

  return {
    mode,
    transitionMode,
    composing,
    changes,
    compose,
    accept,
    reject,
    acceptAll,
    rejectAll,
    getAccepted,
    abort,
    reset,
    plan,
    snapshot,
    composeMulti,
    rollback,
  };
}

// IDENTITY_SEAL: PART-3 | role=change-management | inputs=changes | outputs=accepted/rejected
