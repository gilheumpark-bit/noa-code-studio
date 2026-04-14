/**
 * apps/desktop/renderer/lib/desktop-bridge.ts
 *
 * Thin typed wrapper around window.cs.* for renderer code.
 *
 * Use these helpers instead of touching window.cs directly so that
 * non-Electron contexts (Jest, Storybook) get a clear "no bridge"
 * error rather than a TypeError.
 *
 * PART 1 — Availability check
 * PART 2 — fs / git / shell / quill / keystore / ai facades
 */

// ============================================================
// PART 1 — Availability
// ============================================================

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.cs);
}

function requireBridge(): NonNullable<Window['cs']> {
  if (typeof window === 'undefined' || !window.cs) {
    throw new Error('Desktop bridge (window.cs) not available — running outside Electron?');
  }
  return window.cs;
}

// ============================================================
// PART 2a — fs facade
// ============================================================

export const desktopFs = {
  openDirectory: () => requireBridge().fs.openDirectory(),
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    requireBridge().fs.openFile({ filters }),
  saveAs: (defaultPath?: string, filters?: { name: string; extensions: string[] }[]) =>
    requireBridge().fs.saveAs({ defaultPath, filters }),

  readFile: (path: string) => requireBridge().fs.readFile(path),
  writeFile: (path: string, content: string) => requireBridge().fs.writeFile(path, content),
  readDir: (path: string) => requireBridge().fs.readDir(path),
  exists: (path: string) => requireBridge().fs.exists(path),
  stat: (path: string) => requireBridge().fs.stat(path),
  rename: (from: string, to: string) => requireBridge().fs.rename(from, to),
  delete: (target: string) => requireBridge().fs.delete(target),
  mkdir: (path: string) => requireBridge().fs.mkdir(path),
  watch: requireBridge.bind(null) as unknown as never, // use useDesktopProject hook instead
};

// ============================================================
// PART 2b — git facade
// ============================================================

export const desktopGit = {
  status: (cwd: string) => requireBridge().git.status(cwd),
  diff: (cwd: string, file?: string) => requireBridge().git.diff(cwd, file),
  log: (cwd: string, opts?: { limit?: number; file?: string }) =>
    requireBridge().git.log(cwd, opts),
  branchList: (cwd: string) => requireBridge().git.branchList(cwd),
  currentBranch: (cwd: string) => requireBridge().git.currentBranch(cwd),
  add: (cwd: string, paths: string[]) => requireBridge().git.add(cwd, paths),
  commit: (cwd: string, message: string, signoff = false) =>
    requireBridge().git.commit(cwd, message, { signoff }),
  show: (cwd: string, ref: string) => requireBridge().git.show(cwd, ref),
};

// ============================================================
// PART 2c — quill facade
// ============================================================

export const desktopQuill = {
  verify: (filePath: string, tier: 'A' | 'B' | 'C' = 'A') =>
    requireBridge().quill.verify({ filePath, tier }),
  engineVersion: () => requireBridge().quill.engineVersion(),
  fullScan: (rootPath: string) => requireBridge().quill.fullScan(rootPath),

  autoStart: (rootPath: string, sessionId: string) =>
    requireBridge().quill.autoStart({ rootPath, sessionId }),
  autoStop: (sessionId: string) => requireBridge().quill.autoStop(sessionId),
  autoPause: (sessionId: string) => requireBridge().quill.autoPause(sessionId),
  autoResume: (sessionId: string) => requireBridge().quill.autoResume(sessionId),

  onAutoReport: (callback: (result: QuillVerifyResult) => void) =>
    requireBridge().quill.onAutoReport(callback),
  onAutoError: (callback: (error: { filePath: string; error: string }) => void) =>
    requireBridge().quill.onAutoError(callback),
};

// ============================================================
// PART 2d — keystore facade
// ============================================================

export const desktopKeystore = {
  set: (provider: string, key: string) => requireBridge().keystore.set(provider, key),
  has: (provider: string) => requireBridge().keystore.has(provider),
  list: () => requireBridge().keystore.list(),
  delete: (provider: string) => requireBridge().keystore.delete(provider),
  clear: () => requireBridge().keystore.clear(),
  available: () => requireBridge().keystore.available(),
};

// ============================================================
// PART 2e — ai facade (chat streaming)
// ============================================================

export interface DesktopAIChatRequest {
  provider: 'gemini' | 'openai' | 'claude' | 'groq';
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface DesktopAIChatHandle {
  cancel: () => void;
}

export async function desktopAiChat(
  req: DesktopAIChatRequest,
  handlers: {
    onChunk: (chunk: string) => void;
    onError: (err: unknown) => void;
    onEnd: () => void;
  },
): Promise<DesktopAIChatHandle> {
  const cs = requireBridge();
  const { requestId } = await cs.ai.chatStream({ ...req, stream: true });
  const offChunk = cs.ai.onChunk(requestId, handlers.onChunk);
  const offError = cs.ai.onError(requestId, handlers.onError);
  const offEnd = cs.ai.onEnd(requestId, () => {
    offChunk();
    offError();
    offEnd();
    handlers.onEnd();
  });
  return {
    cancel: () => {
      offChunk();
      offError();
      offEnd();
    },
  };
}

// ============================================================
// PART 2f — shell facade
// ============================================================

export interface LocalMachineSpec {
  platform: string;
  arch: string;
  release: string;
  hostname: string;
  cpus: number;
  totalMem: number;
  freeMem: number;
  appVersion: string;
}

export const desktopSystem = {
  getLocalSpec: (): Promise<LocalMachineSpec> => requireBridge().system.getLocalSpec(),
  openPath: (filePath: string) => requireBridge().system.openPath(filePath),
};

export const desktopShell = {
  create: (id: string, opts: { cwd?: string; cols?: number; rows?: number }) =>
    requireBridge().shell.create({ id, ...opts }),
  write: (id: string, data: string) => requireBridge().shell.write(id, data),
  resize: (id: string, cols: number, rows: number) => requireBridge().shell.resize(id, cols, rows),
  dispose: (id: string) => requireBridge().shell.dispose(id),
  onData: (id: string, callback: (data: string) => void) =>
    requireBridge().shell.onData(id, callback),
  onExit: (id: string, callback: (e: { exitCode: number }) => void) =>
    requireBridge().shell.onExit(id, callback),
};
