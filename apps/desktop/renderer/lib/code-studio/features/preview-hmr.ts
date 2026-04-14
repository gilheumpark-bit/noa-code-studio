// ============================================================
// PART 1 -- Types & Constants
// ============================================================
// HMR Bridge for live preview in EH Universe Code Studio.
// Bridges the editor and the preview iframe, enabling CSS hot reload,
// module update, and full-reload fallback.

export type HMREventType =
  | "hmr-success"
  | "hmr-fail-full-reload"
  | "css-update"
  | "module-update"
  | "client-ready"
  | "client-error";

export interface HMREvent {
  type: HMREventType;
  file?: string;
  timestamp: number;
  error?: string;
}

export type HMREventHandler = (event: HMREvent) => void;

export interface HMRBridgeOptions {
  /** Debounce interval in ms for batching rapid file changes. Default 300 */
  debounceMs?: number;
  /** Enable CSS hot reload. Default true */
  cssHotReload?: boolean;
  /** Verbose logging to console. Default false */
  verbose?: boolean;
  /** Explicit iframe target origin for postMessage. Defaults to the iframe src origin. */
  targetOrigin?: string;
}

interface FileHash {
  hash: string;
  timestamp: number;
}

interface PendingChange {
  filePath: string;
  content: string;
  type: "css" | "module" | "unknown";
}

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=HMREvent, HMRBridgeOptions

// ============================================================
// PART 2 -- Content Hashing & Classification
// ============================================================

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(36);
}

function classifyFile(filePath: string): "css" | "module" | "unknown" {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".less")) {
    return "css";
  }
  if (
    lower.endsWith(".tsx") || lower.endsWith(".jsx")
    || lower.endsWith(".ts") || lower.endsWith(".js") || lower.endsWith(".mjs")
  ) {
    return "module";
  }
  return "unknown";
}

// IDENTITY_SEAL: PART-2 | role=hash and classify | inputs=string | outputs=hash, fileType

// ============================================================
// PART 3 -- HMR Client Script
// ============================================================

function buildHMRClientScript(parentOrigin: string): string {
  const serializedParentOrigin = JSON.stringify(parentOrigin);

  return `
(function() {
  if (window.__hmrClientInstalled) return;
  window.__hmrClientInstalled = true;
  var parentOrigin = ${serializedParentOrigin};

  window.addEventListener("message", function(event) {
    var data = event.data;
    if (event.origin !== parentOrigin) return;
    if (!data || data.source !== "eh-hmr-bridge") return;

    try {
      switch (data.action) {
        case "css-update":
          handleCSSUpdate(data.filePath, data.content);
          break;
        case "full-reload":
          window.location.reload();
          break;
        default:
          break;
      }
    } catch (err) {
      window.parent.postMessage({
        source: "eh-hmr-client",
        type: "error",
        error: err && err.message ? err.message : String(err),
        file: data.filePath
      }, parentOrigin);
    }
  });

  function handleCSSUpdate(filePath, content) {
    var existingId = "hmr-style-" + filePath.replace(/[^a-zA-Z0-9]/g, "-");
    var existing = document.getElementById(existingId);
    if (existing) existing.remove();

    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (href.indexOf(filePath) !== -1) {
        links[i].disabled = true;
      }
    }

    var style = document.createElement("style");
    style.id = existingId;
    style.setAttribute("data-hmr-file", filePath);
    style.textContent = content;
    document.head.appendChild(style);

    window.parent.postMessage({
      source: "eh-hmr-client",
      type: "css-update-applied",
      file: filePath
    }, parentOrigin);
  }

  window.parent.postMessage({ source: "eh-hmr-client", type: "ready" }, parentOrigin);
})();
`;
}

// IDENTITY_SEAL: PART-3 | role=iframe client script | inputs=parent origin | outputs=CSS hot reload

// ============================================================
// PART 4 -- HMRBridge Class
// ============================================================

export class HMRBridge {
  private iframe: HTMLIFrameElement;
  private options: Required<HMRBridgeOptions>;
  private targetOrigin: string;
  private parentOrigin: string;
  private fileHashes = new Map<string, FileHash>();
  private pendingChanges: PendingChange[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<HMREventType, Set<HMREventHandler>>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private clientReady = false;
  private disposed = false;

  constructor(iframe: HTMLIFrameElement, options: HMRBridgeOptions = {}) {
    this.iframe = iframe;
    this.options = {
      debounceMs: options.debounceMs ?? 300,
      cssHotReload: options.cssHotReload ?? true,
      verbose: options.verbose ?? false,
      targetOrigin: options.targetOrigin ?? this.inferTargetOrigin(),
    };
    this.targetOrigin = this.options.targetOrigin;
    this.parentOrigin = window.location.origin;
    this.setupMessageListener();
  }

  /** Inject the HMR client script into the iframe. */
  injectClient(): void {
    if (this.disposed) return;
    const iframeWindow = this.iframe.contentWindow;
    if (!iframeWindow) return;

    try {
      const doc = this.iframe.contentDocument;
      if (doc) {
        const script = doc.createElement("script");
        script.textContent = buildHMRClientScript(this.parentOrigin);
        doc.head.appendChild(script);
      }
    } catch {
      // Cross-origin fallback: ask the frame to evaluate the script if it already
      // has a compatible listener installed.
      this.postToIframe({
        source: "eh-hmr-bridge",
        action: "inject-script",
        script: buildHMRClientScript(this.parentOrigin),
      });
    }
  }

  /** Notify the bridge that a file has changed. */
  fileChanged(filePath: string, content: string): void {
    if (this.disposed) return;

    const prevHash = this.fileHashes.get(filePath);
    const newHash = simpleHash(content);

    if (prevHash && prevHash.hash === newHash) return;

    this.fileHashes.set(filePath, { hash: newHash, timestamp: Date.now() });
    this.pendingChanges.push({ filePath, content, type: classifyFile(filePath) });

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flushPendingChanges(), this.options.debounceMs);
  }

  /** Subscribe to HMR events. */
  on(type: HMREventType, handler: HMREventHandler): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  /** Force a full iframe reload. */
  forceReload(): void {
    if (this.disposed) return;
    this.clientReady = false;

    const iframeWindow = this.iframe.contentWindow;
    if (iframeWindow) {
      try {
        this.postToIframe({ source: "eh-hmr-bridge", action: "full-reload" });
      } catch {
        this.reloadIframeSrc();
      }
    } else {
      this.reloadIframeSrc();
    }

    this.emit({ type: "hmr-fail-full-reload", timestamp: Date.now() });
  }

  isClientReady(): boolean {
    return this.clientReady;
  }

  /** Clean up all listeners and timers. */
  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.listeners.clear();
    this.fileHashes.clear();
    this.pendingChanges = [];
  }

  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== this.iframe.contentWindow) return;
      if (event.origin !== this.targetOrigin) return;

      const data = event.data;
      if (!data || data.source !== "eh-hmr-client") return;

      switch (data.type) {
        case "ready":
          this.clientReady = true;
          this.emit({ type: "client-ready", timestamp: Date.now() });
          break;
        case "css-update-applied":
          this.emit({ type: "css-update", file: data.file, timestamp: Date.now() });
          break;
        case "error":
          this.emit({
            type: "client-error",
            file: data.file,
            error: data.error,
            timestamp: Date.now(),
          });
          break;
        default:
          break;
      }
    };

    window.addEventListener("message", this.messageHandler);
  }

  private flushPendingChanges(): void {
    if (this.pendingChanges.length === 0) return;
    const changes = [...this.pendingChanges];
    this.pendingChanges = [];

    const cssChanges = changes.filter((change) => change.type === "css");
    const otherChanges = changes.filter((change) => change.type !== "css");

    if (!this.iframe.contentWindow) return;

    if (this.options.cssHotReload && cssChanges.length > 0) {
      for (const change of cssChanges) {
        this.postToIframe({
          source: "eh-hmr-bridge",
          action: "css-update",
          filePath: change.filePath,
          content: change.content,
        });
      }
    }

    // Non-CSS changes trigger full reload.
    if (otherChanges.length > 0 || (!this.options.cssHotReload && cssChanges.length > 0)) {
      this.forceReload();
    }
  }

  private reloadIframeSrc(): void {
    const currentSrc = this.iframe.src;
    if (currentSrc) {
      const url = new URL(currentSrc, window.location.origin);
      url.searchParams.set("__hmr_reload", Date.now().toString());
      this.iframe.src = url.toString();
    }
  }

  private inferTargetOrigin(): string {
    try {
      return new URL(this.iframe.src, window.location.href).origin;
    } catch {
      return window.location.origin;
    }
  }

  private postToIframe(message: Record<string, unknown>): void {
    const iframeWindow = this.iframe.contentWindow;
    if (!iframeWindow) return;
    iframeWindow.postMessage(message, this.targetOrigin);
  }

  private emit(event: HMREvent): void {
    const handlers = this.listeners.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}

// IDENTITY_SEAL: PART-4 | role=HMR bridge core | inputs=iframe, options | outputs=HMR events

// ============================================================
// PART 5 -- Factory
// ============================================================

export function createHMRBridge(
  iframe: HTMLIFrameElement,
  options: HMRBridgeOptions = {},
): HMRBridge {
  const bridge = new HMRBridge(iframe, options);

  const onLoad = () => {
    bridge.injectClient();
  };
  iframe.addEventListener("load", onLoad);

  if (iframe.contentDocument?.readyState === "complete") {
    bridge.injectClient();
  }

  const originalDispose = bridge.dispose.bind(bridge);
  bridge.dispose = () => {
    iframe.removeEventListener("load", onLoad);
    originalDispose();
  };

  return bridge;
}

// IDENTITY_SEAL: PART-5 | role=factory | inputs=iframe, options | outputs=HMRBridge
