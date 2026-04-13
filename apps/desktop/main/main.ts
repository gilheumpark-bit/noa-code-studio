/**
 * apps/desktop/main/main.ts — Electron main process entry
 *
 * PART 1 — Environment + window creation
 * PART 2 — IPC registration (delegated to main/ipc/*)
 * PART 3 — App lifecycle
 */

// Suppress Node 24 fs.Stats deprecation from chokidar (DEP0180)
process.noDeprecation = true;

import path from 'path';
import fs from 'fs';
import http from 'http';
import { app, BrowserWindow, Menu, shell, globalShortcut, Notification, clipboard, ipcMain } from 'electron';
import serve from 'electron-serve';


import { registerFsIpc, disposeAllWatchers } from './ipc/fs';
import { registerQuillIpc } from './ipc/quill';
import { registerKeystoreIpc } from './ipc/keystore';
import { registerAiIpc } from './ipc/ai';
import { registerShellIpc, disposeAllShellSessions } from './ipc/shell';
import { registerGitIpc } from './ipc/git';
import { initAutoUpdate, disposeAutoUpdate, registerUpdaterIpc } from './services/updater';
import { registerCliInstallerIpc } from './services/cli-installer';
import { registerSystemIpc } from './ipc/system';
import { registerOllamaIpc } from './ipc/ollama';
import { registerGithubIpc } from './ipc/github';
import { registerMcpIpc, disposeMcp } from './ipc/mcp';
import { initCrashReporter } from './services/crash-reporter';

// ============================================================
// PART 1 — Environment + window
// ============================================================

// Packaged builds are always "prod" for load path + COEP. Dev `electron .`
// often has no NODE_ENV; do not infer production from that.
const isProd =
  app.isPackaged ||
  process.env.NODE_FILE_ENV === 'production' ||
  process.env.NODE_ENV === 'production';

const loadApp =
  isProd
    ? serve({ directory: 'app' })
    : null;

if (isProd) {
  // `electron-serve` returns a loader function that also registers `app://`
  // protocol. Calling `serve()` without using its return value can leave
  // `app://` unregistered in production builds.
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

async function createWindow(): Promise<void> {
  const preloadPath = path.join(__dirname, 'preload.js');

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // preload needs Node APIs (chokidar etc.)
      // In dev, `electron .` can run without a compiled `app/preload.js`.
      // Avoid a hard crash/blank screen by enabling preload only when present.
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform !== 'darwin', // Win/Linux: hide menu, Alt to show
    backgroundColor: '#0a0e1a',
  });

  mainWindow.on('closed', () => {
     
    console.log('[desktop] mainWindow closed');
  });

  mainWindow.on('unresponsive', () => {
     
    console.warn('[desktop] mainWindow unresponsive');
  });

  // Forward renderer console + crashes to main logs (debug blank screen)
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
     
    console.log('[renderer][console][%s] %s (%s:%s)', level, message, sourceId, line);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
     
    console.error('[renderer] render-process-gone', details);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
     
    console.error('[renderer] did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  // WebContainer / SharedArrayBuffer: COOP+COEP on responses.
  // Do NOT apply in dev: Next.js Turbopack/HMR + reload can break with COEP,
  // producing a brief paint then a blank renderer (subresource / WS issues).
  if (isProd) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Cross-Origin-Embedder-Policy': ['require-corp'],
          'Cross-Origin-Opener-Policy': ['same-origin'],
        },
      });
    });
  }

  if (isProd) {
    // `renderer/out` contains a statically-exported Next app. `electron-serve`
    // will map paths like `/code-studio` to the exported HTML.
    if (!loadApp) throw new Error('Production loader not initialized');
    try {
      const appRoot = app.getAppPath();
      const exportDir = path.join(appRoot, 'app');

      // Next export output shape can be either:
      // - `code-studio/index.html` (trailingSlash=true style), or
      // - `code-studio.html` (flat html export style).
      const hasDirIndex = fs.existsSync(path.join(exportDir, 'code-studio', 'index.html'));
      const hasFlatHtml = fs.existsSync(path.join(exportDir, 'code-studio.html'));

      // electron-serve's loader only opens `app://-` + optional query; subpaths need an explicit URL.
      const targetUrl = hasDirIndex
        ? 'app://-/code-studio'
        : hasFlatHtml
          ? 'app://-/code-studio.html'
          : 'app://-/code-studio';
      await mainWindow.loadURL(targetUrl);
    } catch (err) {
       
      console.error('[desktop] loadApp failed', err);
      throw err;
    }
  } else {
    const resolvedPort = await resolveDevRendererPort();
    const url = `http://localhost:${resolvedPort}/code-studio`;
    try {
       
      console.log('[desktop] loadURL', url);
      await mainWindow.loadURL(url);
      mainWindow.webContents.openDevTools();
    } catch (err) {
       
      console.error('[desktop] loadURL failed', err);
      throw err;
    }
  }

  mainWindow.once('ready-to-show', () => {
    // Some environments can launch a window offscreen or hidden; force show+focus.
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback: if ready-to-show doesn't fire (rare), show anyway.
  setTimeout(() => {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1500);

  // External links open in default browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // ── Drag-and-Drop from OS file manager ──────────────────
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Prevent navigation from drag-and-drop — handle via IPC instead
    if (url.startsWith('file://')) {
      event.preventDefault();
      const filePath = decodeURIComponent(url.replace('file:///', '').replace('file://', ''));
      mainWindow.webContents.send('local:file-dropped', filePath);
    }
  });

  // ── Global shortcut: focus window from anywhere ─────────
  const toggleShortcut = process.platform === 'darwin' ? 'CommandOrControl+Shift+E' : 'Ctrl+Shift+E';
  globalShortcut.register(toggleShortcut, () => {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // Auto-update (no-op in dev or when electron-updater is missing)
  initAutoUpdate(mainWindow);
}

async function resolveDevRendererPort(): Promise<number> {
  const argPort = Number(process.argv[2]);
  const envPort = Number(process.env.EH_RENDERER_PORT ?? process.env.PORT);

  const candidates = [
    Number.isFinite(envPort) && envPort > 0 ? envPort : null,
    Number.isFinite(argPort) && argPort > 0 ? argPort : null,
    8888, // nextron default: next dev -p 8888 renderer
    3000,
    3001,
  ].filter((v): v is number => typeof v === 'number');

  for (const port of candidates) {
    const ok = await isHttpOk(`http://localhost:${port}/code-studio`);
    if (ok) return port;
  }

  // Last resort: return nextron default so the error surface is predictable.
  return 8888;
}

function isHttpOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume(); // drain
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ============================================================
// PART 2 — IPC registration
// ============================================================

function registerIpc(): void {
  // Modular handlers
  registerFsIpc();
  registerQuillIpc();
  registerKeystoreIpc();
  registerAiIpc();
  registerShellIpc();
  registerGitIpc();
  registerUpdaterIpc();
  registerCliInstallerIpc();
  registerSystemIpc();
  registerOllamaIpc();
  registerGithubIpc();
  registerMcpIpc();
  registerLocalFeatureIpc();
}

// ============================================================
// PART 2b — Local-only features (desktop advantage)
// ============================================================

function registerLocalFeatureIpc(): void {
  // ── Recent Documents ────────────────────────────────────
  ipcMain.handle('local:add-recent', (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath.trim()) {
      app.addRecentDocument(filePath);
    }
    return { ok: true };
  });

  ipcMain.handle('local:clear-recent', () => {
    app.clearRecentDocuments();
    return { ok: true };
  });

  // ── Native Notifications ────────────────────────────────
  ipcMain.handle('local:notify', (_event, opts: { title: string; body: string; silent?: boolean }) => {
    if (!Notification.isSupported()) return { ok: false, error: 'not-supported' };
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      silent: opts.silent ?? false,
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
    });
    n.show();
    return { ok: true };
  });

  // ── Advanced Clipboard ──────────────────────────────────
  ipcMain.handle('local:clipboard-read', () => clipboard.readText());
  ipcMain.handle('local:clipboard-write', (_event, text: string) => {
    clipboard.writeText(text);
    return { ok: true };
  });
  ipcMain.handle('local:clipboard-read-html', () => clipboard.readHTML());
  ipcMain.handle('local:clipboard-has-image', () => !clipboard.readImage().isEmpty());
}

// ============================================================
// PART 3 — App lifecycle
// ============================================================

function buildMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: isMac ? 'Cmd+O' : 'Ctrl+O',
          click: (_item, win) => {
            if (win) (win as BrowserWindow).webContents.send('menu:open-folder');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { label: 'View', submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Install Command Line Tools (cs)',
          click: (_item, win) => {
            if (!win) return;
            (win as BrowserWindow).webContents.send('menu:cli-install');
          },
        },
        {
          label: 'Uninstall Command Line Tools',
          click: (_item, win) => {
            if (!win) return;
            (win as BrowserWindow).webContents.send('menu:cli-uninstall');
          },
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: (_item, win) => {
            if (!win) return;
            (win as BrowserWindow).webContents.send('menu:check-updates');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'NOA Code Studio Website',
          click: () => shell.openExternal('https://github.com/gilheumpark-bit/noa-code-studio'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
   
  console.log('[desktop] app ready (isProd=%s, nodeEnv=%s)', isProd, process.env.NODE_ENV);
  initCrashReporter();
  registerIpc();
  buildMenu();
  void createWindow().catch((err) => {
     
    console.error('[desktop] createWindow failed', err);
    // Keep process alive for debugging rather than silent exit.
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  globalShortcut.unregisterAll();
  disposeMcp();
  disposeAllShellSessions();
  disposeAutoUpdate();
  await disposeAllWatchers();
});
