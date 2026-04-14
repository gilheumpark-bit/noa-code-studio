// ============================================================
// Code Studio — MCP Client (Model Context Protocol)
// ============================================================

// ============================================================
// PART 1 — Types
// ============================================================

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: MCPTool[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPCallResult {
  content: string;
  isError: boolean;
}

export interface ToolCallHistoryEntry {
  timestamp: number;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: MCPCallResult;
}

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=MCPServer,MCPTool,MCPCallResult

// ============================================================
// PART 2 — JSON-RPC Helpers
// ============================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const STORAGE_KEY = 'eh_mcp_servers';
const TOOL_CALL_TIMEOUT_MS = 30_000;

const serverRequestIds = new Map<string, number>();

function nextId(serverUrl: string): number {
  const current = serverRequestIds.get(serverUrl) ?? 0;
  const next = current + 1;
  serverRequestIds.set(serverUrl, next);
  return next;
}

async function rpcCall(
  url: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const req: JsonRpcRequest = { jsonrpc: '2.0', id: nextId(url), method, params };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_CALL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    return (await response.json()) as JsonRpcResponse;
  } finally {
    clearTimeout(timeout);
  }
}

// IDENTITY_SEAL: PART-2 | role=JSON-RPC | inputs=url,method,params | outputs=JsonRpcResponse

// ============================================================
// PART 3 — Server Management
// ============================================================

function loadServers(): MCPServer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MCPServer[]) : [];
  } catch {
    return [];
  }
}

function saveServers(servers: MCPServer[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export function getServers(): MCPServer[] {
  return loadServers();
}

export function addServer(name: string, url: string): MCPServer {
  const server: MCPServer = {
    id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    url,
    status: 'disconnected',
    tools: [],
  };
  const servers = loadServers();
  servers.push(server);
  saveServers(servers);
  return server;
}

export function removeServer(id: string): void {
  saveServers(loadServers().filter((s) => s.id !== id));
}

// IDENTITY_SEAL: PART-3 | role=server management | inputs=name,url | outputs=MCPServer[]

// ============================================================
// PART 4 — Connection & Tool Calls
// ============================================================

export async function connectServer(serverId: string): Promise<MCPServer | null> {
  const servers = loadServers();
  const server = servers.find((s) => s.id === serverId);
  if (!server) return null;

  try {
    const initResp = await rpcCall(server.url, 'initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'eh-code-studio', version: '1.0.0' },
      capabilities: {},
    });

    if (initResp.error) {
      server.status = 'error';
      saveServers(servers);
      return server;
    }

    const toolsResp = await rpcCall(server.url, 'tools/list');
    if (!toolsResp.error && toolsResp.result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = toolsResp.result as any;
      server.tools = (data.tools ?? []).map((t: Record<string, unknown>) => ({
        name: t.name ?? '',
        description: t.description ?? '',
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }));
    }

    server.status = 'connected';
    saveServers(servers);
    return server;
  } catch {
    server.status = 'error';
    saveServers(servers);
    return server;
  }
}

export async function callTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPCallResult> {
  const server = loadServers().find((s) => s.id === serverId);
  if (!server || server.status !== 'connected') {
    return buildStructuredError('CONNECTION_ERROR', 'Server not connected', serverId, toolName, 'Check server status and reconnect');
  }

  try {
    const resp = await rpcCall(server.url, 'tools/call', { name: toolName, arguments: args });
    if (resp.error) {
      return buildStructuredError(
        'RPC_ERROR',
        resp.error.message,
        serverId,
        toolName,
        resp.error.code === -32601 ? 'Tool not found — verify tool name' : 'Retry or check server logs',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resp.result as any;
    const content = Array.isArray(result?.content)
      ? result.content.map((c: Record<string, unknown>) => c.text ?? '').join('')
      : JSON.stringify(result);
    return { content, isError: false };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return buildStructuredError(
      isTimeout ? 'TIMEOUT' : 'EXCEPTION',
      err instanceof Error ? err.message : String(err),
      serverId,
      toolName,
      isTimeout ? 'Tool execution exceeded 30s — consider breaking into smaller operations' : 'Check network connectivity or server health',
    );
  }
}

// IDENTITY_SEAL: PART-4 | role=connection & calls | inputs=serverId,toolName,args | outputs=MCPCallResult

// ============================================================
// PART 5 — Structured Error Builder
// ============================================================
// Returns JSON-formatted error content so Pro mode AI can parse
// and attempt self-healing (e.g., installing missing packages).

type MCPErrorType = 'CONNECTION_ERROR' | 'RPC_ERROR' | 'TIMEOUT' | 'EXCEPTION';

function buildStructuredError(
  errorType: MCPErrorType,
  message: string,
  serverId: string,
  toolName: string,
  fallbackSuggestion: string,
): MCPCallResult {
  const payload = {
    status: 'error' as const,
    errorType,
    message,
    serverId,
    toolName,
    suggestion: inferSelfHealingSuggestion(message) ?? fallbackSuggestion,
    timestamp: Date.now(),
  };
  return { content: JSON.stringify(payload), isError: true };
}

/** Pattern-match error messages to provide actionable self-healing hints for Pro mode AI */
function inferSelfHealingSuggestion(msg: string): string | null {
  const lower = msg.toLowerCase();
  if (lower.includes('command not found') || lower.includes('cannot find module') || lower.includes('not found')) {
    return 'Missing dependency detected — run npm install <package> or verify the tool/module name';
  }
  if (lower.includes('permission denied') || lower.includes('eacces')) {
    return 'Permission error — review file permissions or request elevated access';
  }
  if (lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return 'Connection refused — verify the MCP server URL and ensure it is running';
  }
  if (lower.includes('syntax error') || lower.includes('unexpected token')) {
    return 'Malformed arguments — validate JSON structure and retry with corrected params';
  }
  return null;
}

// IDENTITY_SEAL: PART-5 | role=structured-error+self-healing | inputs=errorType,message | outputs=MCPCallResult(JSON)
