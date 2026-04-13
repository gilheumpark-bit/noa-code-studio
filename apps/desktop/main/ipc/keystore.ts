/**
 * apps/desktop/main/ipc/keystore.ts
 *
 * OS-backed credential storage using Electron safeStorage.
 *
 * PART 1 — Storage location + load/save
 * PART 2 — CRUD handlers (set/get/has/list/delete)
 * PART 3 — Internal getKey for main-only consumers (NOT exposed to renderer)
 * PART 4 — Public registrar
 *
 * Security model:
 *   - Keys are encrypted at rest with safeStorage (OS keychain on macOS,
 *     DPAPI on Windows, libsecret on Linux).
 *   - The renderer can SET, HAS, LIST, DELETE — but NEVER GET.
 *   - Main process consumers (ai.ts) call getKey() directly.
 *   - This means a renderer XSS cannot exfiltrate API keys.
 */

import { app, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AIProvider } from '@noa/shared-types';

// ============================================================
// PART 1 — Storage location + load/save
// ============================================================

interface KeystoreFile {
  version: 1;
  entries: Record<string, string>; // provider -> base64(encrypted key)
}

let cache: KeystoreFile | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'keystore.json');
}

async function load(): Promise<KeystoreFile> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw) as KeystoreFile;
    if (parsed.version !== 1) throw new Error('keystore version mismatch');
    cache = parsed;
  } catch {
    cache = { version: 1, entries: {} };
  }
  return cache;
}

async function save(file: KeystoreFile): Promise<void> {
  cache = file;
  const dir = path.dirname(storePath());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(file, null, 2), { mode: 0o600 });
}

// ============================================================
// PART 2 — CRUD primitives
// ============================================================

async function setKey(provider: AIProvider | string, key: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this platform');
  }
  const file = await load();
  const encrypted = safeStorage.encryptString(key);
  file.entries[provider] = encrypted.toString('base64');
  await save(file);
}

async function hasKey(provider: AIProvider | string): Promise<boolean> {
  const file = await load();
  return Boolean(file.entries[provider]);
}

async function listProviders(): Promise<string[]> {
  const file = await load();
  return Object.keys(file.entries);
}

async function deleteKey(provider: AIProvider | string): Promise<boolean> {
  const file = await load();
  if (!file.entries[provider]) return false;
  delete file.entries[provider];
  await save(file);
  return true;
}

async function clearAll(): Promise<void> {
  await save({ version: 1, entries: {} });
}

// ============================================================
// PART 3 — Main-only getter (NOT registered as IPC handler)
// ============================================================

/**
 * Decrypt and return a key. This function is intentionally NOT
 * exposed via ipcMain.handle. Only main-process modules (e.g. ai.ts)
 * may import and call it.
 */
export async function getKey(provider: AIProvider | string): Promise<string | null> {
  const file = await load();
  const encoded = file.entries[provider];
  if (!encoded) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = Buffer.from(encoded, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

// ============================================================
// PART 4 — Public registrar
// ============================================================

let registered = false;

export function registerKeystoreIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('keystore:set', async (_event, provider: string, key: string) => {
    await setKey(provider, key);
    return { ok: true };
  });

  ipcMain.handle('keystore:has', async (_event, provider: string) => hasKey(provider));

  ipcMain.handle('keystore:list', async () => listProviders());

  ipcMain.handle('keystore:delete', async (_event, provider: string) => deleteKey(provider));

  ipcMain.handle('keystore:clear', async () => {
    await clearAll();
    return { ok: true };
  });

  ipcMain.handle('keystore:available', () => safeStorage.isEncryptionAvailable());

  // Intentionally no 'keystore:get' handler — see PART 3.
}
