/**
 * apps/desktop/main/services/mcp-stdio.ts
 *
 * MCP (Model Context Protocol) stdio transport manager.
 * Spawns MCP servers as child processes and communicates via JSON-RPC over stdin/stdout.
 *
 * PART 1 — Types
 * PART 2 — JSON-RPC line protocol
 * PART 3 — Server lifecycle
 * PART 4 — Public API
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ============================================================
// PART 1 — Types
// ============================================================

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPCallResult {
  content: string;
  isError: boolean;
}

interface MCPSession {
  id: string;
  config: MCPServerConfig;
  process: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
  tools: MCPToolDef[];
  restartCount: number;
}

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
  error?: { code: number; message: string };
}

// ============================================================
// PART 2 — JSON-RPC line protocol
// ============================================================

class LineBuffer {
  private buffer = '';

  feed(data: string): string[] {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.filter((l) => l.trim().length > 0);
  }

  clear(): void {
    this.buffer = '';
  }
}

// ============================================================
// PART 3 — Server lifecycle
// ============================================================

const MAX_RESTARTS = 3;
const RESTART_BACKOFF_BASE_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const RESPONSE_TIMEOUT_MS = 10_000;

export class MCPStdioManager extends EventEmitter {
  private sessions = new Map<string, MCPSession>();
  private rpcId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  async startServer(config: MCPServerConfig): Promise<MCPSession> {
    // Kill existing session if any
    if (this.sessions.has(config.id)) {
      await this.stopServer(config.id);
    }

    const proc = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...config.env },
      cwd: config.cwd,
      shell: true,
    });

    const session: MCPSession = {
      id: config.id,
      config,
      process: proc,
      status: 'starting',
      tools: [],
      restartCount: 0,
    };

    this.sessions.set(config.id, session);

    // stdout: line-buffered JSON-RPC responses
    const lineBuffer = new LineBuffer();
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = lineBuffer.feed(data.toString('utf-8'));
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            clearTimeout(p.timer);
            this.pending.delete(msg.id);
            if (msg.error) {
              p.reject(new Error(`MCP RPC error: ${msg.error.message}`));
            } else {
              p.resolve(msg.result);
            }
          }
        } catch {
          // Not JSON — log as server output
          this.emit('server-log', { id: config.id, message: line });
        }
      }
    });

    // stderr: log output
    proc.stderr?.on('data', (data: Buffer) => {
      this.emit('server-log', { id: config.id, message: data.toString('utf-8'), level: 'error' });
    });

    // Process exit: auto-restart with backoff
    proc.on('exit', (code) => {
      session.status = 'stopped';
      lineBuffer.clear();
      this.clearHeartbeat(config.id);
      this.emit('server-status', { id: config.id, status: 'stopped', exitCode: code });

      if (session.restartCount < MAX_RESTARTS) {
        const delay = RESTART_BACKOFF_BASE_MS * Math.pow(2, session.restartCount);
        session.restartCount++;
        setTimeout(() => {
          if (this.sessions.has(config.id)) {
            void this.startServer(config).catch(() => {
              session.status = 'error';
              this.emit('server-status', { id: config.id, status: 'error' });
            });
          }
        }, delay);
      } else {
        session.status = 'error';
        this.emit('server-status', { id: config.id, status: 'error', reason: 'max-restarts-exceeded' });
      }
    });

    // Initialize MCP protocol
    try {
      await this.sendRequest(config.id, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'NOA Code Studio', version: '0.2.0' },
      });

      // Notify initialized
      this.sendNotification(config.id, 'notifications/initialized');

      // Discover tools
      const toolsResult = await this.sendRequest(config.id, 'tools/list') as { tools?: MCPToolDef[] };
      session.tools = toolsResult?.tools ?? [];
      session.status = 'running';
      session.restartCount = 0;

      // Start heartbeat
      this.setupHeartbeat(config.id);

      this.emit('server-status', { id: config.id, status: 'running', tools: session.tools });
      return session;
    } catch (err) {
      session.status = 'error';
      this.emit('server-status', { id: config.id, status: 'error', reason: (err as Error).message });
      throw err;
    }
  }

  async stopServer(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    this.clearHeartbeat(id);
    session.restartCount = MAX_RESTARTS; // prevent auto-restart

    if (session.process.pid && !session.process.killed) {
      session.process.kill('SIGTERM');
      // Force kill after 5s
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!session.process.killed) session.process.kill('SIGKILL');
          resolve();
        }, 5000);
        session.process.on('exit', () => { clearTimeout(timer); resolve(); });
      });
    }

    this.sessions.delete(id);
    this.emit('server-status', { id, status: 'stopped' });
  }

  async restartServer(id: string): Promise<MCPSession> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`No server with id: ${id}`);
    const config = session.config;
    session.restartCount = 0;
    await this.stopServer(id);
    return this.startServer(config);
  }

  // ============================================================
  // PART 4 — Public API
  // ============================================================

  async listTools(id: string): Promise<MCPToolDef[]> {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'running') return [];
    return session.tools;
  }

  async callTool(id: string, toolName: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    const result = await this.sendRequest(id, 'tools/call', { name: toolName, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const text = result?.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n') ?? '';

    return { content: text, isError: result?.isError ?? false };
  }

  getSession(id: string): MCPSession | null {
    return this.sessions.get(id) ?? null;
  }

  getAllSessions(): MCPSession[] {
    return Array.from(this.sessions.values());
  }

  dispose(): void {
    for (const id of this.sessions.keys()) {
      void this.stopServer(id);
    }
  }

  // ── Internal helpers ──

  private sendRequest(id: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const session = this.sessions.get(id);
    if (!session?.process.stdin?.writable) {
      return Promise.reject(new Error(`Server ${id} stdin not writable`));
    }

    const reqId = ++this.rpcId;
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id: reqId, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`MCP RPC timeout: ${method} on ${id}`));
      }, RESPONSE_TIMEOUT_MS);

      this.pending.set(reqId, { resolve, reject, timer });
      session.process.stdin!.write(JSON.stringify(msg) + '\n');
    });
  }

  private sendNotification(id: string, method: string, params?: Record<string, unknown>): void {
    const session = this.sessions.get(id);
    if (!session?.process.stdin?.writable) return;
    const msg = { jsonrpc: '2.0', method, params };
    session.process.stdin.write(JSON.stringify(msg) + '\n');
  }

  private setupHeartbeat(id: string): void {
    const timer = setInterval(async () => {
      try {
        await this.sendRequest(id, 'ping');
      } catch {
        // Heartbeat failed — will auto-restart via exit handler
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimers.set(id, timer);
  }

  private clearHeartbeat(id: string): void {
    const timer = this.heartbeatTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(id);
    }
  }
}

// Singleton
export const mcpManager = new MCPStdioManager();
