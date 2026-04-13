<div align="center">

<img src=".github/icon.png" alt="NOA Code Studio" width="128" />

# NOA Code Studio

**AI-Powered Desktop IDE with Verification Pipeline**

Local-first. Your keys. Your files. Your machine.

[![License](https://img.shields.io/badge/CC--BY--NC--4.0-blue?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white)](#tech-stack)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#tech-stack)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](#tech-stack)
![Version](https://img.shields.io/badge/version-0.2.0--beta-green?style=flat-square)
[![GitHub](https://img.shields.io/github/stars/gilheumpark-bit/noa-code-studio?style=flat-square)](https://github.com/gilheumpark-bit/noa-code-studio)

[English](#quick-start) | [한국어](README.ko.md)

</div>

---

## Quick Start

```bash
git clone https://github.com/gilheumpark-bit/noa-code-studio.git
cd noa-code-studio
pnpm install

# Development (hot reload)
pnpm --filter noa-code-studio run dev:electron

# Production build (Windows)
pnpm --filter noa-code-studio run build:electron
# Output: dist/desktop/*.exe, *.zip
```

**Requirements:** Node.js 20+, pnpm 9+, Git

---

## Why Desktop

| Need | Browser IDE | NOA Code Studio |
|------|------------|-----------------|
| Local files | File System Access API (partial) | **Native fs + chokidar watcher** |
| Git | isomorphic-git (memory) | **Real `git` CLI** |
| Terminal | No PTY | **node-pty + xterm.js** |
| npm/tsc/eslint | WebContainer sandbox | **Real shell execution** |
| API key security | localStorage (plaintext) | **OS keychain (DPAPI / Keychain / libsecret)** |
| Local AI | CORS blocked | **Direct Ollama HTTP (sub-200ms FIM)** |
| MCP tools | Not supported | **stdio JSON-RPC + HTTP transport** |
| Code verification | Client-side only | **Worker pool (multi-core parallel)** |

---

## Features

### AI Providers (BYOK — Bring Your Own Key)

| Provider | Type | Default Model | Available Models |
|----------|------|--------------|------------------|
| Gemini | Cloud | gemini-2.5-pro | 2.5-flash, 3.1-pro-preview, 3-flash-preview |
| OpenAI | Cloud | gpt-5.4 | 5.4-mini, 5.4-nano, 4.1, 4.1-mini |
| Claude | Cloud | claude-sonnet-4-6 | opus-4-6, haiku-4-5 |
| Groq | Cloud | llama-3.3-70b | llama-3.1-8b, qwen-qwq-32b |
| **Ollama** | **Local** | Any | codellama, deepseek-coder, qwen2.5-coder, starcoder2 |
| **LM Studio** | **Local** | Any | OpenAI-compatible endpoint |

**ARI Circuit Breaker:** EMA-based health tracking per provider. Auto-failover when a provider goes down, with configurable fallback priority chain.

### Tab Autocomplete (Fill-in-the-Middle)

- **Local FIM** via Ollama — sub-200ms latency, zero cloud dependency
- Native FIM tokens for 6 model families (CodeLlama, DeepSeek, StarCoder, Qwen2.5, CodeGemma, Codestral)
- 3-tier fallback: WebGPU V-Core → Ollama FIM → Cloud API
- Adaptive debounce (300ms local / 1000ms cloud)
- Style learning from accepted completions
- 2KB generation safety cap

### MCP Protocol (Model Context Protocol)

- **stdio transport:** Spawn MCP servers as child processes (JSON-RPC)
- **HTTP transport:** Connect to remote MCP endpoints
- Tool calling in chat — AI requests tools, results flow back automatically
- Auto-restart with exponential backoff (max 3 retries)
- 30-second heartbeat monitoring
- Config persistence to `userData/mcp-servers.json`

### Multi-File Agent

- **Dependency graph** — import tracing + Kahn's topological sort
- **AI planning** — team-leader agent generates modification plan
- **Cross-file context** — related files injected into each edit request
- **Snapshot rollback** — atomic undo with LCS-based diff comparison
- **Per-file review** — accept/reject with inline diff preview
- **Named snapshots** — IndexedDB persistence, export/import as JSON

### Quill Verification Pipeline

8-team static analysis engine with 300+ detector rules:

| Team | Type | Role |
|------|------|------|
| Simulation | Non-blocking | Static analysis |
| Generation | Non-blocking | Code generation quality |
| Validation | **Blocking** | Must pass before commit |
| Size-density | Non-blocking | Bundle metrics |
| Asset-trace | Non-blocking | Asset dependency tracking |
| Stability | Non-blocking | Stress test patterns |
| Release-IP | **Blocking** | Patent/license scan |
| Governance | Non-blocking | Final compliance checks |

**Worker pool:** `worker_threads` with `cpus - 1` parallelism, progress reporting, cancellation support, Tier A/B/C routing.

### GitHub Integration

- 9+ REST API endpoints: user, repos, PRs, issues, workflows, gists
- **Pagination** with Link header parsing
- **Search:** repos, code, issues
- **PR reviews:** list, submit (approve/request changes/comment)
- **Gist CRUD** + workflow dispatch
- **ETag caching** (200-entry LRU, 5-min TTL)
- **Rate limit tracking** with 80% warning
- Retry with exponential backoff on 429/503

### NOA Security Gate

3-layer content scanner before every AI request:

| Gate | Patterns | What It Catches |
|------|----------|----------------|
| Prompt Injection | 17 | "ignore previous instructions", jailbreak, DAN mode, system prompt override |
| Code Injection | 11 | eval(), exec(), \_\_import\_\_(), os.system(), subprocess, new Function() |
| PII Leakage | 10 | SSN, credit cards (Visa/MC/Amex), API keys (OpenAI/Google/Anthropic/GitHub/AWS) |

Configurable sensitivity: `strict` / `normal` / `permissive`

### Desktop-Native Features

- **Native terminal** — node-pty + xterm.js, fallback to child_process
- **Git CLI** — real commands (status, diff, log, branch, commit, show)
- **OS keychain** — API keys encrypted via DPAPI (Win) / Keychain (macOS) / libsecret (Linux)
- **OS notifications** — background task completion alerts
- **Global shortcut** — `Ctrl+Shift+E` to focus window
- **Recent documents** — OS taskbar integration
- **Clipboard** — text, HTML, image read/write
- **File watcher** — chokidar with debounced change batching
- **Auto-updater** — electron-updater via GitHub Releases
- **Crash reporter** — structured JSON logs, session tracking, breadcrumb trail
- **Token budget** — persistent daily counter per provider, 30-day history

---

## Architecture

```
apps/desktop/
  main/                        # Electron main process (Node.js)
    ipc/                       # ai, fs, git, shell, quill, keystore, ollama, mcp, github, system
    services/                  # ai-service, providers, updater, mcp-stdio, crash-reporter
    workers/                   # quill-worker (worker_threads)
  renderer/                    # Next.js 16 (React 19, static export)
    components/code-studio/    # 51-panel UI
    hooks/                     # Chat, Composer, Agent, FileSystem, Panels, Keyboard
    lib/code-studio/
      ai/                      # ghost, ollama-fim, ari-engine, mcp-tool-bridge, agents (19 roles)
      core/                    # panel-registry, store (IndexedDB), dependency-analyzer, snapshot-manager
      editor/                  # Monaco features, TS intellisense, context menu
      pipeline/                # verification loop, master-autopilot
      features/                # terminal, git-engine, mcp-client, patent-scanner, collaboration
packages/
  quill-engine/                # Verification engine (300+ detectors, 436 pattern catalog)
  quill-cli/                   # CLI: cs verify, cs suggest, cs audit
  shared-types/                # Cross-package TypeScript types
```

### IPC Surface (Preload Bridge → `window.cs`)

14 namespaces, 120+ handlers:

| Namespace | Handlers | Description |
|-----------|----------|-------------|
| `fs` | 18 | File operations, dialogs, chokidar watch |
| `quill` | 9 | Verification, auto-scan, worker pool |
| `ai` | 7 | Stream, cancel, ARI state, budget |
| `keystore` | 6 | Set/has/list/delete (never GET) |
| `shell` | 5 | PTY create/write/resize/dispose |
| `git` | 8 | Status, diff, log, branch, commit |
| `github` | 15+ | REST API, search, gists, reviews |
| `ollama` | 10+ | Models, pull, delete, compatibility |
| `mcp` | 10 | Start/stop/restart, tools, config |
| `updater` | 10 | Check/download/install + events |
| `local` | 8 | Notifications, clipboard, recent docs |
| `crash` | 5 | Report, logs, breadcrumbs, session |
| `system` | 2 | Local spec, open path |
| `menu` | 4 | OS menu events |

**Security boundary:** Renderer can SET keystore but NEVER GET. API keys stay in main process.

---

## Configuration

### Ollama Setup

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh    # Linux/macOS
winget install Ollama.Ollama                      # Windows

# 2. Pull a FIM model
ollama pull codellama:7b-code

# 3. In app: Settings > Ollama > Verify connection
# Default endpoint: http://localhost:11434
# Custom endpoints supported
```

### MCP Server

```
Settings > MCP Servers > Add Server
  Name: filesystem
  Transport: stdio
  Command: npx
  Args: -y @modelcontextprotocol/server-filesystem /home/user
```

### GitHub Integration

```
Settings > API Keys > GitHub Personal Access Token
# Required scopes: repo, gist, workflow, read:user
# Token stored in OS keychain (never in config files)
```

---

## Development

```bash
# Prerequisites
node --version   # 20+
pnpm --version   # 9+

# Install
pnpm install

# Dev mode with hot reload
pnpm --filter noa-code-studio run dev:electron

# Type check
pnpm --filter noa-code-studio run verify:static

# Unit tests
pnpm --filter noa-code-studio run test

# E2E tests (requires built app)
pnpm --filter noa-code-studio run test:e2e

# Production build
pnpm --filter noa-code-studio run build:electron
```

### Project Scripts

| Script | Description |
|--------|-------------|
| `dev:electron` | Dev mode with Nextron hot reload |
| `build:electron` | Production Electron build (NSIS + portable) |
| `verify:static` | ESLint + TypeScript strict check |
| `test` | Jest unit tests |
| `test:coverage` | Jest with coverage thresholds |
| `lint` | ESLint only |

---

## CI/CD

### Continuous Integration (`.github/workflows/ci.yml`)

- **Triggers:** push to `master`/`main`/`feat/**`/`fix/**`, all PRs
- **Matrix:** Ubuntu + Windows
- **Steps:** pnpm install → theme contrast check → null byte scan → typecheck → lint → test + coverage

### Release Pipeline (`.github/workflows/release.yml`)

Push a `v*` tag to build for all platforms:

```bash
git tag v0.2.0-beta && git push --tags
```

| Secret | Purpose |
|--------|---------|
| `GH_TOKEN` | GitHub Releases publish |
| `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` | macOS notarization |
| `CSC_LINK` + `CSC_KEY_PASSWORD` | Windows code signing |

### Build Targets

| OS | Formats | Architectures |
|----|---------|---------------|
| Windows | NSIS installer, portable, ZIP | x64, arm64 |
| macOS | DMG, ZIP | x64, arm64 (universal) |
| Linux | AppImage, DEB, RPM | x64, arm64 |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 + Node.js 20+ |
| Framework | Next.js 16 (static export) + Nextron |
| UI | React 19 + Tailwind 4 + Framer Motion 12 |
| Editor | Monaco Editor |
| Terminal | xterm.js + node-pty |
| State | Zustand 5 + IndexedDB |
| AI SDK | Vercel AI SDK + direct provider APIs |
| Verification | Quill Engine (300+ rules) + worker_threads |
| Build | Turborepo + pnpm workspaces + electron-builder |
| CI | GitHub Actions (3-OS matrix) |

---

## Roadmap

- [ ] Code signing certificates (Windows + macOS)
- [ ] WebSocket-based real-time collaboration (Yjs/Automerge)
- [ ] WebGPU local inference (V-Core runtime)
- [ ] Plugin/extension marketplace
- [ ] Integrated debugger (DAP protocol)
- [ ] Telemetry dashboard (opt-in)
- [ ] Mobile companion app

---

## License

[CC BY-NC 4.0](LICENSE) — Attribution-NonCommercial.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
