# NOA Code Studio — Architecture

## Overview

NOA Code Studio is an Electron 41 desktop IDE built on Next.js 16 (static export) via Nextron.
The renderer runs in a sandboxed BrowserWindow; all privileged operations (file I/O, git, shell, API keys) happen in the main process via IPC.

## Process Model

```
┌────────────────────────────────┐
│        Electron Main           │
│  (Node.js — full OS access)    │
│                                │
│  ipc/fs.ts      — file I/O    │
│  ipc/git.ts     — git CLI     │
│  ipc/ai.ts      — AI stream   │
│  ipc/shell.ts   — PTY         │
│  ipc/quill.ts   — verify      │
│  ipc/keystore   — OS keychain │
│  ipc/ollama.ts  — local AI    │
│  ipc/mcp.ts     — MCP servers │
│  ipc/github.ts  — GitHub API  │
│  workers/       — thread pool │
│  services/      — business    │
├────────────────────────────────┤
│        Preload Bridge          │
│  window.cs.{fs,ai,git,...}     │
│  contextIsolation: true        │
│  nodeIntegration: false        │
├────────────────────────────────┤
│        Renderer (Next.js)      │
│  React 19 + Tailwind 4         │
│  Monaco Editor + xterm.js      │
│  51-panel UI + 18 hooks        │
│  IndexedDB state persistence   │
│  Static export (no SSR)        │
└────────────────────────────────┘
```

## Directory Structure

```
apps/desktop/
├── main/                       # Electron main process
│   ├── main.ts                 # App entry, window creation, menu
│   ├── preload.ts              # IPC bridge (window.cs)
│   ├── ipc/                    # Domain-specific IPC handlers
│   │   ├── ai.ts               # AI streaming + ARI circuit breaker
│   │   ├── fs.ts               # File operations + chokidar watch
│   │   ├── git.ts              # Git CLI wrapper
│   │   ├── shell.ts            # PTY (node-pty / child_process)
│   │   ├── quill.ts            # Verification with worker pool
│   │   ├── keystore.ts         # OS keychain (safeStorage)
│   │   ├── ollama.ts           # Ollama model management
│   │   ├── mcp.ts              # MCP server lifecycle
│   │   ├── github.ts           # GitHub REST API
│   │   └── system.ts           # System info
│   ├── services/               # Business logic
│   │   ├── ai-service.ts       # Token budget, NOA gate, routing
│   │   ├── providers.ts        # Provider streaming + security gate
│   │   ├── mcp-stdio.ts        # MCP JSON-RPC process manager
│   │   ├── crash-reporter.ts   # Structured error logging
│   │   ├── updater.ts          # electron-updater
│   │   └── cli-installer.ts    # CLI symlink/copy
│   └── workers/
│       └── quill-worker.ts     # worker_threads verification
├── renderer/                   # Next.js 16 frontend
│   ├── app/                    # Next.js App Router pages
│   ├── components/code-studio/ # 51 panel components
│   ├── hooks/                  # 18 custom hooks
│   ├── lib/code-studio/        # Feature libraries
│   │   ├── ai/                 # Ghost text, FIM, agents, MCP bridge
│   │   ├── core/               # Store, registry, dependency analyzer
│   │   ├── editor/             # Monaco setup, intellisense
│   │   ├── features/           # Terminal, git, collaboration
│   │   └── pipeline/           # Verification loop, autopilot
│   └── types/                  # TypeScript declarations
├── e2e/                        # Playwright Electron E2E tests
└── electron-builder.yml        # Packaging config (3 OS)

packages/
├── quill-engine/               # Verification engine (300+ rules)
├── quill-cli/                  # CLI tool (cs verify/suggest/audit)
└── shared-types/               # Cross-package types
```

## Security Model

1. **Context Isolation** — `contextIsolation: true`, renderer cannot access Node.js
2. **Preload Bridge** — Only whitelisted IPC channels exposed via `window.cs`
3. **Keystore** — `electron.safeStorage` encrypts API keys; renderer can SET but never GET
4. **NOA Gate** — 3-layer scanner (prompt injection, code injection, PII) before every AI request
5. **Path Validation** — Null byte + system path blocking on all file operations
6. **COEP/COOP** — Cross-Origin headers in production builds
7. **MCP Sandboxing** — Each MCP server runs as isolated child process

## Data Flow

```
User types in Chat
  → useCodeStudioChat (hook)
    → @mention context resolution
    → system instruction + design preset injection
  → window.cs.ai.chatStream (preload IPC)
    → main/ipc/ai.ts
      → NOA security gate (providers.ts:runNoa)
      → token budget check (ai-service.ts)
      → ARI circuit breaker state check
      → fetch() to provider API (with AbortController)
      → stream chunks via webContents.send()
    → renderer receives chunks
    → code block extraction + apply workflow
```

## Design System (v8.0)

- **Semantic tokens** — `bg-bg-primary`, `text-text-primary`, `border-border`
- **Z-index** — 7 layers via CSS variables (`--z-dropdown` through `--z-tooltip`)
- **Spacing** — 4px grid (`--sp-xs` through `--sp-2xl`)
- **Typography** — IBM Plex Sans + JetBrains Mono + Noto Sans KR
- **Touch targets** — Minimum 44px
- **Focus** — `focus-visible:ring-2 ring-accent-blue`
- **Transitions** — Conditional theme animation (80ms fast / 150ms normal / 250ms slow)
