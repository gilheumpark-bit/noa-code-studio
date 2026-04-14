"use client";

/**
 * @module CollabPanel
 *
 * SIMULATED -- requires WebContainer/real backend for production use.
 *
 * What is simulated:
 *   - Multi-user presence uses BroadcastChannel (same browser only;
 *     different browsers/devices cannot connect to each other)
 *   - Cursor position sharing is UI-only (no real editor binding)
 *   - Room IDs are random UUIDs with no server-side persistence
 *   - Chat messages are ephemeral (lost on page reload)
 *   - Session restore reads from the collaboration manager's local storage
 *
 * What is real:
 *   - Room create/join flow with shareable URL generation
 *   - Real-time chat between tabs in the same browser via BroadcastChannel
 *   - User presence list with color-coded avatars
 *   - Session persistence/restore via collaboration manager
 *   - Clipboard copy of share URL
 *
 * To make fully functional:
 *   1. Replace BroadcastChannel with a WebSocket server (e.g., Socket.IO)
 *   2. Integrate Yjs or Automerge for CRDT-based conflict-free editing
 *   3. Bind cursor/selection state to the Monaco editor instance
 *   4. Add authentication and user identity (Firebase Auth, OAuth)
 *   5. Persist chat history and room state on the server
 *   6. Support cross-browser and cross-device collaboration
 */

// ⚠️ SIMULATED PANEL — 실제 WebSocket/Yjs 협업 없음.
// 로컬 시뮬레이션 UI. 실시간 협업은 WebSocket 서버 연동 시 전환 가능.

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Users, Copy, LogIn, LogOut, Send, MessageSquare,
  Plus, Link, ChevronDown, ChevronRight, Circle,
} from "lucide-react";
import {
  createCollaborationManager,
  restoreSession,
  clearSession,
  type CollabUser as ManagerCollabUser,
  type CollaborationManager,
} from "@/lib/code-studio/features/collaboration";
import { useCodeStudioT } from "@/lib/use-code-studio-translations";

interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { file: string; line: number; column: number };
}

interface ChatEntry {
  id: string;
  userId: string;
  userName: string;
  color: string;
  message: string;
  timestamp: number;
}

interface Props {
  onClose?: () => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=CollabUser,ChatEntry,Props

// ============================================================
// PART 2 — Simulated Collaboration State
// ============================================================

function generateUserId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function generateColor(): string {
  return `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
}

// IDENTITY_SEAL: PART-2 | role=Helpers | inputs=none | outputs=id,color

// ============================================================
// PART 3 — Component
// ============================================================

export default function CollabPanel({ onClose }: Props) {
  const t = useCodeStudioT();
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [userName, setUserName] = useState(() => `User-${Math.random().toString(36).slice(2, 6)}`);
  const [localUser] = useState<CollabUser>(() => ({ id: generateUserId(), name: userName, color: generateColor() }));
  const [remoteUsers, setRemoteUsers] = useState<CollabUser[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showUsers, setShowUsers] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CollaborationManager | null>(null);
  /** Resolves chat display names for remote userIds (BroadcastChannel has no built-in name on chat events). */
  const peerNamesRef = useRef<Record<string, string>>({});

  /** Wire CollaborationManager event listeners onto React state. */
  const attachListeners = useCallback((mgr: CollaborationManager) => {
    mgr.onUserJoin((user: ManagerCollabUser) => {
      peerNamesRef.current[user.id] = user.name;
      setRemoteUsers((prev) =>
        prev.some((u) => u.id === user.id)
          ? prev
          : [...prev, {
              id: user.id,
              name: user.name,
              color: user.color,
              cursor: user.cursor
                ? { file: user.cursor.file ?? "", line: user.cursor.line ?? 0, column: user.cursor.column ?? 0 }
                : undefined,
            }],
      );
    });
    mgr.onUserLeave((userId: string) => {
      delete peerNamesRef.current[userId];
      setRemoteUsers((prev) => prev.filter((u) => u.id !== userId));
    });
    mgr.onChatReceived((userId: string, message: string) => {
      const resolvedName = peerNamesRef.current[userId] ?? `Peer ${userId.slice(0, 6)}`;
      const hue = userId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
      const color = `hsl(${hue}, 65%, 65%)`;
      setChatMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        userId,
        userName: resolvedName,
        color,
        message,
        timestamp: Date.now(),
      }]);
    });
    mgr.onCursorUpdate((userId: string, cursor) => {
      if (!cursor) return;
      setRemoteUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, cursor: { file: cursor.file, line: cursor.line, column: cursor.column } }
            : u,
        ),
      );
    });
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  /* Auto-restore a previous session on mount */
  useEffect(() => {
    const saved = restoreSession();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoomId(saved.roomId);
      setUserName(saved.userName);
      const mgr = createCollaborationManager(saved.roomId, saved.userName);
      managerRef.current = mgr;
      mgr.join();
      setConnected(true);
      attachListeners(mgr);
    }
    return () => {
      managerRef.current?.leave();
      managerRef.current = null;
    };
  }, [attachListeners]);

  const createRoom = useCallback(() => {
    const id = crypto.randomUUID().slice(0, 8);
    setRoomId(id);
    setConnected(true);
    setRemoteUsers([]);
    const mgr = createCollaborationManager(id, userName);
    managerRef.current = mgr;
    mgr.join();
    attachListeners(mgr);
  }, [userName, attachListeners]);

  const joinRoom = useCallback(() => {
    if (!roomInput.trim()) return;
    const id = roomInput.trim();
    setRoomId(id);
    setConnected(true);
    setRoomInput("");
    setRemoteUsers([]);
    const mgr = createCollaborationManager(id, userName);
    managerRef.current = mgr;
    mgr.join();
    attachListeners(mgr);
  }, [roomInput, userName, attachListeners]);

  const leaveRoom = useCallback(() => {
    managerRef.current?.leave();
    managerRef.current = null;
    clearSession();
    setConnected(false);
    setRoomId("");
    setRemoteUsers([]);
    setChatMessages([]);
  }, []);

  const copyShareUrl = useCallback(() => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/code-studio?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [roomId]);

  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    setChatMessages((prev) => [...prev, {
      id: crypto.randomUUID(), userId: localUser.id, userName: localUser.name,
      color: localUser.color, message: chatInput.trim(), timestamp: Date.now(),
    }]);
    managerRef.current?.broadcastChat(chatInput.trim());
    setChatInput("");
  }, [chatInput, localUser]);

  if (!connected) {
    return (
      <div className="flex flex-col h-full bg-[#0a0e17] text-white text-[13px]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-[#0f1419] text-[12px] font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><Users size={14} /> 협업 <span className="ml-1 rounded bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-normal normal-case tracking-normal text-amber-300">(시뮬레이션)</span></span>
          {onClose && <button onClick={onClose} className="text-white/60 hover:text-white">&times;</button>}
        </div>
        <div className="p-3 border-b border-white/8">
          <label className="text-[11px] text-white/50 mb-1 block">사용자 이름</label>
          <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="이름 입력..."
            className="w-full bg-[#0a0e17] border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono outline-none" />
        </div>
        <div className="p-3 border-b border-white/8">
          <button onClick={createRoom} className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-800 text-stone-100 text-xs rounded hover:bg-amber-700 transition-colors">
            <Plus size={14} /> 방 만들기
          </button>
        </div>
        <div className="p-3 border-b border-white/8">
          <label className="text-[11px] text-white/50 mb-1 block">방 참가</label>
          <div className="flex gap-1">
            <input value={roomInput} onChange={(e) => setRoomInput(e.target.value)} placeholder={t.collabRoomPlaceholder}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              className="flex-1 bg-[#0a0e17] border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono outline-none" />
            <button onClick={joinRoom} className="flex items-center gap-1 px-3 py-1.5 bg-amber-800 text-stone-100 text-xs rounded hover:bg-amber-700">
              <LogIn size={14} /> 참가
            </button>
          </div>
        </div>
        <div className="p-4 text-center text-[11px] text-white/50">실시간 코드 협업을 위한 공유 세션을 만드세요</div>
      </div>
    );
  }

  const allUsers = [localUser, ...remoteUsers];

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] text-white text-[13px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-[#0f1419] text-[12px] font-semibold uppercase tracking-wider">
        <span className="flex items-center gap-1.5"><Users size={14} /> 협업 <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /><span className="ml-1 rounded bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-normal normal-case tracking-normal text-amber-300">(시뮬레이션)</span></span>
        {onClose && <button onClick={onClose} className="text-white/60 hover:text-white">&times;</button>}
      </div>

      <div className="p-3 border-b border-white/8">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-white/50">{t.collabRoomIdLabel}</span>
          <button onClick={leaveRoom} className="flex items-center gap-1 text-[10px] text-white/50 hover:text-red-400 border border-white/10 rounded px-2 py-0.5">
            <LogOut size={12} /> 나가기
          </button>
        </div>
        <div className="flex gap-1 items-center">
          <code className="flex-1 bg-[#161b22] px-2 py-1 rounded text-xs font-mono text-amber-400">{roomId}</code>
          <button onClick={copyShareUrl} className="flex items-center gap-1 text-[10px] border border-white/10 rounded px-2 py-1 text-white/50 hover:text-white">
            <Copy size={12} />{copied ? " 복사됨" : ""}
          </button>
        </div>
        <div className="text-[10px] text-white/50 mt-1 flex items-center gap-1">
          <Link size={10} /> {typeof window !== "undefined" ? window.location.origin : ""}/code-studio?room={roomId}
        </div>
        <p className="text-[10px] text-amber-200/70 mt-2 leading-snug">
          같은 브라우저의 탭 간만 동기화됩니다(BroadcastChannel). 다른 기기·브라우저와는 연결되지 않습니다.
        </p>
      </div>

      <div className="p-3 border-b border-white/8">
        <button onClick={() => setShowUsers(!showUsers)} className="flex items-center gap-1 text-[12px] font-semibold text-white mb-1.5">
          {showUsers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          접속 ({allUsers.length})
        </button>
        {showUsers && allUsers.map((user) => (
          <div key={user.id} className={`flex items-center gap-2 px-1.5 py-1 rounded ${user.id === localUser.id ? "bg-white/5" : ""}`}>
            <Circle size={10} fill={user.color} stroke={user.color} />
            <span className="flex-1 text-xs">{user.name}{user.id === localUser.id && <span className="text-white/60 text-[10px] ml-1">(나)</span>}</span>
            {user.cursor && <span className="text-[10px] text-white/50 font-mono">{user.cursor.file.split("/").pop()}:{user.cursor.line}</span>}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-h-0 border-t border-white/8">
        <button onClick={() => setShowChat(!showChat)} className="flex items-center gap-1 px-3 py-2 text-[12px] font-semibold text-white">
          {showChat ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <MessageSquare size={14} /> 채팅
        </button>
        {showChat && (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 min-h-[100px]">
              {chatMessages.length === 0 && <div className="text-center text-[11px] text-white/50 py-4">메시지가 없습니다</div>}
              {chatMessages.map((msg) => (
                <div key={msg.id} className="text-xs">
                  <span style={{ color: msg.color }} className="font-semibold">{msg.userName}</span>
                  <span className="text-white/50 text-[10px] ml-1.5">{new Date(msg.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="text-white/80 mt-0.5 pl-0.5">{msg.message}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-1 px-3 py-1.5 border-t border-white/8">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="메시지 입력..." className="flex-1 bg-[#0a0e17] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none" />
              <button onClick={sendChat} disabled={!chatInput.trim()} className="px-2 py-1 bg-amber-800 text-stone-100 rounded text-xs hover:bg-amber-700 disabled:opacity-30">
                <Send size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=Component | inputs=Props | outputs=JSX
