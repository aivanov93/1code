# Change: add Graphite widget

## Why
1Code already has file-level `Changes` UI and a lightweight PR badge, but it does not expose Graphite's stack mental model anywhere in the product. Users working in stacked-PR repos need a quick read of the full branch tree, current-stack PR state, and cross-worktree placement without dropping to terminal or external tools.

## What Changes
- Add a new default-enabled `Graphite` widget to the details sidebar as a first-class widget, following the existing per-workspace visibility and ordering model
- Place `Graphite` after `Changes` in the default widget order and keep it non-expandable in v1
- Show the full repo stack tree from `gt ls`-style data with branch name plus checked-out worktree basename
- Show the current stack's PR list ordered tip -> trunk with Graphite and GitHub links, PR state, review status, and checks summary when available
- Keep v1 read-only and local-only: no stack mutations, no expanded panel, no file-level behavior
- Show install/init empty states when `gt` is unavailable or the repo/current branch is not Graphite-tracked, and degrade to stack-only when `gh` metadata is unavailable

## Impact
- Affected specs: `graphite-widget`
- Affected code: [details-sidebar atoms](../../../src/renderer/features/details-sidebar/atoms/index.ts), [widget settings popup](../../../src/renderer/features/details-sidebar/widget-settings-popup.tsx), [details sidebar](../../../src/renderer/features/details-sidebar/details-sidebar.tsx), new Graphite widget renderer files, new main-process Graphite CLI wrapper/parser, git/tRPC query surface, GitHub metadata enrichment
