# Changelog

All notable changes to NOA Code Studio are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0-beta] - 2026-04-14

### Added — Production Quality Upgrade (13 Modules)
- **NOA Security Gate** — 3-gate content scanner (prompt injection 17 patterns, code injection 11, PII leakage 10)
- **Token Budget Persistence** — JSON file storage, per-provider tracking, 30-day history, 80% warning
- **Snapshot Manager** — LCS-based diff engine, named snapshots, IndexedDB persistence, LRU eviction (50 max), JSON export/import
- **Keyboard Shortcuts** — 40+ IDE shortcuts registered, macOS Cmd mapping, conflict detection, user-customizable rebinding
- **Keybindings Panel** — Searchable list, 7 categories, click-to-rebind, import/export JSON
- **GitHub API** — Pagination (Link header), search (repos/code/issues), PR reviews, gist CRUD, workflow dispatch, ETag caching, rate limit tracking, retry with backoff
- **Quill Worker Pool** — `worker_threads` parallelism (cpus-1), round-robin batching, progress reporting, cancellation, Tier B/C routing, 1MB file limit, shebang language detection
- **Crash Reporter** — 4 severity levels, structured JSON, session tracking (UUID), SHA-256 deduplication, breadcrumb trail, memory snapshots, optional auto-upload, crash dumps
- **AI Streaming** — AbortController cancellation, retry on 429/503, fallback provider chain, request deduplication (5s TTL), token estimation
- **Ollama** — Model delete/copy, custom endpoint, process auto-detection, RAM compatibility check, pull queue, speed/ETA, tag search
- **Deploy Panel** — Real build execution via shell IPC, streaming log, artifact inspector, ZIP export, git deploy, env var management, build presets
- **Database Panel** — Schema browser, query history with favorites, results export (CSV/JSON), visual query builder, inline cell editing, ER diagram, execution plan

### Changed
- Build artifacts removed from git tracking (.gitignore update)
- shared-types rebuilt with ollama/lmstudio in AIProvider union

## [0.1.0-beta] - 2026-04-13

### Added — Desktop-Only Migration
- **Electron 41 + Next.js 16 + Nextron** packaging pipeline
- **Ollama local models** — health check, model list/info/pull with progress streaming
- **Tab autocomplete (FIM)** — native FIM tokens for 6 model families, sub-200ms local
- **MCP Protocol** — stdio JSON-RPC transport, auto-restart with backoff, heartbeat
- **Multi-file agent** — dependency graph, AI planning, snapshot rollback
- **GitHub REST API** — 9 endpoints (user, repos, PRs, issues, workflows, clone)
- **Production blockers fixed** — fetch timeout (30s), token budget, path traversal protection
- **E2E smoke tests** — 10 Playwright scenarios driving production bundle
- **Crash reporter** — file-based error logging with rotation
- **Performance** — 80ms transitions, conditional theme animation
- **Security** — CSP headers, safeStorage keychain, path validation, COEP/COOP

### Architecture
- Monorepo: `apps/desktop/` + `packages/{quill-engine,quill-cli,shared-types}`
- IPC: 14 namespaces, 120+ handlers via preload bridge (`window.cs`)
- 51-panel UI with PART-based code structure
- Design System v8.0 with semantic tokens

### Infrastructure
- CI pipeline (Ubuntu + Windows matrix)
- Release pipeline (3-OS build matrix, GitHub Releases)
- electron-builder: NSIS + DMG + AppImage + DEB + RPM
- README, CHANGELOG, CONTRIBUTING, SECURITY documentation

## [0.0.1-alpha] - 2026-04-10

### Added — Initial Migration
- Desktop-only migration from eh-universe-web
- Monorepo skeleton (pnpm workspaces + Turborepo)
- Quill Engine extraction (300+ detector rules)
- Basic IPC handlers (fs, quill, keystore, ai, shell, git)
- Theme system (light + dark, WCAG AA contrast)
- CLI installer (symlink/copy with PATH management)
