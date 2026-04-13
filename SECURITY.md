# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x-beta | Yes |
| 0.1.x-beta | Security fixes only |
| < 0.1.0 | No |

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Email: gilheumpark.bit@gmail.com
Or: Open a [GitHub Security Advisory](https://github.com/gilheumpark-bit/noa-code-studio/security/advisories/new)

We will respond within 72 hours and provide a fix timeline.

## Security Architecture

### Process Isolation

| Layer | Access | Restrictions |
|-------|--------|-------------|
| Main process | Full OS | Handles all privileged operations |
| Preload bridge | IPC only | `contextIsolation: true`, whitelisted channels only |
| Renderer | Web sandbox | `nodeIntegration: false`, no direct Node.js access |

### API Key Protection

- Keys stored via `electron.safeStorage` (DPAPI on Windows, Keychain on macOS, libsecret on Linux)
- Preload exposes `keystore.set()`, `keystore.has()`, `keystore.list()`, `keystore.delete()`
- **No `keystore.get()` exists** — keys never leave the main process
- Keys injected into HTTP headers at request time, never sent to renderer

### NOA Security Gate

Every AI request passes through a 3-layer scanner before reaching any provider:

| Gate | Patterns | What It Blocks |
|------|----------|---------------|
| Prompt Injection | 17 | System prompt override, jailbreak, DAN mode, role-play exploits |
| Code Injection | 11 | eval(), exec(), subprocess, new Function(), destructive fs ops |
| PII Leakage | 10 | SSN, credit card numbers, API keys (OpenAI/Google/Anthropic/GitHub/AWS/Slack) |

Sensitivity configurable: `strict` / `normal` (default) / `permissive`

### File System Security

- **Path traversal protection** — `validatePath()` blocks null bytes, `../` chains, and sensitive system paths (`/etc/shadow`, `System32`, `SAM`)
- **Watcher isolation** — chokidar ignores `node_modules`, `.git`, `.next`, `dist`, `coverage`
- **Size limits** — Quill verification skips files > 1MB

### Network Security

- **COEP/COOP headers** in production builds
- **CSP headers** in development
- **15-second timeout** on all GitHub API requests
- **30-second timeout** on AI streaming requests
- **ETag caching** with 5-minute hard TTL (no stale data)

### MCP Server Security

- Each MCP server runs as an isolated child process
- SIGTERM with 5-second SIGKILL fallback on stop
- Maximum 3 auto-restart attempts before marking as error
- Config persistence to `userData/mcp-servers.json` (not in project directory)

### Known Limitations

| Item | Status | Mitigation |
|------|--------|-----------|
| `sandbox: false` in preload | Required for chokidar + node-pty | contextIsolation still enforced |
| `forceCodeSigning: false` | Beta release | Will enforce before v1.0 |
| Ollama HTTP unencrypted | localhost only | Document in settings UI |
| No CSP in production renderer | Static export limitation | COEP/COOP compensate |

## Severity Classification

| Level | Description | Response Time |
|-------|-------------|--------------|
| P0 — Critical | Remote code execution, key exfiltration | 24 hours |
| P1 — High | Path traversal, auth bypass, data loss | 72 hours |
| P2 — Medium | XSS in renderer, info disclosure | 1 week |
| P3 — Low | UI spoofing, minor info leak | Next release |
