# Change: Add customizable workspace folders

## Why
The current Pinned/Unpinned/Archived grouping is rigid. Users need customizable folders to organize workspaces by workflow state (e.g. In Progress, Review, Done) similar to Conductor's state system.

## What Changes
- **BREAKING**: Remove pinned chat concept (pinnedChatIds localStorage + UI)
- **BREAKING**: Replace separate archive view with a system "Archived" folder
- New `folders` table with name, Lucide icon, color, position, collapsed state
- New columns on `chats`: `folderId`, `folderPosition` for folder assignment and manual ordering
- New column on `sub_chats`: `position` for manual tab/sidebar ordering
- Sidebar renders folder sections instead of Pinned/Unpinned split
- "Manage folders" panel at bottom of sidebar for CRUD + reorder
- Folder picker in new workspace form (alongside repo picker)
- Each folder header has "+" button to create workspace directly inside it
- Context menu "Move to" and drag-and-drop between folders

## Impact
- Affected code: DB schema, sidebar, chat creation form, context menus, sub-chat tabs, tRPC routers
- Migration: existing pinned chats lose pin state, existing archived chats get moved to system "Archived" folder, all others go to "Uncategorized"
- Removes: `pinnedChatIds` atom/localStorage, separate archive sidebar view, `archivedAt` column (replaced by folderId pointing to Archived folder)
