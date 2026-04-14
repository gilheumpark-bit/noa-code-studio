/**
 * Type definitions for `window.cs` exposed by main/preload.ts
 *
 * This file is renderer-only. It does NOT import from electron
 * (renderer doesn't have node integration).
 */

declare global {
  interface FsEntry {
    name: string;
    isDirectory: boolean;
    path: string;
  }

  interface FsStat {
    size: number;
    mtimeMs: number;
    ctimeMs: number;
    isFile: boolean;
    isDirectory: boolean;
  }

  interface FsWatchEvent {
    kind: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'error';
    path: string;
  }

  interface CSFs {
    openDirectory(): Promise<string | null>;
    openFile(opts?: { filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
    saveAs(opts: {
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }): Promise<string | null>;

    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;

    readDir(dirPath: string): Promise<FsEntry[]>;
    exists(filePath: string): Promise<boolean>;
    stat(filePath: string): Promise<FsStat>;

    rename(from: string, to: string): Promise<void>;
    delete(target: string): Promise<void>;
    mkdir(dirPath: string): Promise<void>;

    watch(
      opts: { rootPath: string; ignored?: string[]; watchId: string },
      callback: (event: FsWatchEvent) => void,
    ): Promise<() => void>;
  }

  interface QuillVerifyResult {
    filePath: string;
    tier: 'A' | 'B' | 'C';
    issues: Array<{
      ruleId: string;
      severity: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
      line: number;
      column?: number;
      message: string;
    }>;
    durationMs: number;
    engineVersion: string;
  }

  interface CSQuill {
    verify(req: { filePath: string; tier?: 'A' | 'B' | 'C' }): Promise<QuillVerifyResult>;
    engineVersion(): Promise<string>;
    fullScan(rootPath: string): Promise<{ scanned: number; issues: number }>;

    autoStart(opts: { rootPath: string; sessionId: string }): Promise<{ ok: true }>;
    autoStop(sessionId: string): Promise<{ ok: true }>;
    autoPause(sessionId: string): Promise<{ ok: true }>;
    autoResume(sessionId: string): Promise<{ ok: true }>;

    onAutoReport(callback: (result: QuillVerifyResult) => void): () => void;
    onAutoError(callback: (error: { filePath: string; error: string }) => void): () => void;
  }

  interface AIChatRequest {
    provider: 'gemini' | 'openai' | 'claude' | 'groq';
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  }

  interface CSAi {
    chatStream(req: AIChatRequest): Promise<{ requestId: string }>;
    ariState(): Promise<unknown[]>;
    ariReset(provider?: string): Promise<{ ok: true }>;
    onChunk(requestId: string, callback: (chunk: string) => void): () => void;
    onError(requestId: string, callback: (error: unknown) => void): () => void;
    onEnd(requestId: string, callback: () => void): () => void;
    /** @deprecated use chatStream */
    request(request: Record<string, unknown>): Promise<unknown>;
  }

  interface CSKeystore {
    set(provider: string, key: string): Promise<{ ok: true }>;
    has(provider: string): Promise<boolean>;
    list(): Promise<string[]>;
    delete(provider: string): Promise<boolean>;
    clear(): Promise<{ ok: true }>;
    available(): Promise<boolean>;
  }

  interface CSShell {
    create(opts: { id: string; cwd?: string; cols?: number; rows?: number }): Promise<{ ok: true; id: string; kind: 'pty' | 'child' }>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    dispose(id: string): void;
    onData(id: string, callback: (data: string) => void): () => void;
    onExit(id: string, callback: (e: { exitCode: number }) => void): () => void;
  }

  interface GitStatusEntry {
    path: string;
    indexStatus: string;
    workingStatus: string;
  }
  interface GitStatus {
    ok: boolean;
    branch?: string | null;
    ahead?: number;
    behind?: number;
    files?: GitStatusEntry[];
    error?: string;
  }
  interface GitCommit {
    hash: string;
    author: string;
    email: string;
    timestamp: number;
    subject: string;
  }

  interface CSGit {
    status(cwd: string): Promise<GitStatus>;
    diff(cwd: string, file?: string): Promise<{ ok: boolean; diff?: string; error?: string }>;
    log(cwd: string, opts?: { limit?: number; file?: string }): Promise<{ ok: boolean; commits?: GitCommit[]; error?: string }>;
    branchList(cwd: string): Promise<{ ok: boolean; branches?: string[]; error?: string }>;
    currentBranch(cwd: string): Promise<{ ok: boolean; branch?: string; error?: string }>;
    add(cwd: string, paths: string[]): Promise<{ ok: boolean; error?: string }>;
    commit(cwd: string, message: string, opts?: { signoff?: boolean }): Promise<{ ok: boolean; output?: string; error?: string }>;
    show(cwd: string, ref: string): Promise<{ ok: boolean; content?: string; error?: string }>;
  }

  interface CSMeta {
    getAppVersion(): Promise<string>;
  }

  interface LocalMachineSpec {
    platform: string;
    arch: string;
    release: string;
    hostname: string;
    cpus: number;
    totalMem: number;
    freeMem: number;
    appVersion: string;
  }

  interface CSSystem {
    getLocalSpec(): Promise<LocalMachineSpec>;
    openPath(filePath: string): Promise<{ ok: true } | { ok: false; error: string }>;
  }

  interface CSBridge {
    fs: CSFs;
    quill: CSQuill;
    ai: CSAi;
    keystore: CSKeystore;
    shell: CSShell;
    git: CSGit;
    meta: CSMeta;
    system: CSSystem;
    local: CSLocal;
    ollama: CSOllama;
    mcp: CSMcp;
    crash: CSCrash;
    github: CSGitHub;
  }

  interface CSCrash {
    report: (entry: Record<string, unknown>) => Promise<{ ok: true }>;
    getLogs: () => Promise<{ logs: unknown[] }>;
    getLogPath: () => Promise<string>;
  }

  interface CSGitHub {
    user: () => Promise<{ login: string; name: string; avatar_url: string } | { error: string }>;
    listRepos: (opts?: { per_page?: number; sort?: string }) => Promise<unknown[]>;
    getRepo: (owner: string, repo: string) => Promise<unknown>;
    listPRs: (owner: string, repo: string, state?: string) => Promise<unknown[]>;
    createPR: (owner: string, repo: string, data: { title: string; head: string; base: string; body?: string; draft?: boolean }) => Promise<unknown>;
    listIssues: (owner: string, repo: string, state?: string) => Promise<unknown[]>;
    createIssue: (owner: string, repo: string, data: { title: string; body?: string; labels?: string[] }) => Promise<unknown>;
    listRuns: (owner: string, repo: string) => Promise<unknown>;
    cloneUrl: (owner: string, repo: string) => Promise<{ url: string } | { error: string }>;
  }

  interface MCPServerConfig {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    cwd?: string;
  }

  interface CSMcp {
    startServer: (config: MCPServerConfig) => Promise<{ ok: boolean; id?: string; tools?: unknown[]; error?: string }>;
    stopServer: (id: string) => Promise<{ ok: boolean }>;
    restartServer: (id: string) => Promise<{ ok: boolean; id?: string; tools?: unknown[]; error?: string }>;
    listServers: () => Promise<Array<{ id: string; name: string; status: string; tools: unknown[] }>>;
    listTools: (serverId: string) => Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>>;
    callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<{ content: string; isError: boolean }>;
    serverStatus: (id: string) => Promise<{ status: string; tools?: unknown[] }>;
    saveConfig: (configs: MCPServerConfig[]) => Promise<{ ok: boolean }>;
    loadConfig: () => Promise<MCPServerConfig[]>;
    onServerEvent: (id: string, cb: (event: { status: string; tools?: unknown[]; reason?: string }) => void) => () => void;
  }

  interface CSOllama {
    healthCheck: (baseUrl?: string) => Promise<{ ok: boolean; version?: string }>;
    listModels: (baseUrl?: string) => Promise<Array<{ name: string; size: number; digest: string; modified_at: string }>>;
    modelInfo: (modelName: string, baseUrl?: string) => Promise<Record<string, unknown> | null>;
    pullModel: (baseUrl: string, modelName: string) => Promise<{ requestId: string }>;
    onPullProgress: (requestId: string, cb: (progress: { status: string; percent?: number }) => void) => () => void;
    onPullDone: (requestId: string, cb: () => void) => () => void;
  }

  interface CSLocal {
    addRecent: (filePath: string) => Promise<{ ok: true }>;
    clearRecent: () => Promise<{ ok: true }>;
    notify: (opts: { title: string; body: string; silent?: boolean }) => Promise<{ ok: boolean; error?: string }>;
    clipboardRead: () => Promise<string>;
    clipboardWrite: (text: string) => Promise<{ ok: true }>;
    clipboardReadHtml: () => Promise<string>;
    clipboardHasImage: () => Promise<boolean>;
    onFileDropped: (cb: (filePath: string) => void) => () => void;
  }

  interface Window {
    cs: CSBridge;
    electron?: {
      getAppVersion: () => Promise<string>;
      fs: {
        openDirectory: () => Promise<string | null>;
        readFile: (path: string) => Promise<string>;
        writeFile: (path: string, content: string) => Promise<void>;
        readdir: (path: string) => Promise<FsEntry[]>;
        exists: (path: string) => Promise<boolean>;
      };
      aiChat: {
        request: (req: Record<string, unknown>) => Promise<unknown>;
        onChunk: (id: string, cb: (chunk: string) => void) => () => void;
        onError: (id: string, cb: (err: unknown) => void) => () => void;
        onEnd: (id: string, cb: () => void) => () => void;
      };
    };
  }
}

export {};
