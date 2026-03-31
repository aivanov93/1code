## 1. Database Schema & Migration
- [ ] 1.1 Add `folders` table (id, name, icon, color, position, collapsed, system, createdAt, updatedAt)
- [ ] 1.2 Add `folderId` and `folderPosition` columns to `chats` table
- [ ] 1.3 Add `position` column to `sub_chats` table
- [ ] 1.4 Generate Drizzle migration
- [ ] 1.5 Write migration logic: seed system folders, assign existing chats (archived -> Archived folder, rest -> Uncategorized), set initial position values

## 2. tRPC Routers
- [ ] 2.1 Create `folders` router: list, create, update, delete, reorder
- [ ] 2.2 Update `chats` router: add moveToFolder, reorderInFolder mutations
- [ ] 2.3 Update `subChats` router: add reorder mutation
- [ ] 2.4 Update chat creation to accept optional `folderId`

## 3. Sidebar Refactor
- [ ] 3.1 Remove `pinnedChatIds` atom and all pin-related UI (toggle, sort logic, ChatListSection split)
- [ ] 3.2 Remove separate archive sidebar view/toggle
- [ ] 3.3 Create `FolderSection` component (collapsible header with colored icon, name, count, "+" button)
- [ ] 3.4 Render folders in order: Uncategorized (top), user folders (manual order), Archived (bottom)
- [ ] 3.5 Group chats by folderId, order by folderPosition within each folder
- [ ] 3.6 Persist folder collapsed state to DB on toggle

## 4. Move To / Drag-and-Drop
- [ ] 4.1 Add "Move to -> [folder]" to chat context menu
- [ ] 4.2 Implement drag-and-drop reordering of chats within a folder
- [ ] 4.3 Implement drag-and-drop of chats between folders
- [ ] 4.4 Implement drag-and-drop reordering of folders in sidebar

## 5. Sub-Chat Manual Ordering
- [ ] 5.1 Implement drag-and-drop reorder for sub-chat tabs
- [ ] 5.2 Implement drag-and-drop reorder for sub-chat sidebar rows
- [ ] 5.3 Persist sub-chat position to DB on reorder

## 6. Manage Folders Panel
- [ ] 6.1 Add "Manage folders" button at sidebar bottom (near settings)
- [ ] 6.2 Build panel UI: folder list with drag reorder, inline rename, color picker, icon picker, delete
- [ ] 6.3 Color picker: curated palette (8-12 colors)
- [ ] 6.4 Icon picker: searchable Lucide icon grid with preview
- [ ] 6.5 "Add folder" action in panel

## 7. New Workspace Form
- [ ] 7.1 Add folder picker dropdown to new workspace form (alongside repo picker)
- [ ] 7.2 Default to Uncategorized; folder "+" button pre-selects that folder

## 8. Cleanup
- [ ] 8.1 Remove `archivedAt` usage from queries, filters, and UI
- [ ] 8.2 Remove archive-related tRPC mutations (archiveChat, archiveChatsBatch, etc.) or redirect them to move-to-Archived
- [ ] 8.3 Clean up unused imports, atoms, types
