# Contributing to NOA Code Studio

Thank you for your interest in contributing.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Git
- (Optional) Ollama for local AI testing

## Setup

```bash
git clone https://github.com/gilheumpark-bit/noa-code-studio.git
cd noa-code-studio
pnpm install
```

## Development

```bash
# Run in dev mode with hot reload
pnpm --filter eh-code-studio-desktop run dev:electron

# Type check + lint
pnpm --filter eh-code-studio-desktop run verify:static

# Unit tests
pnpm --filter eh-code-studio-desktop run test

# E2E tests (requires built app)
pnpm --filter eh-code-studio-desktop run test:e2e
```

## Code Standards

### Architecture Rules

1. **IPC Security** — Renderer NEVER accesses Node.js directly. All privileged ops go through `window.cs` preload bridge.
2. **Keystore** — API keys stored via `electron.safeStorage`. Preload exposes `set/has/list/delete` but NEVER `get`.
3. **Panel Registry** — All panels registered in `core/panel-registry.ts`. No hardcoding panel imports.
4. **PART Structure** — Files over 100 lines must use PART-based sections with clear separation headers.

### Design System (v8.0)

- **Semantic tokens only** — `bg-bg-primary`, `text-text-primary`, not raw Tailwind
- **Z-index variables** — `var(--z-dropdown)`, `var(--z-modal)`, not numbers
- **4px grid** — `--sp-xs`(4px) through `--sp-2xl`(32px)
- **Touch targets** — Minimum 44px
- **Focus** — `focus-visible:ring-2 ring-accent-blue`, never `outline: none` alone
- **State indicators** — Color + icon + text (minimum 2 of 3)

### Code Quality

- TypeScript strict mode (`noEmit --strict`)
- No `@ts-ignore` without explanation comment
- All IPC handlers must have try/catch with structured error returns
- No `eval()`, `exec()`, `__import__()`, `os.system()`, `new Function()` in production code

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `feat/your-feature` or `fix/your-fix`
3. Ensure `verify:static` passes with 0 errors
4. Ensure tests pass
5. Submit PR using the template
6. Wait for review

### Commit Convention

```
type(scope): description

Types: feat, fix, refactor, docs, test, chore, perf
Scopes: desktop, renderer, ipc, quill, ai, git, mcp, docs
```

Examples:
```
feat(ipc): add request cancellation to AI streaming
fix(renderer): prevent hydration mismatch in ScopeShell
docs: update ARCHITECTURE.md for worker pool
```

## Project Structure

```
apps/desktop/
  main/           # Electron main (Node.js)
    ipc/          # IPC handlers (one file per domain)
    services/     # Business logic
    workers/      # worker_threads
  renderer/       # Next.js 16 (React 19)
    components/   # UI components
    hooks/        # Custom hooks
    lib/          # Feature libraries
packages/
  quill-engine/   # Verification engine
  quill-cli/      # CLI tool
  shared-types/   # Shared types
```

## Reporting Issues

- **Bugs:** Use the [Bug Report](https://github.com/gilheumpark-bit/noa-code-studio/issues/new?template=bug_report.md) template
- **Features:** Use the [Feature Request](https://github.com/gilheumpark-bit/noa-code-studio/issues/new?template=feature_request.md) template
- **Security:** See [SECURITY.md](SECURITY.md) for responsible disclosure
