// ============================================================
// Code Studio — Code Sandbox (isolated execution)
// ============================================================

import { streamChat } from '@/lib/ai-providers';

// ============================================================
// PART 1 — Types
// ============================================================

export type SandboxStatus = 'draft' | 'reviewing' | 'approved' | 'rejected' | 'merged';

export interface SandboxFile {
  path: string;
  content: string;
  isNew: boolean;
  originalContent?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Sandbox {
  id: string;
  name: string;
  description: string;
  status: SandboxStatus;
  files: SandboxFile[];
  createdAt: number;
  updatedAt: number;
  reviews: SandboxReview[];
}

export interface SandboxReview {
  reviewerId: string;
  score: number;
  status: 'pass' | 'warn' | 'fail';
  comments: string[];
  timestamp: number;
}

export interface SandboxExecResult {
  output: string;
  error?: string;
  exitCode: number;
  durationMs: number;
}

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=Sandbox,SandboxExecResult

// ============================================================
// PART 2 — Storage
// ============================================================

const STORAGE_KEY = 'eh_sandboxes';

function loadSandboxes(): Sandbox[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Sandbox[]) : [];
  } catch {
    return [];
  }
}

function saveSandboxes(boxes: Sandbox[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boxes));
}

// IDENTITY_SEAL: PART-2 | role=storage | inputs=Sandbox[] | outputs=Sandbox[]

// ============================================================
// PART 3 — Sandbox CRUD
// ============================================================

function uid(): string {
  return `sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSandbox(name: string, description: string): Sandbox {
  const sb: Sandbox = {
    id: uid(), name, description, status: 'draft',
    files: [], createdAt: Date.now(), updatedAt: Date.now(), reviews: [],
  };
  const boxes = loadSandboxes();
  boxes.push(sb);
  saveSandboxes(boxes);
  return sb;
}

export function getSandboxes(): Sandbox[] {
  return loadSandboxes();
}

export function getSandbox(id: string): Sandbox | undefined {
  return loadSandboxes().find((s) => s.id === id);
}

export function deleteSandbox(id: string): void {
  saveSandboxes(loadSandboxes().filter((s) => s.id !== id));
}

export function addSandboxFile(
  sandboxId: string,
  file: SandboxFile,
): void {
  const boxes = loadSandboxes();
  const sb = boxes.find((s) => s.id === sandboxId);
  if (sb) {
    sb.files.push(file);
    sb.updatedAt = Date.now();
    saveSandboxes(boxes);
  }
}

export function updateSandboxStatus(id: string, status: SandboxStatus): void {
  const boxes = loadSandboxes();
  const sb = boxes.find((s) => s.id === id);
  if (sb) {
    sb.status = status;
    sb.updatedAt = Date.now();
    saveSandboxes(boxes);
  }
}

// IDENTITY_SEAL: PART-3 | role=CRUD | inputs=Sandbox data | outputs=Sandbox

// ============================================================
// PART 4 — Isolated Execution
// ============================================================

export function executeInIframe(code: string, timeoutMs = 5000): Promise<SandboxExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    if (typeof document === 'undefined') {
      resolve({ output: '', error: 'No DOM available', exitCode: 1, durationMs: 0 });
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    // SECURITY: enable strict isolating constraints before rendering
    iframe.sandbox.add('allow-scripts');
    document.body.appendChild(iframe);

    // Nonce to validate postMessage authenticity (must be declared before handler)
    const execNonce = crypto.randomUUID();

    const timer = setTimeout(() => {
      cleanup();
      resolve({ output: '', error: 'Execution timeout (Zone 1 isolated)', exitCode: 1, durationMs: timeoutMs });
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      document.body.removeChild(iframe);
      // RESIDUAL CLEANUP (잔향 소거): 강제 GC 지시 - 외주 AI의 메모리 누수나 무한참조 파괴
      if (typeof global !== 'undefined' && (global as unknown as Record<string, unknown>).gc) {
        // eslint-disable-next-line unused-imports/no-unused-vars
        try { ((global as unknown as Record<string, unknown>).gc as () => void)(); } catch (_e) { /* ignore */ }
      } else if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).gc) {
        // eslint-disable-next-line unused-imports/no-unused-vars
        try { ((window as unknown as Record<string, unknown>).gc as () => void)(); } catch (_e) { /* ignore */ }
      }
    }

    function handler(e: MessageEvent) {
      // Validate: must come from our iframe AND carry the correct nonce
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.__nonce !== execNonce) return;
      cleanup();
      resolve({
        output: e.data?.output ?? '',
        error: e.data?.error,
        exitCode: e.data?.error ? 1 : 0,
        durationMs: Date.now() - start,
      });
    }

    window.addEventListener('message', handler);

    // SECURITY: User code runs inside a sandboxed iframe (sandbox="allow-scripts" + srcdoc).
    // The iframe has no access to parent DOM, cookies, or storage.
    // Code is base64-encoded to prevent script tag injection in the srcdoc HTML.
    // The nonce (declared above) validates postMessage authenticity.
    const safeCode = code.replace(/<\/script/gi, '<\\/script');
    const encoded = btoa(unescape(encodeURIComponent(safeCode)));
    
    // MONKEY-PATCHING: 호스트 자원 격리 방역망 (Zone 1)
    const html = `<!doctype html><html><body><script>
      try {
        var fetch = function() { throw new Error('Security Error: fetch() is disabled in Zone 1 Sandbox.'); };
        var XMLHttpRequest = function() { throw new Error('Security Error: XHR is disabled in Zone 1 Sandbox.'); };
        var localStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){}, clear: function(){} };
        var sessionStorage = localStorage;

        var __out = [];
        var _log = console.log;
        console.log = function() { __out.push(Array.from(arguments).join(' ')); };
        var __code = decodeURIComponent(escape(atob("${encoded}")));
        (new Function(__code))();
        parent.postMessage({ __nonce: "${execNonce}", output: __out.join('\\n') }, '*');
      } catch(e) {
        parent.postMessage({ __nonce: "${execNonce}", error: e.message, output: '' }, '*');
      }
    <\/script></body></html>`;

    iframe.srcdoc = html;
  });
}

// IDENTITY_SEAL: PART-4 | role=execution | inputs=code string | outputs=SandboxExecResult

// ============================================================
// PART 5 — AI Review
// ============================================================

export async function reviewSandbox(
  sandbox: Sandbox,
  signal?: AbortSignal,
): Promise<SandboxReview> {
  const filesContext = sandbox.files
    .map((f) => `--- ${f.path} (${f.isNew ? 'new' : 'modified'}) ---\n${f.content.slice(0, 1000)}`)
    .join('\n\n');

  let raw = '';
  await streamChat({
    systemInstruction: 'Review the sandbox code changes. Respond with JSON: {"score":0-100,"status":"pass"|"warn"|"fail","comments":["..."]}',
    messages: [{ role: 'user', content: `Sandbox: ${sandbox.name}\n\n${filesContext}` }],
    onChunk: (t) => { raw += t; },
    signal,
  });

  try {
    const p = JSON.parse(raw.trim());
    return { reviewerId: 'ai', score: p.score ?? 50, status: p.status ?? 'warn', comments: p.comments ?? [], timestamp: Date.now() };
  } catch {
    return { reviewerId: 'ai', score: 50, status: 'warn', comments: ['Review parsing failed'], timestamp: Date.now() };
  }
}

// IDENTITY_SEAL: PART-5 | role=AI review | inputs=Sandbox | outputs=SandboxReview
