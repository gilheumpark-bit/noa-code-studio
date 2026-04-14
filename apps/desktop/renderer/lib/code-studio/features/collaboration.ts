// ============================================================
// PART 1 — Types & Interfaces
// ============================================================
// Real-time collaboration for EH Universe Code Studio.
// Combines CRDT document, cursor trails, activity feed, typing
// indicators, and BroadcastChannel-based sync into one module.

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { file: string; line: number; column: number };
  selection?: { file: string; startLine: number; endLine: number };
  isOnline: boolean;
  lastSeen: number;
  activeFile?: string;
  avatar?: string;
}

export interface CollabState {
  roomId: string;
  users: CollabUser[];
  localUser: CollabUser;
  isConnected: boolean;
  connectionType: "local" | "network";
}

export interface CollabMessage {
  type: "cursor" | "selection" | "edit" | "file-open" | "chat" | "join" | "leave" | "typing" | "activity" | "crdt-op" | "cursor-update" | "user-join" | "user-leave";
  userId: string;
  payload: unknown;
  timestamp: number;
}

// IDENTITY_SEAL: PART-1 | role=타입 정의 | inputs=none | outputs=CollabUser, CollabState, CollabMessage

// ============================================================
// PART 2 — CRDT Document (Operation-based)
// ============================================================

export interface CRDTId {
  site: string;
  clock: number;
  position: number[];
}

export interface CRDTChar {
  id: CRDTId;
  value: string;
  deleted: boolean;
}

export interface CRDTOperation {
  type: "insert" | "delete";
  id: CRDTId;
  value?: string;
  after?: CRDTId | null;
  origin: string;
  timestamp: number;
}

export interface VectorClock {
  [siteId: string]: number;
}

export class CRDTDocument {
  private chars: CRDTChar[] = [];
  private clock = 0;
  private vectorClock: VectorClock = {};
  private operationLog: CRDTOperation[] = [];
  private charIndex = new Map<string, number>(); // O(1) lookup index (#7)
  readonly siteId: string;

  constructor(siteId: string) {
    this.siteId = siteId;
    this.vectorClock[siteId] = 0;
  }

  insert(index: number, value: string): CRDTOperation[] {
    const ops: CRDTOperation[] = [];
    for (let i = 0; i < value.length; i++) {
      this.clock++;
      this.vectorClock[this.siteId] = this.clock;
      const position = this.generatePosition(index + i);
      const id: CRDTId = { site: this.siteId, clock: this.clock, position };
      const afterId = index + i > 0 ? this.getVisibleCharAt(index + i - 1)?.id ?? null : null;
      const op: CRDTOperation = { type: "insert", id, value: value[i], after: afterId, origin: this.siteId, timestamp: this.clock };
      this.applyInsert(op);
      ops.push(op);
      this.operationLog.push(op);
    }
    return ops;
  }

  delete(index: number, length: number): CRDTOperation[] {
    const ops: CRDTOperation[] = [];
    for (let i = 0; i < length; i++) {
      const char = this.getVisibleCharAt(index);
      if (!char) break;
      this.clock++;
      this.vectorClock[this.siteId] = this.clock;
      const op: CRDTOperation = { type: "delete", id: char.id, origin: this.siteId, timestamp: this.clock };
      this.applyDelete(op);
      ops.push(op);
      this.operationLog.push(op);
    }
    return ops;
  }

  applyRemote(op: CRDTOperation): boolean {
    this.vectorClock[op.origin] = Math.max(this.vectorClock[op.origin] ?? 0, op.timestamp);
    this.clock = Math.max(this.clock, op.timestamp);
    return op.type === "insert" ? this.applyInsert(op) : this.applyDelete(op);
  }

  getText(): string {
    return this.chars.filter((c) => !c.deleted).map((c) => c.value).join("");
  }

  visibleLength(): number {
    return this.chars.filter((c) => !c.deleted).length;
  }

  getVectorClock(): VectorClock { return { ...this.vectorClock }; }

  getOperationsSince(remoteClock: VectorClock): CRDTOperation[] {
    return this.operationLog.filter((op) => op.timestamp > (remoteClock[op.origin] ?? 0));
  }

  getOperationLog(): CRDTOperation[] {
    return [...this.operationLog];
  }

  getOperationCount(): number {
    return this.operationLog.length;
  }

  /**
   * Tombstone compression: removes redundant insert->delete pairs from
   * the operation log and the char array after every COMPACT_THRESHOLD ops.
   * Only compacts chars that are both (a) tombstoned and (b) not referenced
   * by any surviving insert's `after` pointer, to preserve CRDT consistency.
   */
  compactTombstones(): number {
    const deletedIds = new Set<string>();
    for (const op of this.operationLog) {
      if (op.type === "delete") deletedIds.add(this.charIndexKey(op.id));
    }
    if (deletedIds.size === 0) return 0;

    // Collect `after` references that surviving inserts still depend on
    const referencedIds = new Set<string>();
    for (const op of this.operationLog) {
      if (op.type === "insert" && op.after && !deletedIds.has(this.charIndexKey(op.id))) {
        referencedIds.add(this.charIndexKey(op.after));
      }
    }

    // Only compact tombstones that nothing references
    const removableIds = new Set<string>();
    Array.from(deletedIds).forEach((key) => {
      if (!referencedIds.has(key)) removableIds.add(key);
    });
    if (removableIds.size === 0) return 0;

    // Remove from char array
    this.chars = this.chars.filter(
      (c) => !(c.deleted && removableIds.has(this.charIndexKey(c.id))),
    );

    // Remove matching insert+delete pairs from operation log
    this.operationLog = this.operationLog.filter((op) => {
      const key = this.charIndexKey(op.id);
      if (removableIds.has(key)) return false; // drop both insert and delete
      return true;
    });

    this.rebuildCharIndex();
    return removableIds.size;
  }

  serialize(): { chars: CRDTChar[]; clock: number; vectorClock: VectorClock } {
    return { chars: this.chars.map((c) => ({ ...c })), clock: this.clock, vectorClock: { ...this.vectorClock } };
  }

  static deserialize(siteId: string, data: { chars: CRDTChar[]; clock: number; vectorClock: VectorClock }): CRDTDocument {
    const doc = new CRDTDocument(siteId);
    doc.chars = data.chars.map((c) => ({ ...c }));
    doc.clock = Math.max(doc.clock, data.clock);
    for (const [site, clock] of Object.entries(data.vectorClock)) {
      doc.vectorClock[site] = Math.max(doc.vectorClock[site] ?? 0, clock);
    }
    return doc;
  }

  // ── Private ──

  private applyInsert(op: CRDTOperation): boolean {
    if (this.findCharById(op.id) !== -1) return false;
    const char: CRDTChar = { id: op.id, value: op.value!, deleted: false };
    if (!op.after) {
      const idx = this.findInsertPosition(0, op.id);
      this.chars.splice(idx, 0, char);
    } else {
      const afterIdx = this.findCharById(op.after);
      if (afterIdx === -1) { this.chars.push(char); }
      else { this.chars.splice(this.findInsertPosition(afterIdx + 1, op.id), 0, char); }
    }
    this.rebuildCharIndex();
    return true;
  }

  private applyDelete(op: CRDTOperation): boolean {
    const idx = this.findCharById(op.id);
    if (idx === -1) return false;
    this.chars[idx].deleted = true;
    return true;
  }

  private generatePosition(visibleIndex: number): number[] {
    const left = visibleIndex > 0
      ? this.getVisibleCharAt(visibleIndex - 1)?.id.position ?? [0]
      : [0];
    const right = visibleIndex < this.visibleLength()
      ? this.getVisibleCharAt(visibleIndex)?.id.position ?? [Number.MAX_SAFE_INTEGER]
      : [Number.MAX_SAFE_INTEGER];
    return this.allocateBetween(left, right);
  }

  private allocateBetween(left: number[], right: number[]): number[] {
    const result: number[] = [];
    const maxLen = Math.max(left.length, right.length);
    for (let i = 0; i < maxLen + 1; i++) {
      const l = left[i] ?? 0;
      const r = right[i] ?? Number.MAX_SAFE_INTEGER;
      if (l + 1 < r) {
        result.push(l + 1 + Math.floor(Math.random() * Math.min(r - l - 1, 10)));
        return result;
      }
      result.push(l);
    }
    result.push(1 + Math.floor(Math.random() * 100));
    return result;
  }

  private charIndexKey(id: CRDTId): string {
    return `${id.site}:${id.clock}`;
  }

  private rebuildCharIndex(): void {
    this.charIndex.clear();
    for (let i = 0; i < this.chars.length; i++) {
      this.charIndex.set(this.charIndexKey(this.chars[i].id), i);
    }
  }

  private findCharById(id: CRDTId): number {
    return this.charIndex.get(this.charIndexKey(id)) ?? -1;
  }

  private findInsertPosition(startIdx: number, newId: CRDTId): number {
    let idx = startIdx;
    while (idx < this.chars.length) {
      if (this.compareIds(newId, this.chars[idx].id) < 0) break;
      idx++;
    }
    return idx;
  }

  private compareIds(a: CRDTId, b: CRDTId): number {
    const minLen = Math.min(a.position.length, b.position.length);
    for (let i = 0; i < minLen; i++) {
      if (a.position[i] !== b.position[i]) return a.position[i] - b.position[i];
    }
    if (a.position.length !== b.position.length) return a.position.length - b.position.length;
    return a.site < b.site ? -1 : a.site > b.site ? 1 : a.clock - b.clock;
  }

  private getVisibleCharAt(index: number): CRDTChar | null {
    let count = 0;
    for (const char of this.chars) {
      if (!char.deleted) {
        if (count === index) return char;
        count++;
      }
    }
    return null;
  }
}

// IDENTITY_SEAL: PART-2 | role=CRDT 문서 엔진 | inputs=siteId | outputs=insert, delete, applyRemote, getText

// ============================================================
// PART 3 — Cursor Trail & Typing Indicator
// ============================================================

export interface CursorTrailPoint {
  file: string;
  line: number;
  column: number;
  timestamp: number;
  opacity: number;
}

export class CursorTrailManager {
  private trails = new Map<string, CursorTrailPoint[]>();
  private readonly maxTrailLength = 20;
  private readonly fadeDurationMs = 3000;

  addPoint(userId: string, file: string, line: number, column: number): void {
    if (!this.trails.has(userId)) this.trails.set(userId, []);
    const trail = this.trails.get(userId)!;
    trail.push({ file, line, column, timestamp: Date.now(), opacity: 1.0 });
    if (trail.length > this.maxTrailLength) trail.splice(0, trail.length - this.maxTrailLength);
  }

  getTrail(userId: string): CursorTrailPoint[] {
    const trail = this.trails.get(userId);
    if (!trail) return [];
    const now = Date.now();
    const active = trail.filter((pt) => now - pt.timestamp < this.fadeDurationMs)
      .map((pt) => ({ ...pt, opacity: 1.0 - (now - pt.timestamp) / this.fadeDurationMs }));
    this.trails.set(userId, active);
    return active;
  }

  getAllTrails(): Map<string, CursorTrailPoint[]> {
    const result = new Map<string, CursorTrailPoint[]>();
    for (const [userId] of this.trails) {
      const trail = this.getTrail(userId);
      if (trail.length > 0) result.set(userId, trail);
    }
    return result;
  }

  clearUser(userId: string): void { this.trails.delete(userId); }
}

export type ActivityAction = "opened-file" | "made-edit" | "ran-pipeline" | "joined" | "left" | "chat-message";

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  detail: string;
  timestamp: number;
}

export class ActivityFeed {
  private entries: ActivityEntry[] = [];
  private readonly maxEntries = 200;
  private listeners: Array<(entries: ActivityEntry[]) => void> = [];

  log(userId: string, userName: string, action: ActivityAction, detail: string): void {
    this.entries.push({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId, userName, action, detail, timestamp: Date.now(),
    });
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
    this.notifyListeners();
  }

  getEntries(filter?: { action?: ActivityAction; userId?: string; limit?: number }): ActivityEntry[] {
    let result: ActivityEntry[] = this.entries;
    if (filter?.action) result = result.filter((e) => e.action === filter.action);
    if (filter?.userId) result = result.filter((e) => e.userId === filter.userId);
    if (filter?.limit) result = result.slice(-filter.limit);
    return [...result];
  }

  subscribe(listener: (entries: ActivityEntry[]) => void): () => void {
    this.listeners.push(listener);
    return () => { const idx = this.listeners.indexOf(listener); if (idx >= 0) this.listeners.splice(idx, 1); };
  }

  clear(): void { this.entries = []; this.notifyListeners(); }

  private notifyListeners(): void {
    const entries = [...this.entries];
    for (const fn of this.listeners) fn(entries);
  }
}

export interface TypingStatus {
  userId: string;
  userName: string;
  file: string;
  isTyping: boolean;
  lastTypedAt: number;
}

export class TypingIndicatorManager {
  private typingUsers = new Map<string, TypingStatus>();
  private readonly typingTimeoutMs = 2000;
  private listeners: Array<(typingUsers: TypingStatus[]) => void> = [];

  setTyping(userId: string, userName: string, file: string): void {
    this.typingUsers.set(userId, { userId, userName, file, isTyping: true, lastTypedAt: Date.now() });
    this.notifyListeners();
  }

  clearTyping(userId: string): void {
    this.typingUsers.delete(userId);
    this.notifyListeners();
  }

  getTypingUsers(): TypingStatus[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, status] of this.typingUsers) {
      if (now - status.lastTypedAt > this.typingTimeoutMs) stale.push(id);
    }
    for (const id of stale) this.typingUsers.delete(id);
    if (stale.length > 0) this.notifyListeners();
    return Array.from(this.typingUsers.values()).filter((s) => s.isTyping);
  }

  subscribe(listener: (typingUsers: TypingStatus[]) => void): () => void {
    this.listeners.push(listener);
    return () => { const idx = this.listeners.indexOf(listener); if (idx >= 0) this.listeners.splice(idx, 1); };
  }

  private notifyListeners(): void {
    const users = this.getTypingUsers();
    for (const fn of this.listeners) fn(users);
  }
}

// IDENTITY_SEAL: PART-3 | role=커서 트레일, 액티비티 피드, 타이핑 인디케이터 | inputs=userId | outputs=trails, entries, typingUsers

// ============================================================
// PART 4 — Collaboration Manager (BroadcastChannel)
// ============================================================

const USER_COLORS = [
  "#58a6ff", "#3fb950", "#f85149", "#d29922",
  "#bc8cff", "#f778ba", "#79c0ff", "#7ee787",
];
const HEARTBEAT_INTERVAL = 2_000;
const STALE_TIMEOUT = 10_000;
const STALE_CHECK_INTERVAL = 5_000;

export class CollaborationManager {
  private channel: BroadcastChannel | null = null;
  private localUser: CollabUser;
  private remoteUsers = new Map<string, CollabUser>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  readonly cursorTrails = new CursorTrailManager();
  readonly activityFeed = new ActivityFeed();
  readonly typingIndicator = new TypingIndicatorManager();

  private onJoinCallbacks: Array<(user: CollabUser) => void> = [];
  private onLeaveCallbacks: Array<(userId: string) => void> = [];
  private onCursorCallbacks: Array<(userId: string, cursor: CollabUser["cursor"]) => void> = [];
  private onEditCallbacks: Array<(userId: string, file: string, content: string) => void> = [];
  private onChatCallbacks: Array<(userId: string, message: string) => void> = [];
  private onTypingCallbacks: Array<(userId: string, file: string) => void> = [];
  private onCrdtOpCallbacks: Array<(op: CRDTOperation) => void> = [];
  private readonly roomId: string;

  /** CRDT documents keyed by file path */
  private documents = new Map<string, CRDTDocument>();

  private static readonly COMPACT_THRESHOLD = 100;
  private opsCountSinceCompact = new Map<string, number>();

  constructor(roomId: string, userName: string) {
    this.roomId = roomId;
    const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    const parts = userName.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : userName.slice(0, 2).toUpperCase();
    this.localUser = {
      id: crypto.randomUUID(), name: userName, color, isOnline: true, lastSeen: Date.now(), avatar: initials,
    };
  }

  join(): void {
    if (this.connected) return;
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(`eh-code-studio-collab-${this.roomId}`);
    this.channel.onmessage = (event) => this.handleMessage(event.data as CollabMessage);
    this.connected = true;
    this.broadcast({ type: "join", userId: this.localUser.id, payload: { name: this.localUser.name, color: this.localUser.color }, timestamp: Date.now() });
    this.heartbeatTimer = setInterval(() => {
      this.localUser.lastSeen = Date.now();
      this.broadcast({ type: "join", userId: this.localUser.id, payload: { name: this.localUser.name, color: this.localUser.color, cursor: this.localUser.cursor, selection: this.localUser.selection }, timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL);
    this.staleCheckTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, user] of this.remoteUsers) {
        if (now - user.lastSeen > STALE_TIMEOUT) { this.remoteUsers.delete(id); this.onLeaveCallbacks.forEach((cb) => cb(id)); }
      }
    }, STALE_CHECK_INTERVAL);
  }

  leave(): void {
    if (!this.connected) return;
    this.broadcast({ type: "leave", userId: this.localUser.id, payload: null, timestamp: Date.now() });
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.staleCheckTimer) clearInterval(this.staleCheckTimer);
    this.heartbeatTimer = null;
    this.staleCheckTimer = null;
    this.channel?.close();
    this.channel = null;
    this.connected = false;
    this.remoteUsers.clear();
  }

  broadcastCursor(file: string, line: number, column: number): void {
    this.localUser.cursor = { file, line, column };
    this.broadcast({ type: "cursor", userId: this.localUser.id, payload: { file, line, column }, timestamp: Date.now() });
  }

  broadcastEdit(file: string, content: string): void {
    this.broadcast({ type: "edit", userId: this.localUser.id, payload: { file, content }, timestamp: Date.now() });
    this.activityFeed.log(this.localUser.id, this.localUser.name, "made-edit", `Edited ${file}`);
  }

  broadcastChat(message: string): void {
    this.broadcast({ type: "chat", userId: this.localUser.id, payload: { message }, timestamp: Date.now() });
  }

  broadcastTyping(file: string): void {
    this.typingIndicator.setTyping(this.localUser.id, this.localUser.name, file);
    this.broadcast({ type: "typing", userId: this.localUser.id, payload: { file }, timestamp: Date.now() });
  }

  broadcastFileOpen(file: string): void {
    this.localUser.activeFile = file;
    this.broadcast({ type: "file-open", userId: this.localUser.id, payload: { file }, timestamp: Date.now() });
    this.activityFeed.log(this.localUser.id, this.localUser.name, "opened-file", `Opened ${file}`);
  }

  broadcastActivity(action: ActivityAction, detail: string): void {
    this.activityFeed.log(this.localUser.id, this.localUser.name, action, detail);
    this.broadcast({ type: "activity", userId: this.localUser.id, payload: { action, detail, userName: this.localUser.name }, timestamp: Date.now() });
  }

  /** Get or create a CRDTDocument for a given file path */
  getDocument(filePath: string): CRDTDocument {
    let doc = this.documents.get(filePath);
    if (!doc) {
      doc = new CRDTDocument(this.localUser.id);
      this.documents.set(filePath, doc);
      this.opsCountSinceCompact.set(filePath, 0);
    }
    return doc;
  }

  /** Apply a local edit through CRDT and broadcast the ops */
  localInsert(filePath: string, index: number, value: string): CRDTOperation[] {
    const doc = this.getDocument(filePath);
    const ops = doc.insert(index, value);
    for (const op of ops) {
      this.broadcast({ type: "crdt-op", userId: this.localUser.id, payload: { filePath, op }, timestamp: Date.now() });
    }
    this.maybeCompact(filePath, ops.length);
    return ops;
  }

  /** Apply a local delete through CRDT and broadcast the ops */
  localDelete(filePath: string, index: number, length: number): CRDTOperation[] {
    const doc = this.getDocument(filePath);
    const ops = doc.delete(index, length);
    for (const op of ops) {
      this.broadcast({ type: "crdt-op", userId: this.localUser.id, payload: { filePath, op }, timestamp: Date.now() });
    }
    this.maybeCompact(filePath, ops.length);
    return ops;
  }

  /** Broadcast a cursor-update message (richer than legacy 'cursor') */
  broadcastCursorUpdate(file: string, line: number, column: number, selection?: CollabUser["selection"]): void {
    this.localUser.cursor = { file, line, column };
    if (selection) this.localUser.selection = selection;
    this.broadcast({ type: "cursor-update", userId: this.localUser.id, payload: { file, line, column, selection }, timestamp: Date.now() });
  }

  onCrdtOp(cb: (op: CRDTOperation) => void): void { this.onCrdtOpCallbacks.push(cb); }
  onUserJoin(cb: (user: CollabUser) => void): void { this.onJoinCallbacks.push(cb); }
  onUserLeave(cb: (userId: string) => void): void { this.onLeaveCallbacks.push(cb); }
  onCursorUpdate(cb: (userId: string, cursor: CollabUser["cursor"]) => void): void { this.onCursorCallbacks.push(cb); }
  onEditReceived(cb: (userId: string, file: string, content: string) => void): void { this.onEditCallbacks.push(cb); }
  onChatReceived(cb: (userId: string, message: string) => void): void { this.onChatCallbacks.push(cb); }
  onTypingReceived(cb: (userId: string, file: string) => void): void { this.onTypingCallbacks.push(cb); }

  getState(): CollabState {
    return { roomId: this.roomId, users: Array.from(this.remoteUsers.values()), localUser: { ...this.localUser }, isConnected: this.connected, connectionType: "local" };
  }

  getRoomUrl(): string {
    const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
    return `${base}#collab=${this.roomId}`;
  }

  private maybeCompact(filePath: string, newOps: number): void {
    const current = (this.opsCountSinceCompact.get(filePath) ?? 0) + newOps;
    if (current >= CollaborationManager.COMPACT_THRESHOLD) {
      const doc = this.documents.get(filePath);
      if (doc) doc.compactTombstones();
      this.opsCountSinceCompact.set(filePath, 0);
    } else {
      this.opsCountSinceCompact.set(filePath, current);
    }
  }

  private broadcast(message: CollabMessage): void {
    if (!this.channel || !this.connected) return;
    try { this.channel.postMessage(message); } catch { /* channel closed */ }
  }

  private handleMessage(msg: CollabMessage): void {
    if (msg.userId === this.localUser.id) return;
    switch (msg.type) {
      case "join": {
        const p = msg.payload as { name: string; color: string; cursor?: CollabUser["cursor"]; selection?: CollabUser["selection"] };
        const isNew = !this.remoteUsers.has(msg.userId);
        const user: CollabUser = { id: msg.userId, name: p.name, color: p.color, cursor: p.cursor, selection: p.selection, isOnline: true, lastSeen: msg.timestamp };
        this.remoteUsers.set(msg.userId, user);
        if (isNew) this.onJoinCallbacks.forEach((cb) => cb(user));
        break;
      }
      case "leave":
        this.remoteUsers.delete(msg.userId);
        this.onLeaveCallbacks.forEach((cb) => cb(msg.userId));
        break;
      case "cursor": {
        const c = msg.payload as { file: string; line: number; column: number };
        const u = this.remoteUsers.get(msg.userId);
        if (u) { u.cursor = c; u.lastSeen = msg.timestamp; }
        this.cursorTrails.addPoint(msg.userId, c.file, c.line, c.column);
        this.onCursorCallbacks.forEach((cb) => cb(msg.userId, c));
        break;
      }
      case "edit": {
        const e = msg.payload as { file: string; content: string };
        const u2 = this.remoteUsers.get(msg.userId);
        if (u2) u2.lastSeen = msg.timestamp;
        this.activityFeed.log(msg.userId, u2?.name ?? msg.userId, "made-edit", `Edited ${e.file}`);
        this.onEditCallbacks.forEach((cb) => cb(msg.userId, e.file, e.content));
        break;
      }
      case "file-open": {
        const fo = msg.payload as { file: string };
        const u3 = this.remoteUsers.get(msg.userId);
        if (u3) { u3.activeFile = fo.file; u3.lastSeen = msg.timestamp; }
        this.activityFeed.log(msg.userId, u3?.name ?? msg.userId, "opened-file", `Opened ${fo.file}`);
        break;
      }
      case "chat": {
        const ch = msg.payload as { message: string };
        const u4 = this.remoteUsers.get(msg.userId);
        if (u4) u4.lastSeen = msg.timestamp;
        this.onChatCallbacks.forEach((cb) => cb(msg.userId, ch.message));
        break;
      }
      case "typing": {
        const t = msg.payload as { file: string };
        const u5 = this.remoteUsers.get(msg.userId);
        if (u5) u5.lastSeen = msg.timestamp;
        this.typingIndicator.setTyping(msg.userId, u5?.name ?? msg.userId, t.file);
        this.onTypingCallbacks.forEach((cb) => cb(msg.userId, t.file));
        break;
      }
      case "activity": {
        const a = msg.payload as { action: ActivityAction; detail: string; userName: string };
        const u6 = this.remoteUsers.get(msg.userId);
        if (u6) u6.lastSeen = msg.timestamp;
        this.activityFeed.log(msg.userId, a.userName, a.action, a.detail);
        break;
      }
      case "crdt-op": {
        const crdtPayload = msg.payload as { filePath: string; op: CRDTOperation };
        const doc = this.getDocument(crdtPayload.filePath);
        doc.applyRemote(crdtPayload.op);
        this.maybeCompact(crdtPayload.filePath, 1);
        this.onCrdtOpCallbacks.forEach((cb) => cb(crdtPayload.op));
        const crdtUser = this.remoteUsers.get(msg.userId);
        if (crdtUser) crdtUser.lastSeen = msg.timestamp;
        break;
      }
      case "cursor-update": {
        const cu = msg.payload as { file: string; line: number; column: number; selection?: CollabUser["selection"] };
        const cuUser = this.remoteUsers.get(msg.userId);
        if (cuUser) { cuUser.cursor = { file: cu.file, line: cu.line, column: cu.column }; cuUser.selection = cu.selection; cuUser.lastSeen = msg.timestamp; }
        this.cursorTrails.addPoint(msg.userId, cu.file, cu.line, cu.column);
        this.onCursorCallbacks.forEach((cb) => cb(msg.userId, { file: cu.file, line: cu.line, column: cu.column }));
        break;
      }
      case "user-join": {
        const uj = msg.payload as { name: string; color: string };
        const isNewUj = !this.remoteUsers.has(msg.userId);
        const ujUser: CollabUser = { id: msg.userId, name: uj.name, color: uj.color, isOnline: true, lastSeen: msg.timestamp };
        this.remoteUsers.set(msg.userId, ujUser);
        if (isNewUj) {
          this.activityFeed.log(msg.userId, uj.name, "joined", `${uj.name} joined`);
          this.onJoinCallbacks.forEach((cb) => cb(ujUser));
        }
        break;
      }
      case "user-leave": {
        const ulUser = this.remoteUsers.get(msg.userId);
        if (ulUser) this.activityFeed.log(msg.userId, ulUser.name, "left", `${ulUser.name} left`);
        this.remoteUsers.delete(msg.userId);
        this.cursorTrails.clearUser(msg.userId);
        this.typingIndicator.clearTyping(msg.userId);
        this.onLeaveCallbacks.forEach((cb) => cb(msg.userId));
        break;
      }
    }
  }
}

// IDENTITY_SEAL: PART-4 | role=협업 매니저 + CRDT 동기화 | inputs=roomId, userName | outputs=CollabState, BroadcastChannel 동기화, CRDT ops

// ============================================================
// PART 5 — IndexedDB Persistence
// ============================================================

interface PersistedDocumentState {
  content: string;
  operations: CRDTOperation[];
  version: number;
  chars: CRDTChar[];
  clock: number;
  vectorClock: VectorClock;
  updatedAt: number;
}

const IDB_NAME = "eh-collab-documents";
const IDB_STORE = "documents";
const IDB_VERSION = 1;

function openCollabDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "documentId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class CollabPersistence {
  private db: IDBDatabase | null = null;
  private pendingOps = new Map<string, number>(); // documentId -> ops since last save
  private readonly batchSize: number;

  constructor(batchSize = 10) {
    this.batchSize = batchSize;
  }

  async init(): Promise<void> {
    try {
      this.db = await openCollabDB();
    } catch {
      // IndexedDB unavailable (SSR or privacy mode) — degrade gracefully
      this.db = null;
    }
  }

  async save(documentId: string, doc: CRDTDocument): Promise<void> {
    if (!this.db) return;
    const serialized = doc.serialize();
    const state: PersistedDocumentState & { documentId: string } = {
      documentId,
      content: doc.getText(),
      operations: doc.getOperationLog(),
      version: serialized.clock,
      chars: serialized.chars,
      clock: serialized.clock,
      vectorClock: serialized.vectorClock,
      updatedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(state);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(documentId: string, siteId: string): Promise<CRDTDocument | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get(documentId);
      request.onsuccess = () => {
        const data = request.result as (PersistedDocumentState & { documentId: string }) | undefined;
        if (!data) { resolve(null); return; }
        const doc = CRDTDocument.deserialize(siteId, {
          chars: data.chars,
          clock: data.clock,
          vectorClock: data.vectorClock,
        });
        resolve(doc);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(documentId: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(documentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Track operations and batch-save: only persists every `batchSize` ops.
   * Returns true if a save was triggered.
   */
  async trackAndMaybeSave(documentId: string, doc: CRDTDocument, newOps: number): Promise<boolean> {
    const current = (this.pendingOps.get(documentId) ?? 0) + newOps;
    if (current >= this.batchSize) {
      this.pendingOps.set(documentId, 0);
      await this.save(documentId, doc);
      return true;
    }
    this.pendingOps.set(documentId, current);
    return false;
  }

  /** Force-flush any pending ops for a document */
  async flush(documentId: string, doc: CRDTDocument): Promise<void> {
    this.pendingOps.set(documentId, 0);
    await this.save(documentId, doc);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

// IDENTITY_SEAL: PART-5 | role=IndexedDB 지속성 | inputs=documentId, CRDTDocument | outputs=save, load, batch tracking

// ============================================================
// PART 6 — Conflict Resolution
// ============================================================

export interface ConflictResolutionResult {
  winner: CRDTOperation;
  loser: CRDTOperation;
  reason: "lww-timestamp" | "lww-clock" | "site-order";
}

/**
 * Last-Writer-Wins resolver using vector clock timestamps.
 * When concurrent inserts target the same position, deterministic
 * site-id ordering breaks the tie so all peers converge.
 */
export function resolveConflict(
  localOp: CRDTOperation,
  remoteOp: CRDTOperation,
): ConflictResolutionResult {
  // 1. Higher timestamp wins (LWW)
  if (localOp.timestamp !== remoteOp.timestamp) {
    const winner = localOp.timestamp > remoteOp.timestamp ? localOp : remoteOp;
    const loser = winner === localOp ? remoteOp : localOp;
    return { winner, loser, reason: "lww-timestamp" };
  }

  // 2. Same timestamp — compare vector clock maximums
  // (meaningful when sites have different clock rates)
  if (localOp.timestamp === remoteOp.timestamp && localOp.id.clock !== remoteOp.id.clock) {
    const winner = localOp.id.clock > remoteOp.id.clock ? localOp : remoteOp;
    const loser = winner === localOp ? remoteOp : localOp;
    return { winner, loser, reason: "lww-clock" };
  }

  // 3. Deterministic tie-break: sort by userId (siteId) lexicographically
  const winner = localOp.origin < remoteOp.origin ? localOp : remoteOp;
  const loser = winner === localOp ? remoteOp : localOp;
  return { winner, loser, reason: "site-order" };
}

/**
 * For concurrent inserts at the same position, determine the correct
 * ordering by sorting operations deterministically.
 */
export function orderConcurrentInserts(ops: CRDTOperation[]): CRDTOperation[] {
  return [...ops].sort((a, b) => {
    // Primary: by timestamp descending (later wins / comes first)
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    // Secondary: by clock value descending
    if (a.id.clock !== b.id.clock) return b.id.clock - a.id.clock;
    // Tertiary: by siteId ascending for determinism
    if (a.origin < b.origin) return -1;
    if (a.origin > b.origin) return 1;
    return 0;
  });
}

/**
 * Checks whether two operations conflict (concurrent edits at the
 * same logical position). Both ops must be inserts with the same
 * `after` reference.
 */
export function areConflicting(a: CRDTOperation, b: CRDTOperation): boolean {
  if (a.type !== "insert" || b.type !== "insert") return false;
  if (a.origin === b.origin) return false;
  if (!a.after && !b.after) return true;
  if (!a.after || !b.after) return false;
  return a.after.site === b.after.site && a.after.clock === b.after.clock;
}

// IDENTITY_SEAL: PART-6 | role=충돌 해결 (LWW + 사이트 순서) | inputs=localOp, remoteOp | outputs=winner, loser, reason

// ============================================================
// PART 7 — Factory & Utilities
// ============================================================

const SESSION_ROOM_KEY = "eh-collab-room-id";
const SESSION_USER_KEY = "eh-collab-user-name";

export function persistSession(roomId: string, userName: string): void {
  try { sessionStorage.setItem(SESSION_ROOM_KEY, roomId); sessionStorage.setItem(SESSION_USER_KEY, userName); } catch { /* */ }
}

export function restoreSession(): { roomId: string; userName: string } | null {
  try {
    const roomId = sessionStorage.getItem(SESSION_ROOM_KEY);
    const userName = sessionStorage.getItem(SESSION_USER_KEY);
    if (roomId && userName) return { roomId, userName };
  } catch { /* */ }
  return null;
}

export function clearSession(): void {
  try { sessionStorage.removeItem(SESSION_ROOM_KEY); sessionStorage.removeItem(SESSION_USER_KEY); } catch { /* */ }
}

export function createCollaborationManager(roomId: string, userName: string): CollaborationManager {
  persistSession(roomId, userName);
  return new CollaborationManager(roomId, userName);
}

export function generateUserAvatar(name: string, color: string): { initials: string; bgColor: string; textColor: string } {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { initials, bgColor: color + "33", textColor: color };
}

// IDENTITY_SEAL: PART-7 | role=팩토리 및 유틸리티 | inputs=roomId, userName | outputs=CollaborationManager
