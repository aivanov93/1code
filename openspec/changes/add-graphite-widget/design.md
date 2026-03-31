## Context

The details sidebar already has a first-class widget registry in [src/renderer/features/details-sidebar/atoms/index.ts](../../../src/renderer/features/details-sidebar/atoms/index.ts). Widget visibility and order are persisted per workspace/chat, and the sidebar itself already scrolls vertically.

Today the git surface is split across the `Changes` widget/panel for file-level diff, staging, commit, and sync work, plus a small PR badge in the changes header backed by `gh`.

There is no stack-aware view in the product, and there is no general renderer-plugin API that would make this a third-party add-on. The right shape is a new built-in widget in the existing details-sidebar system.

The local Graphite CLI installed in this environment exposes `gt ls` as an alias for `gt log short` and supports stack filtering, but it does not expose an obvious JSON mode in the help output. That means v1 should treat Graphite as a CLI-wrapper integration with explicit parsing in the main process.

## Goals

- Add a first-class `Graphite` widget to the existing details sidebar
- Preserve the current split: `Graphite` = repo stack tree + current-stack PR summary
- Preserve the current split: `Changes` = file-level diff / commit / sync
- Default-enable the widget for local workspaces while keeping the existing per-workspace widget visibility/order model
- Show the full repo Graphite tree and the current stack's PR summary in one widget card
- Keep v1 read-only, link-first, and low-risk

## Non-Goals

- Restack, sync, submit, create branch, rename branch, move branch, or any other Graphite mutation
- Expanded Graphite sidebar/panel mode
- File-level integration with `Changes`
- Remote/sandbox chat support
- A native stack model independent of Graphite CLI

## Decisions

### 1. Widget registration and placement

Add a new `graphite` widget to `WIDGET_REGISTRY`:
- label: `Graphite`
- icon: existing Lucide icon, no Graphite branding requirement
- `defaultVisible: true`
- `canExpand: false`

Place it immediately after `diff` in the default widget order. Because widget visibility and order are already per workspace/chat, Graphite follows the same behavior instead of introducing a global exception.

### 2. Eligibility and empty states

The widget is local-only. Remote/sandbox chats do not render the widget.

For local workspaces, the widget always occupies its registry slot, but its body can be one of three states:
- `gt missing` -> install/setup empty state with CTA
- `repo not initialized / current branch not tracked by Graphite` -> init empty state with CTA
- `Graphite available` -> render the read-only widget content

Eligibility rule for populated content:
- `gt` must be executable
- the repo-level Graphite listing command must succeed
- the current branch must be present in Graphite-tracked output

This matches the requirement that v1 only works when Graphite is installed and the branch is actually Graphite-tracked.

### 3. Data sources

Use the main process as the single owner of Graphite shelling/parsing.

Preferred sources:
- full repo tree: `gt ls --all` or equivalent Graphite stack-listing command
- current stack PR list: `gt log --stack` or another Graphite command that returns current-stack PR data with links
- GitHub enrichment: existing `gh`-backed helpers and/or lightweight additional `gh` calls when available

Reasoning:
- Graphite tree shape and worktree placement should come from Graphite, not inferred locally
- PR status, review state, and checks are already a solved `gh` problem in the codebase
- the renderer should never parse shell output directly

Because the current CLI help does not show a JSON mode, v1 should normalize command output through a dedicated parser module and return a stable typed payload to the renderer. If implementation discovers a more structured Graphite command, the query contract can stay the same while swapping internals.

### 4. Widget data model

The tRPC query should return one normalized payload that covers:
- repo eligibility / empty-state kind
- full repo tree rows
- current stack PR rows
- metadata availability flags

Suggested shape:

```ts
type GraphiteWidgetData =
  | { kind: "missing_gt" }
  | { kind: "not_initialized" }
  | {
      kind: "ready"
      tree: Array<{
        id: string
        branchName: string
        depth: number
        isCurrent: boolean
        worktreeName?: string
        graphiteUrl?: string
      }>
      currentStackPrs: Array<{
        branchName: string
        prNumber?: number
        graphiteUrl?: string
        githubUrl?: string
        state?: "open" | "draft" | "merged" | "closed"
        reviewDecision?: "approved" | "changes_requested" | "pending"
        checksStatus?: "success" | "failure" | "pending" | "none"
        failingChecks?: string[]
      }>
      metadata: {
        hasGitHubMetadata: boolean
      }
    }
```

The exact parser internals can change, but the renderer should work against a stable, typed shape like this.

### 5. UI structure

The widget stays inside the normal details sidebar card and does not open an expanded panel.

Within the card:
- top section: full repo tree in a `gt ls`-inspired hierarchy
- bottom section: current stack PR list ordered tip -> trunk

Tree rows show only:
- branch name
- worktree basename when present

PR rows show:
- PR number
- Graphite link
- GitHub link
- PR state
- review decision
- aggregate checks state
- names of failing checks when any exist

The widget should not add its own internal height cap. The details sidebar already scrolls, and the user explicitly wants the full tree visible there.

### 6. Interaction model

V1 is read-only and link-first:
- tree row click: no-op unless a Graphite PR link exists, then open the Graphite PR
- PR row click: open the Graphite PR
- header/title click: no action

No mutation buttons belong in v1:
- no sync
- no restack
- no submit
- no checkout
- no create/move/delete branch

### 7. GitHub fallback behavior

If Graphite data is available but `gh` is missing or unauthenticated:
- still render the full repo tree
- still render any current-stack PR data available from Graphite
- omit or degrade fields that depend on GitHub metadata
- show a small inline note that PR enrichment is unavailable rather than replacing the whole widget with an error

This keeps the core Graphite value visible even when GitHub enrichment is unavailable.

## Risks / Tradeoffs

- Parsing human-oriented Graphite CLI output is the main implementation risk. The parser should be isolated and heavily normalized at the boundary.
- The full-tree view can get tall in repos with many stacks, but using the existing sidebar scroll is the least surprising behavior and matches the requirement.
- Default-enabling the widget increases sidebar density. Because visibility is already user-configurable per workspace, the opt-out path is consistent with the rest of the system.

## Open Questions

- Exact CTA target for install/init states is still implementation-defined. The proposal only requires a visible CTA, not a final destination or command.
