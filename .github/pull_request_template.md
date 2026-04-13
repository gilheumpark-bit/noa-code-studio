## Summary

<!-- Brief description of changes (1-3 sentences) -->

## Type

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `refactor` — Code restructuring (no behavior change)
- [ ] `docs` — Documentation only
- [ ] `test` — Test additions/changes
- [ ] `perf` — Performance improvement
- [ ] `chore` — Build/CI/tooling

## Changes

<!-- What changed and why -->

-
-

## Affected Areas

- [ ] Main process (IPC handlers, services)
- [ ] Renderer (components, hooks, lib)
- [ ] Packages (quill-engine, quill-cli, shared-types)
- [ ] CI/CD (workflows, electron-builder)
- [ ] Documentation

## Checklist

- [ ] `verify:static` passes (0 TypeScript errors, 0 lint errors)
- [ ] Tests pass (`pnpm test`)
- [ ] No `eval()`, `exec()`, or `new Function()` in production code
- [ ] IPC handlers have try/catch with structured error returns
- [ ] Semantic tokens used (no raw Tailwind colors)
- [ ] PART headers added for files > 100 lines

## Related Issues

Closes #
