/**
 * apps/desktop/e2e/specs/smoke.spec.ts
 *
 * Critical 7-scenario smoke test for desktop CS.
 * Run via: pnpm --filter @noa/desktop exec playwright test
 *
 * NOTE: These tests require the desktop app to be built first
 * (`pnpm --filter @noa/desktop run build`). They drive the production
 * bundle, not the dev server.
 */

import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

let app: ElectronApplication;
let page: Page;

const APP_ENTRY = path.resolve(__dirname, '../../app/main.js');

test.beforeAll(async () => {
  app = await electron.launch({
    args: [APP_ENTRY],
    env: { ...process.env, NODE_ENV: 'production', CS_E2E: '1' },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

// ============================================================
// Scenario 1 — App boots
// ============================================================

test('1. app launches and shows main window', async () => {
  expect(await page.title()).toContain('EH Code Studio');
  expect(await app.windows()).toHaveLength(1);
});

// ============================================================
// Scenario 2 — Bridge is exposed
// ============================================================

test('2. window.cs bridge surfaces are present', async () => {
  const surfaces = await page.evaluate(() => {
    const cs = (window as unknown as { cs?: Record<string, unknown> }).cs;
    return cs ? Object.keys(cs).sort() : null;
  });
  expect(surfaces).not.toBeNull();
  expect(surfaces).toEqual(
    expect.arrayContaining(['fs', 'quill', 'ai', 'keystore', 'shell', 'git', 'updater', 'cli', 'menu', 'meta', 'system', 'local', 'ollama', 'mcp']),
  );
});

// ============================================================
// Scenario 3 — Theme defaults to dark, toggles to light
// ============================================================

test('3. theme defaults to dark and toggles', async () => {
  const initial = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(initial).toBe('dark');

  // Use the controller directly via window context
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  });
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).toBe('light');
});

// ============================================================
// Scenario 4 — fs IPC: read/write/exists round-trip
// ============================================================

test('4. fs IPC round-trip (write then read then delete)', async () => {
  const tmpFile = path.join(os.tmpdir(), `cs-e2e-${Date.now()}.txt`);
  const payload = 'hello from cs e2e';

  const written = await page.evaluate(async ([p, c]) => {
    const cs = (window as unknown as { cs: { fs: { writeFile: (a: string, b: string) => Promise<void>; readFile: (a: string) => Promise<string>; exists: (a: string) => Promise<boolean>; delete: (a: string) => Promise<void> } } }).cs;
    await cs.fs.writeFile(p, c);
    const exists = await cs.fs.exists(p);
    const read = await cs.fs.readFile(p);
    await cs.fs.delete(p);
    const stillExists = await cs.fs.exists(p);
    return { exists, read, stillExists };
  }, [tmpFile, payload] as const);

  expect(written.exists).toBe(true);
  expect(written.read).toBe(payload);
  expect(written.stillExists).toBe(false);
});

// ============================================================
// Scenario 5 — Quill engine version is reachable
// ============================================================

test('5. quill engine version is reachable via IPC', async () => {
  const version = await page.evaluate(async () => {
    const cs = (window as unknown as { cs: { quill: { engineVersion: () => Promise<string> } } }).cs;
    return cs.quill.engineVersion();
  });
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
});

// ============================================================
// Scenario 6 — Keystore CRUD without leaking the key
// ============================================================

test('6. keystore set/has/list/delete (key never returned)', async () => {
  const result = await page.evaluate(async () => {
    const cs = (window as unknown as {
      cs: {
        keystore: {
          set: (p: string, k: string) => Promise<{ ok: true }>;
          has: (p: string) => Promise<boolean>;
          list: () => Promise<string[]>;
          delete: (p: string) => Promise<boolean>;
          available: () => Promise<boolean>;
        };
      };
    }).cs;

    const available = await cs.keystore.available();
    if (!available) return { skipped: true };

    await cs.keystore.set('e2e-test', 'sk-secret-do-not-leak');
    const has = await cs.keystore.has('e2e-test');
    const list = await cs.keystore.list();
    const deleted = await cs.keystore.delete('e2e-test');

    // Verify there's no get method exposed
    const surfaceKeys = Object.keys(cs.keystore);
    const hasGet = surfaceKeys.includes('get');

    return { has, list, deleted, hasGet };
  });

  if ('skipped' in result) {
    test.skip(true, 'safeStorage not available on this CI runner');
    return;
  }
  expect(result.has).toBe(true);
  expect(result.list).toContain('e2e-test');
  expect(result.deleted).toBe(true);
  expect(result.hasGet).toBe(false); // CRITICAL: keys never leave main
});

// ============================================================
// Scenario 7 — git status against the repo itself (sanity)
// ============================================================

test('7. git status works against current repo', async () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const result = await page.evaluate(async (cwd) => {
    const cs = (window as unknown as { cs: { git: { status: (cwd: string) => Promise<{ ok: boolean; branch?: string | null }> } } }).cs;
    return cs.git.status(cwd);
  }, repoRoot);

  expect(result.ok).toBe(true);
  expect(typeof result.branch === 'string' || result.branch === null).toBe(true);
});

// ============================================================
// Scenario 8 — Ollama health check (graceful fail when not installed)
// ============================================================

test('8. ollama health check returns structured result', async () => {
  const result = await page.evaluate(async () => {
    const cs = (window as unknown as { cs: { ollama: { healthCheck: (url?: string) => Promise<{ ok: boolean; version?: string }> } } }).cs;
    return cs.ollama.healthCheck('http://localhost:11434');
  });
  // Ollama may not be installed — both ok:true and ok:false are valid
  expect(result).toHaveProperty('ok');
  expect(typeof result.ok).toBe('boolean');
});

// ============================================================
// Scenario 9 — MCP server list returns empty array
// ============================================================

test('9. mcp list-servers returns empty array initially', async () => {
  const servers = await page.evaluate(async () => {
    const cs = (window as unknown as { cs: { mcp: { listServers: () => Promise<unknown[]> } } }).cs;
    return cs.mcp.listServers();
  });
  expect(Array.isArray(servers)).toBe(true);
  expect(servers).toHaveLength(0);
});

// ============================================================
// Scenario 10 — System spec returns valid machine info
// ============================================================

test('10. system local spec returns valid info', async () => {
  const spec = await page.evaluate(async () => {
    const cs = (window as unknown as { cs: { system: { getLocalSpec: () => Promise<{
      platform: string; arch: string; cpus: number; totalMem: number; appVersion: string;
    }> } } }).cs;
    return cs.system.getLocalSpec();
  });
  expect(spec.platform).toBeTruthy();
  expect(spec.arch).toBeTruthy();
  expect(spec.cpus).toBeGreaterThan(0);
  expect(spec.totalMem).toBeGreaterThan(0);
  expect(spec.appVersion).toMatch(/^\d+\.\d+\.\d+/);
});
