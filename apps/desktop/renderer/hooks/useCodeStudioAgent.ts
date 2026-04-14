// ============================================================
// Code Studio — Agent Hook
// Run agent pipeline, track progress, abort, get results,
// confidence scores.
// ============================================================

import { useState, useCallback, useRef } from 'react';
import {
  runAgentPipeline,
  createAgentSession,
  type AgentMessage,
  type AgentSession,
  type AgentRole,
} from '@/lib/code-studio/ai/agents';
import { ALL_AGENT_ROLES } from '@/types/code-studio-agent';

export interface AgentProgress {
  currentRole: AgentRole | null;
  completedRoles: AgentRole[];
  totalRoles: number;
  percent: number;
}

interface UseCodeStudioAgentReturn {
  running: boolean;
  progress: AgentProgress;
  messages: AgentMessage[];
  session: AgentSession | null;
  averageConfidence: number;
  run: (instruction: string, context?: string, roles?: AgentRole[]) => Promise<AgentSession>;
  abort: () => void;
  reset: () => void;
}

/** Runs the multi-role agent pipeline with progress tracking and abort */
export function useCodeStudioAgent(): UseCodeStudioAgentReturn {
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [progress, setProgress] = useState<AgentProgress>({
    currentRole: null,
    completedRoles: [],
    totalRoles: ALL_AGENT_ROLES.length,
    percent: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (instruction: string, context?: string, roles?: AgentRole[]): Promise<AgentSession> => {
    if (running) throw new Error('Agent pipeline already running');

    const activeRoles = roles ?? ALL_AGENT_ROLES;
    setRunning(true);
    setMessages([]);
    setProgress({ currentRole: null, completedRoles: [], totalRoles: activeRoles.length, percent: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    const newSession = createAgentSession(instruction, activeRoles);
    setSession(newSession);

    try {
      const onMessage = (msg: AgentMessage) => {
        setMessages((prev) => [...prev, msg]);
        setProgress((prev) => {
          const completed = [...prev.completedRoles];
          if (!completed.includes(msg.role)) completed.push(msg.role);
          return {
            currentRole: msg.role,
            completedRoles: completed,
            totalRoles: activeRoles.length,
            percent: Math.round((completed.length / activeRoles.length) * 100),
          };
        });
      };

      const result = await runAgentPipeline(
        instruction,
        context ?? '',
        activeRoles,
        onMessage,
        controller.signal,
      );
      setSession(result);
      setProgress((prev) => ({ ...prev, currentRole: null, percent: 100 }));
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Aborted by user
      }
      throw err;
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setMessages([]);
    setSession(null);
    setProgress({ currentRole: null, completedRoles: [], totalRoles: ALL_AGENT_ROLES.length, percent: 0 });
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const averageConfidence = messages.length > 0
    ? messages.reduce((sum, m) => sum + m.confidence, 0) / messages.length
    : 0;

  return {
    running,
    progress,
    messages,
    session,
    averageConfidence,
    run,
    abort,
    reset,
  };
}
