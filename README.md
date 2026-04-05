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

---

## Highlights

- **Multi-Agent Support** - Claude Code and Codex in one app, switch instantly
- **Visual UI** - Cursor-like desktop app with diff previews and real-time tool execution
- **Custom Models & Providers (BYOK)** - Bring your own API keys
- **Git Worktree Isolation** - Each chat runs in its own isolated worktree
- **Background Agents** - Cloud sandboxes that run when your laptop sleeps
- **Live Browser Previews** - Preview dev branches in a real browser
- **Kanban Board** - Visualize agent sessions
- **Built-in Git Client** - Visual staging, diffs, PR creation, push to GitHub
- **File Viewer** - File preview with Cmd+P search and image viewer
- **Integrated Terminal** - Sidebar or bottom panel with Cmd+J toggle
- **Model Selector** - Switch between models and providers
- **MCP & Plugins** - Server management, plugin marketplace, rich tool display
- **Automations** - Trigger agents from GitHub, Linear, Slack, or manually from git events
- **Chat Forking** - Fork a sub-chat from any assistant message
- **Message Queue** - Queue prompts while an agent is working
- **API** - Run agents programmatically with a single API call
- **Voice Input** - Hold-to-talk dictation
- **Plan Mode** - Structured plans with markdown preview
- **Extended Thinking** - Enabled by default with visual UX
- **Skills & Slash Commands** - Custom skills and slash commands
- **Custom Sub-agents** - Visual task display in sidebar
- **Memory** - CLAUDE.md and AGENTS.md support
- **PWA** - Start and monitor background agents from your phone
- **Cross Platform** - macOS desktop, web app, Windows and Linux

## Features

### Run coding agents the right way

Run agents locally, in worktrees, in background - without touching main branch.

![Worktree Demo](assets/worktree.gif)

- **Git Worktree Isolation** - Each chat session runs in its own isolated worktree
- **Background Execution** - Run agents in background while you continue working
- **Local-first** - All code stays on your machine, no cloud sync required
- **Branch Safety** - Never accidentally commit to main branch
- **Shared Terminals** - Share terminal sessions across local-mode workspaces

---

### UI that finally respects your code

Cursor-like UI with diff previews, built-in git client, and the ability to see changes before they land.

![Cursor UI Demo](assets/cursor-ui.gif)

- **Diff Previews** - See exactly what changes the agent is making in real-time
- **Built-in Git Client** - Stage, commit, push to GitHub, and manage branches without leaving the app
- **Git Activity Badges** - See git operations directly on agent messages
- **Rollback** - Roll back changes from any user message bubble
- **Real-time Tool Execution** - See bash commands, file edits, and web searches as they happen
- **File Viewer** - File preview with Cmd+P search, syntax highlighting, and image viewer
- **Chat Forking** - Fork a sub-chat from any assistant message to explore alternatives
- **Chat Export** - Export conversations for sharing or archival
- **File Mentions** - Reference files directly in chat with @ mentions
- **Message Queue** - Queue up prompts while an agent is working

---

### Plan mode that actually helps you think

The agent asks clarifying questions, builds structured plans, and shows clean markdown preview - all before execution.

![Plan Mode Demo](assets/plan-mode.gif)

- **Clarifying Questions** - The agent asks what it needs to know before starting
- **Structured Plans** - See step-by-step breakdown of what will happen
- **Clean Markdown Preview** - Review plans in readable format
- **Review Before Execution** - Approve or modify the plan before the agent acts
- **Extended Thinking** - Enabled by default with visual thinking gradient
- **Sub-agents** - Visual task list for sub-agents in the details sidebar

---

### Background agents that never sleep

Close your laptop. Your agents keep running in isolated cloud sandboxes with live browser previews.

- **Runs When You Sleep** - Background agents continue working even when your laptop is closed
- **Cloud Sandboxes** - Every background session runs in an isolated cloud environment
- **Live Browser Previews** - See your dev branch running in a real browser

---

### Connect anything with MCP

Full MCP server lifecycle management with a built-in plugin marketplace. No config files needed.

- **MCP Server Management** - Toggle, configure, and delete MCP servers from the UI
- **Plugin Marketplace** - Browse and install plugins with one click
- **Rich Tool Display** - See MCP tool calls with formatted inputs and outputs
- **@ Mentions** - Reference MCP servers directly in chat input

---

### Automations that work while you sleep

Trigger agents from GitHub, Linear, Slack, or manually from git events. Auto-review PRs, fix CI failures, and complete tasks - all configurable.

- **@1code Triggers** - Tag @1code in GitHub, Linear, or Slack to start agents
- **Git Event Triggers** - Run automations on push, PR, or any git event
- **Conditions & Filters** - Control when automations fire
- **Execution Timeline** - Visual history of past runs
- **Silent Mode** - Toggle respond-to-trigger for background automations

Automations require a [Pro or Max subscription](https://1code.dev/pro). Learn more at [1code.dev/agents/async](https://1code.dev/agents/async).


## API

Run coding agents programmatically. Point at a repo, give it a task - the agent runs in a sandbox and delivers a PR.

```bash
curl -X POST https://1code.dev/api/v1/tasks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "repository": "https://github.com/your-org/your-repo",
    "prompt": "Fix the failing CI tests"
  }'
```

- **Remote Sandboxes** - Isolated cloud environment, repo cloned, dependencies installed
- **Git & PR Integration** - Agent commits, pushes branches, opens PRs automatically
- **Async Execution** - Fire and forget, poll for status or get notified
- **Follow-up Messages** - Send additional instructions to a running task

Learn more at [1code.dev/agents/api](https://1code.dev/agents/api)

## Installation

### Option 1: Build from source (free)

```bash
# Prerequisites: Bun, Python 3.11, setuptools, Xcode Command Line Tools (macOS),
# Claude CLI on PATH, Codex CLI on PATH
bun install
bun run build
bun run package:mac  # or package:win, package:linux
```

> **Important:** 1Code uses external `claude` and `codex` executables from your environment. Ensure both commands resolve on PATH before running the app. Optional overrides: `CLAUDE_CODE_EXECUTABLE` and `CODEX_EXECUTABLE`.
>
> **Python note:** Python 3.11 is recommended for native module rebuilds. On Python 3.12+, make sure `setuptools` is installed (`pip install setuptools`).

### Option 2: Subscribe to 1code.dev (recommended)

Get pre-built releases + background agents support by subscribing at [1code.dev](https://1code.dev).

Your subscription helps us maintain and improve 1Code.

## Development

```bash
bun install
bun run dev
```

## Feedback & Community

Join our [Discord](https://discord.gg/8ektTZGnj4) for support and discussions.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
