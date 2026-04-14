"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Plus, Brain, Users, Loader2, X } from "lucide-react";
import { type AgentRole, AGENT_REGISTRY, ALL_AGENT_ROLES } from "@/types/code-studio-agent";
import { useCodeStudioT } from "@/lib/use-code-studio-translations";

export interface WorkspaceThread {
  id: string;
  title: string;
  persona: AgentRole;
  messages: WorkspaceMessage[];
  createdAt: number;
}

export interface WorkspaceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface SharedMemoryEntry {
  key: string;
  value: string;
  source: AgentRole;
  timestamp: number;
}

interface AIWorkspaceProps {
  threads: WorkspaceThread[];
  sharedMemory: SharedMemoryEntry[];
  onSendMessage: (threadId: string, message: string) => Promise<string>;
  onCreateThread: (persona: AgentRole) => void;
  onDeleteThread: (threadId: string) => void;
  onAddMemory?: (key: string, value: string) => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=WorkspaceThread,SharedMemoryEntry

// ============================================================
// PART 2 — Thread List Sidebar
// ============================================================

const CATEGORY_COLORS: Record<string, string> = {
  leadership: "#f59e0b", // amber
  generation: "#3b82f6", // blue
  verification: "#eab308", // yellow
  repair: "#10b981", // green
};

function getPersonaColor(role: AgentRole) {
  const meta = AGENT_REGISTRY[role];
  return meta ? CATEGORY_COLORS[meta.category] : "#ec4899";
}

function ThreadList({
  threads,
  activeId,
  onSelect,
  onDelete,
  onCreate,
}: {
  threads: WorkspaceThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  const t = useCodeStudioT();
  return (
    <div className="w-48 shrink-0 border-r border-white/5 bg-[#12121a] flex flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-2 py-2">
        <span className="text-xs font-bold text-gray-500 uppercase">{t.aiThreads}</span>
        <button onClick={onCreate} className="text-gray-500 hover:text-white" title={t.aiNewThread}>
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs ${
              t.id === activeId ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
            }`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: getPersonaColor(t.persona) }} />
            <span className="flex-1 truncate">{t.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=ThreadList | inputs=threads,activeId | outputs=JSX

// ============================================================
// PART 3 — Chat Area
// ============================================================

function ChatArea({
  thread,
  onSend,
  sending,
}: {
  thread: WorkspaceThread | null;
  onSend: (msg: string) => void;
  sending: boolean;
}) {
  const t = useCodeStudioT();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  const handleSubmit = () => {
    if (!input.trim() || sending) return;
    onSend(input.trim());
    setInput("");
  };

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        <div className="text-center">
          <Users size={32} className="mx-auto mb-2 text-gray-600" />
          <p>{t.aiSelectThread}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getPersonaColor(thread.persona) }} />
        <span className="text-sm font-medium text-white">{thread.title}</span>
        <span className="text-[10px] text-gray-500">
          {AGENT_REGISTRY[thread.persona]?.name || thread.persona}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {thread.messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600/20 text-blue-100"
                  : "bg-white/5 text-gray-300"
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={12} className="animate-spin" /> {t.aiThinking}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/5 p-2">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            placeholder={t.aiMsgPlaceholder}
            className="flex-1 rounded border border-white/10 bg-[#12121a] px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-white/50"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || sending}
            className="rounded bg-blue-600 p-1.5 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=ChatArea | inputs=thread,sending | outputs=JSX

// ============================================================
// PART 4 — Shared Memory Sidebar
// ============================================================

function SharedMemoryPanel({ entries }: { entries: SharedMemoryEntry[] }) {
  const t = useCodeStudioT();
  if (entries.length === 0) return null;
  return (
    <div className="w-44 shrink-0 border-l border-white/5 bg-[#12121a] overflow-y-auto">
      <div className="border-b border-white/5 px-2 py-2">
        <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
          <Brain size={12} /> {t.aiSharedMemory}
        </span>
      </div>
      {entries.map((e) => (
        <div key={e.key} className="border-b border-white/5 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getPersonaColor(e.source) }} />
            <span>{e.key}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{e.value}</div>
        </div>
      ))}
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=SharedMemory | inputs=SharedMemoryEntry[] | outputs=JSX

// ============================================================
// PART 5 — Main Component
// ============================================================

export default function AIWorkspace({
  threads,
  sharedMemory,
  onSendMessage,
  onCreateThread,
  onDeleteThread,
}: AIWorkspaceProps) {
  const t = useCodeStudioT();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threads[0]?.id ?? null);
  const [sending, setSending] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const handleSend = useCallback(
    async (msg: string) => {
      if (!activeThreadId) return;
      setSending(true);
      try {
        await onSendMessage(activeThreadId, msg);
      } finally {
        setSending(false);
      }
    },
    [activeThreadId, onSendMessage],
  );

  const roles: AgentRole[] = ALL_AGENT_ROLES;

  const personaLabel = (r: AgentRole) => AGENT_REGISTRY[r].name;

  return (
    <div className="flex h-full bg-[#16161e]">
      <ThreadList
        threads={threads}
        activeId={activeThreadId}
        onSelect={setActiveThreadId}
        onDelete={onDeleteThread}
        onCreate={() => setShowNewThread(true)}
      />
      <ChatArea thread={activeThread} onSend={handleSend} sending={sending} />
      <SharedMemoryPanel entries={sharedMemory} />

      {/* New thread modal */}
      {showNewThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewThread(false)}>
          <div className="w-64 rounded-xl border border-white/10 bg-[#1e1e2e] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-medium text-white">{t.aiSelectPersona}</h3>
            <div className="space-y-1">
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => { onCreateThread(r); setShowNewThread(false); }}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getPersonaColor(r) }} />
                  {personaLabel(r)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-5 | role=AIWorkspaceUI | inputs=threads,sharedMemory | outputs=JSX
