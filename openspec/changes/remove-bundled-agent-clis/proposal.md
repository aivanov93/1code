# Change: remove bundled agent CLIs

## Why
1Code currently hardcodes bundled Claude and Codex binaries under `resources/bin`. That blocks custom local wrappers like AirChat shims and makes local development depend on download steps that do not match this machine's setup.

## What Changes
- Resolve Claude and Codex executables from the environment instead of `resources/bin`
- Honor `CLAUDE_CODE_EXECUTABLE` for Claude and `CODEX_EXECUTABLE` for Codex before falling back to PATH lookup
- Remove build, release, and docs assumptions that bundled agent binaries must be downloaded and packaged

## Impact
- Affected specs: `agent-cli-resolution`
- Affected code: `src/main/lib/claude/env.ts`, `src/main/lib/trpc/routers/claude.ts`, `src/main/lib/trpc/routers/codex.ts`, `src/main/index.ts`, `package.json`, `README.md`
