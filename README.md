# 1Code (fork)

> Personal fork of [21st-dev/1code](https://github.com/21st-dev/1code) with local-first focus, performance hardening, and UX improvements.

Original project: [1Code.dev](https://1code.dev) by [21st.dev](https://21st.dev)

## Fork Changes

**Local-only mode** - Removed 21st.dev auth gating entirely. The app runs as a purely local tool with no remote account, no remote sync, no remote chat naming. Controlled by a single `DESKTOP_LOCAL_ONLY` flag.

**External CLI resolution** - Removed bundled `claude`/`codex` binaries and download scripts. The app now resolves `claude` and `codex` from PATH (or via `CLAUDE_CODE_EXECUTABLE`/`CODEX_EXECUTABLE` env vars). Simpler builds, always uses your installed versions.

**Configurable model catalogs** - Replaced hardcoded model lists with user-editable catalog tables in Settings. Add, remove, reorder models. Defaults are seeded but fully customizable.

**Workspace folders** - New folder system for organizing chats with drag-and-drop reordering, system folders (Uncategorized/Archived), and fractional-index positioning.

**Performance hardening** - Git status timeouts (15s) and file-count caps (5000). Killed expensive polling (lsof every 2.5s, sidebar/kanban 5s queries). IPC payload trimming strips old tool output to keep the bridge fast. Lazy-loaded folder icons (48 curated vs 1500+ lucide imports).

**Stream diagnostics** - Structured `[SD]` logging on both main and renderer for debugging streaming issues. Heartbeat detection, gap logging, abort reason tracking, and auto-complete for stuck tool states.

**Effort levels** - Replaced binary "thinking on/off" with granular effort levels (low/medium/high/max) for both Claude and Codex models via a unified inline submenu.

**Process stability** - Child-process spy logging, event-loop stall detection, orphan SDK process cleanup, and stale stream detection (45s timeout with terminal-aware suppression).

**UI/UX improvements** - Inline rename for workspaces/chats (double-click). Diff comment drafts. Sub-chat notes field. Manual refresh for diffs (replaces chokidar polling). Tighter sidebar spacing. Working/branch diff scope toggle.

**Dev tooling** - DevTools and debug tab always shown in production. Perf debugging toggles. Electron Playwright test harness. Sentry removed.

## Setup

```bash
# Prerequisites: Bun, Python 3.11+, claude and codex CLIs on PATH
bun install
bun run dev          # development with hot reload
bun run build        # compile
bun run package:mac  # package for macOS (or package:win, package:linux)
```

Env var overrides: `CLAUDE_CODE_EXECUTABLE`, `CODEX_EXECUTABLE`.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
