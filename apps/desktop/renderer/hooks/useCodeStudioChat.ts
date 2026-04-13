// @ts-nocheck
// ============================================================
// Code Studio — Chat Hook V2
// Best-in-class implementation with persistence, @mention context,
// and robust streaming pipeline.
// ============================================================

// ============================================================
// PART 1 — Types & Interfaces
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { streamChat, type ChatMsg } from '@/lib/ai-providers';
import { 
  saveChatSession, 
  loadChatSession, 
  listChatSessions, 
  deleteChatSession,
  type StoredChatSession,
  getStorageUsage 
} from '@/lib/code-studio/core/store';
import { DESIGN_SYSTEM_MINIMAL } from '@/lib/code-studio/core/design-system-spec';
import { extractPhysicalConstraints, buildConstraintInjection, type IntentConstraints } from '@/lib/code-studio/ai/intent-parser';
import { logger } from '@/lib/logger';
import type { FileNode } from '@eh/quill-engine/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  agentRole?: string; // e.g. 'architect', 'security'
  content: string; // display content
  rawContent?: string; // original input
  timestamp: number;
  mentions?: string[]; 
  isError?: boolean;
  confidence?: number; // 0-1
  auditInvoice?: IntentConstraints;
}

export interface SessionMetadata {
  id: string;
  title: string;
  updatedAt: number;
}

interface MessageOptions {
  regenerate?: boolean;
  skipMentions?: boolean;
  agentRole?: string;
}

interface UseCodeStudioChatOptions {
  sessionId?: string;
  systemInstruction?: string;
  autoSave?: boolean;
  tree?: FileNode[];
  onCommand?: (cmd: string, args: unknown[]) => void;
  onCodeApply?: (code: string, fileId: string) => void;
}

interface UseCodeStudioChatReturn {
  // State
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoading: boolean;
  
  // Actions
  sendMessage: (content: string, options?: MessageOptions) => Promise<void>;
  regenerate: () => Promise<void>;
  abort: () => void;
  clearHistory: () => void;
  
  // Session Management
  sessions: SessionMetadata[];
  activeSessionId: string;
  switchSession: (id: string) => Promise<void>;
  createNewSession: () => void;
  deleteSession: (id: string) => Promise<void>;
  
  // Info
  storageUsage: number; // percent
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ChatMessage,UseCodeStudioChatReturn

// ============================================================
// PART 2 — Context Agent (Mention Resolver)
// ============================================================

const MENTION_PATTERN = /@(\S+)/g;
const MAX_FILE_SIZE_CONTEXT = 30000; // ~30KB limit per mention to avoid context inflation
const MAX_HISTORY_MESSAGES = 15; // Only send last N messages to keep context window efficient

function extractMentions(content: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_PATTERN.source, MENTION_PATTERN.flags);
  while ((match = re.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

/** Resolves @mentions by fetching file content from the tree. Implements slicing for large files. */
function resolveContext(
  content: string,
  tree?: FileNode[],
): { resolved: string; mentions: string[] } {
  const mentions = extractMentions(content);
  if (mentions.length === 0 || !tree) return { resolved: content, mentions };

  let resolved = content;
  const contextBlocks: string[] = [];

  for (const m of mentions) {
    const node = findInTree(tree, m) || findByPathInTree(tree, m);
    if (node && node.type === 'file' && node.content) {
      let fileContent = node.content;
      let suffix = '';

      if (fileContent.length > MAX_FILE_SIZE_CONTEXT) {
        fileContent = fileContent.slice(0, MAX_FILE_SIZE_CONTEXT);
        suffix = `\n\n[TRUNCATED: File too large. Showing first ${MAX_FILE_SIZE_CONTEXT} chars]`;
      }

      contextBlocks.push(`--- File: ${node.name} (${node.id}) ---\n${fileContent}${suffix}\n--- End File ---`);
      // Keep the @mention in the user prompt but inject context below
    }
  }

  if (contextBlocks.length > 0) {
    resolved = `${content}\n\n[CONTEXT_INJECTED]\n${contextBlocks.join('\n\n')}`;
  }

  return { resolved, mentions };
}

function findInTree(nodes: FileNode[], idOrName: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === idOrName || node.name === idOrName) return node;
    if (node.children) {
      const found = findInTree(node.children, idOrName);
      if (found) return found;
    }
  }
  return null;
}

function findByPathInTree(nodes: FileNode[], path: string): FileNode | null {
  const parts = path.split('/');
  let current = nodes;
  for (let i = 0; i < parts.length; i++) {
    const match = current.find((n) => n.name === parts[i]);
    if (!match) return null;
    if (i === parts.length - 1) return match;
    if (!match.children) return null;
    current = match.children;
  }
  return null;
}

// IDENTITY_SEAL: PART-2 | role=MentionResolver | inputs=content,tree | outputs=resolvedContent

// ============================================================
// PART 2.5 — Error Categorization
// ============================================================

function categorizeStreamError(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  const status = e?.status ?? 0;
  const message = e?.message ?? '';
  const code = e?.code ?? '';

  // Network errors
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ERR_NETWORK'
      || message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')
      || message.includes('NetworkError') || !navigator.onLine) {
    return '[Error] Connection lost. Check your internet and try again.\n' +
           '[오류] 연결이 끊어졌습니다. 인터넷 연결을 확인하고 다시 시도하세요.';
  }

  // Auth errors
  if (status === 401 || status === 403 || message.includes('Unauthorized') || message.includes('Forbidden')
      || message.includes('invalid_api_key') || message.includes('API key')) {
    return '[Error] Invalid API key. Check Settings > AI > API Keys.\n' +
           '[오류] API 키가 유효하지 않습니다. 설정 > AI > API 키를 확인하세요.';
  }

  // Rate limit
  if (status === 429 || message.includes('rate limit') || message.includes('Too Many Requests')
      || message.includes('quota')) {
    return '[Error] Rate limit reached. Wait a moment and try again.\n' +
           '[오류] 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
  }

  // Server errors
  if (status >= 500 || message.includes('Internal Server Error') || message.includes('502')
      || message.includes('503') || message.includes('Bad Gateway')) {
    return '[Error] AI service error. Try a different provider.\n' +
           '[오류] AI 서비스 오류입니다. 다른 제공자를 시도해 보세요.';
  }

  // Timeout
  if (code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('Timeout')
      || message.includes('timed out') || message.includes('deadline')) {
    return '[Error] Request timed out. Try a shorter message.\n' +
           '[오류] 요청 시간이 초과되었습니다. 더 짧은 메시지를 시도하세요.';
  }

  // Generic fallback
  return '[Error] Something went wrong. Try again.\n' +
         '[오류] 문제가 발생했습니다. 다시 시도해 주세요.';
}

/**
 * Compute a confidence score (0.5-0.95) based on content signals.
 * - Hedging phrases lower confidence
 * - Code blocks raise confidence
 * - Structured responses (headers, lists) raise confidence
 */
function computeConfidenceScore(content: string): number {
  const MIN_SCORE = 0.5;
  const MAX_SCORE = 0.95;
  let score = 0.75; // base

  // Hedging phrases lower score
  const hedgingPatterns = [
    /\bI think\b/i, /\bmight\b/i, /\bpossibly\b/i, /\bperhaps\b/i,
    /\bprobably\b/i, /\bnot sure\b/i, /\bmaybe\b/i, /\bcould be\b/i,
    /확실하지/i, /아마/i, /것 같/i, /모르겠/i, /추측/i,
  ];
  let hedgeCount = 0;
  for (const pat of hedgingPatterns) {
    if (pat.test(content)) hedgeCount++;
  }
  score -= hedgeCount * 0.04;

  // Code blocks raise score
  const codeBlockCount = (content.match(/```[\s\S]*?```/g) ?? []).length;
  if (codeBlockCount > 0) {
    score += Math.min(0.12, codeBlockCount * 0.04);
  }

  // Structured response (headers, bullet lists) raise score
  const hasHeaders = /^#{1,4}\s/m.test(content);
  const hasBullets = /^[\-\*]\s/m.test(content);
  const hasNumberedList = /^\d+\.\s/m.test(content);
  if (hasHeaders) score += 0.03;
  if (hasBullets || hasNumberedList) score += 0.03;

  // Longer substantive responses slightly raise score
  if (content.length > 500) score += 0.02;
  if (content.length > 1500) score += 0.02;

  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
}

// IDENTITY_SEAL: PART-2.5 | role=ErrorCategorizer+ConfidenceScorer | inputs=error,content | outputs=userMessage,score

// ============================================================
// PART 3 — Core Hook Implementation
// ============================================================

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useCodeStudioChat(options: UseCodeStudioChatOptions = {}): UseCodeStudioChatReturn {
  const {
    sessionId,
    systemInstruction = `You are an expert software engineer assistant in Code Studio.\n${DESIGN_SYSTEM_MINIMAL}`,
    autoSave = true,
    tree,
    onCommand,
    onCodeApply,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(sessionId || `session-${Date.now()}`);
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [storageUsage, setStorageUsage] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // 1. Session Operations
  const refreshSessions = useCallback(async () => {
    const list = await listChatSessions();
    setSessions(list.map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })));
    const usage = await getStorageUsage();
    setStorageUsage(usage.percentUsed);
  }, []);

  const switchSession = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const session = await loadChatSession(id);
      if (session) {
        setActiveSessionId(id);
        setMessages(session.messages.map(m => ({
          id: generateId(),
          ...m
        })));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createNewSession = useCallback(() => {
    const newId = `session-${Date.now()}`;
    setActiveSessionId(newId);
    setMessages([]);
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await deleteChatSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) createNewSession();
  }, [activeSessionId, createNewSession]);

  const saveCurrentSession = useCallback(async (msgList: ChatMessage[]) => {
    if (!autoSave || msgList.length === 0) return;
    const session: StoredChatSession = {
      id: activeSessionId,
      title: msgList[0].content.slice(0, 50),
      messages: msgList.map(({ id: _id, ...rest }) => rest),
      createdAt: msgList[0].timestamp,
      updatedAt: Date.now(),
    };
    await saveChatSession(session);
    refreshSessions();
  }, [activeSessionId, autoSave, refreshSessions]);

  // 2. Messaging Pipeline
  const sendMessage = useCallback(async (content: string, msgOptions: MessageOptions = {}) => {
    if (!content.trim() || isStreaming) return;

    const { resolved, mentions } = resolveContext(content, tree);

    // Dispatch commands (e.g. /verify, /deploy) to host if handler provided
    if (resolved.startsWith('/') && onCommand) {
      const spaceIdx = resolved.indexOf(' ');
      const cmd = spaceIdx > 0 ? resolved.slice(1, spaceIdx) : resolved.slice(1);
      const args = spaceIdx > 0 ? resolved.slice(spaceIdx + 1) : '';
      onCommand(cmd, args);
    }
    
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content,
      rawContent: content,
      timestamp: Date.now(),
      mentions
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    const physicalConstraints = extractPhysicalConstraints(content);
    const constraintInjection = buildConstraintInjection(physicalConstraints.systemOverride);

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      agentRole: msgOptions.agentRole || 'coder',
      content: '',
      timestamp: Date.now(),
      auditInvoice: physicalConstraints
    };
    setMessages(prev => [...prev, assistantMsg]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history: ChatMsg[] = newMessages
        .slice(-MAX_HISTORY_MESSAGES) // sliding window optimization
        .map(m => ({
          role: m.role,
          content: m.mentions?.length ? resolveContext(m.content, tree).resolved : m.content
        }));

      await streamChat({
        systemInstruction: `${systemInstruction}\n\n${constraintInjection}`,
        messages: history,
        signal: controller.signal,
        isChatMode: true,
        onChunk: (chunk) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            }
            return prev;
          });
        }
      });
      
      // Auto-save on success + code apply callback
      setMessages(current => {
        const last = current[current.length - 1];
        if (last && last.role === 'assistant') {
           last.confidence = computeConfidenceScore(last.content);
           // Notify host of code blocks for apply-to-editor
           if (onCodeApply && /```[\s\S]+```/.test(last.content)) {
             const codeMatch = last.content.match(/```(?:\w+)?\n([\s\S]+?)```/);
             if (codeMatch) onCodeApply(codeMatch[1]);
           }
        }
        saveCurrentSession(current);
        return current;
      });

    } catch (err) {
      if (err.name === 'AbortError') return;
      logger.error('code-studio/chat', 'streamFail', err);

      const errorMessage = categorizeStreamError(err);

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last) {
          return [...prev.slice(0, -1), {
            ...last,
            content: last.content + `\n\n${errorMessage}`,
            isError: true
          }];
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, isStreaming, systemInstruction, tree, saveCurrentSession]);

  const regenerate = useCallback(async () => {
    if (messages.length < 2 || isStreaming) return;
    const lastUser = messages.filter(m => m.role === 'user').pop();
    if (!lastUser) return;
    
    // Remove last assistant message
    setMessages(prev => prev.slice(0, -1));
    await sendMessage(lastUser.content, { regenerate: true });
  }, [messages, isStreaming, sendMessage]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearHistory = useCallback(async () => {
    setMessages([]);
    try {
      const { deleteChatSession } = await import('@/lib/code-studio/core/store');
      await deleteChatSession(activeSessionId);
      refreshSessions();
    } catch {
      // IndexedDB may not be available
    }
  }, [activeSessionId, refreshSessions]);

  // 3. Lifecycle
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (sessionId && sessionId !== activeSessionId) {
      switchSession(sessionId);
    }
  }, [sessionId, switchSession, activeSessionId]);

  return {
    messages,
    isStreaming,
    isLoading,
    sendMessage,
    regenerate,
    abort,
    clearHistory,
    sessions,
    activeSessionId,
    switchSession,
    createNewSession,
    deleteSession,
    storageUsage
  };
}

// IDENTITY_SEAL: PART-3 | role=ChatHookV2 | inputs=options | outputs=messages,actions,sessions

