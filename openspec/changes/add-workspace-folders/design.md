## Context
Replace hardcoded Pinned/Unpinned/Archived grouping with user-defined folders. Global scope (not per-project). Two system folders (Uncategorized, Archived) always exist and can't be deleted.

## Goals / Non-Goals
- Goals: customizable folder CRUD, manual ordering of folders/chats/sub-chats, color + icon per folder, collapsible with persisted state, "Move to" context menu + drag-and-drop, folder picker in new workspace form
- Non-Goals: per-project folder scoping, folder nesting/hierarchy, smart filters/rules, Kanban view integration (separate feature driven by agent status)

## Decisions

### Folders are global, not per-project
Workspaces already span projects. Folder = workflow state, not project grouping. Keeps the model simple.

### System folders: Uncategorized (top) + Archived (bottom)
- Uncategorized: always first, receives orphans on folder delete, default for new workspaces
- Archived: always last, replaces current `archivedAt` column + separate archive view
- Both are real DB rows with a `system` flag so they can't be deleted or reordered

### Position columns use fractional indexing
Use string-based fractional indices (e.g. lexorank or simple "a0", "a1" style) for `folders.position`, `chats.folderPosition`, and `sub_chats.position`. Avoids rewriting every row on reorder.

### archivedAt migration
Existing `archivedAt` chats get `folderId` set to the system Archived folder. After migration, `archivedAt` column can be dropped (or left nullable and ignored). The "archived" concept becomes "chat is in the Archived folder".

### Pinned removal
`pinnedChatIds` lives in localStorage (Jotai atomWithStorage). Remove the atom, the pin toggle UI, and the ChatListSection split. No DB migration needed for pins.

### Manage folders panel
Opened from a "Manage folders" button at sidebar bottom (near settings). Panel allows: add, rename, delete, reorder (drag), pick color (preset palette), pick Lucide icon. Not a modal - likely a popover or slide-out anchored to the button.

### Folder color palette
Small curated palette (8-12 colors) matching the app's dark theme. Color is applied to the folder's Lucide icon in the sidebar header.

### Lucide icon picker
Searchable icon grid in the manage panel. Default icon assigned on creation (e.g. "folder"). User can change to any Lucide icon.

## Risks / Trade-offs
- Fractional indexing adds slight complexity vs integer positions, but avoids O(n) updates on reorder
- Removing pinned is a breaking UX change for existing users; mitigated by being a small user base
- Drag-and-drop between folders is non-trivial; can ship context menu "Move to" first, DnD as fast-follow

## Migration Plan
1. Add `folders` table, seed system folders (Uncategorized, Archived)
2. Add `folderId` + `folderPosition` to `chats`, `position` to `sub_chats`
3. Migrate: chats with `archivedAt` -> folderId = Archived folder, rest -> folderId = Uncategorized
4. Set initial `folderPosition` based on current `updatedAt` ordering
5. Set initial `sub_chats.position` based on current `createdAt` ordering
6. Remove `pinnedChatIds` atom and all pin-related UI
7. Remove separate archive sidebar view

## Open Questions
- Should we keep `archivedAt` column for backward compat, or drop it after migration?
- Exact visual design of the manage folders panel (popover vs slide-out)
