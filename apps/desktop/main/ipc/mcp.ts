/**
 * apps/desktop/main/ipc/mcp.ts
 *
 * MCP server lifecycle + tool call IPC handlers.
 */

import { ipcMain, type WebContents } from 'electron';
import { mcpManager, type MCPServerConfig } from '../services/mcp-stdio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

// ============================================================
// PART 1 — Config persistence
// ============================================================

function configPath(): string {
  return path.join(app.getPath('userData'), 'mcp-servers.json');
}

async function loadConfigs(): Promise<MCPServerConfig[]> {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8');
    return JSON.parse(raw) as MCPServerConfig[];
  } catch (err) {
    console.warn('[mcp]', 'loadConfigs failed, returning empty list:', err);
    return [];
  }
}

async function saveConfigs(configs: MCPServerConfig[]): Promise<void> {
  await fs.writeFile(configPath(), JSON.stringify(configs, null, 2), 'utf-8');
}

// ============================================================
// PART 2 — IPC handlers
// ============================================================

let registered = false;

export function registerMcpIpc(): void {
  if (registered) return;
  registered = true;

  // Forward manager events to renderer
  let rendererRef: WebContents | null = null;

  mcpManager.on('server-status', (event) => {
    if (rendererRef && !rendererRef.isDestroyed()) {
      rendererRef.send(`mcp:server-event:${event.id}`, event);
    }
  });

  mcpManager.on('server-log', (log) => {
    if (rendererRef && !rendererRef.isDestroyed()) {
      rendererRef.send('mcp:server-log', log);
    }
  });

  ipcMain.handle('mcp:start-server', async (event, config: MCPServerConfig) => {
    rendererRef = event.sender;
    try {
      const session = await mcpManager.startServer(config);
      return { ok: true, id: session.id, tools: session.tools, status: session.status };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('mcp:stop-server', async (_event, id: string) => {
    await mcpManager.stopServer(id);
    return { ok: true };
  });

  ipcMain.handle('mcp:restart-server', async (event, id: string) => {
    rendererRef = event.sender;
    try {
      const session = await mcpManager.restartServer(id);
      return { ok: true, id: session.id, tools: session.tools };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('mcp:list-servers', () => {
    return mcpManager.getAllSessions().map((s) => ({
      id: s.id,
      name: s.config.name,
      status: s.status,
      tools: s.tools,
    }));
  });

  ipcMain.handle('mcp:list-tools', async (_event, serverId: string) => {
    return mcpManager.listTools(serverId);
  });

  ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
    try {
      return await mcpManager.callTool(serverId, toolName, args);
    } catch (err) {
      return { content: (err as Error).message, isError: true };
    }
  });

  ipcMain.handle('mcp:server-status', (_event, id: string) => {
    const session = mcpManager.getSession(id);
    if (!session) return { status: 'not-found' };
    return { status: session.status, tools: session.tools };
  });

  ipcMain.handle('mcp:save-config', async (_event, configs: MCPServerConfig[]) => {
    await saveConfigs(configs);
    return { ok: true };
  });

  ipcMain.handle('mcp:load-config', async () => {
    return loadConfigs();
  });
}

// Cleanup on app quit
export function disposeMcp(): void {
  mcpManager.dispose();
}
