## 1. Implementation
- [ ] 1.1 Add `graphite` to the details-sidebar widget registry with `defaultVisible: true`, `canExpand: false`, and default order immediately after `diff`
- [ ] 1.2 Add a main-process Graphite data layer that detects `gt`, normalizes `gt ls` full-tree output, and normalizes current-stack PR data from `gt log` or an equivalent Graphite command
- [ ] 1.3 Reuse existing GitHub metadata plumbing where possible to enrich Graphite PR items with state, review decision, checks summary, failing check names, and GitHub URLs when `gh` is available
- [ ] 1.4 Expose one read-only tRPC query for the widget data and empty-state eligibility
- [ ] 1.5 Build the renderer widget UI with full-tree view, current-stack PR list, outbound links, and empty/error states
- [ ] 1.6 Hide the widget for remote/sandbox chats and keep it read-only with no mutation affordances or expanded mode
- [ ] 1.7 Manually verify default ordering, per-workspace visibility persistence, `gt` missing state, repo-not-initialized state, stack-only fallback without `gh`, and a populated Graphite repo
