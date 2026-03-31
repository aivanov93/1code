## ADDED Requirements

### Requirement: Folder Data Model
The system SHALL store folders with id, name, icon (Lucide icon key), color (hex), position (fractional index string), collapsed (boolean), and a system flag. Folders are global (not scoped per project).

#### Scenario: System folders seeded on first run
- **WHEN** the database is initialized for the first time
- **THEN** two system folders SHALL be created: "Uncategorized" (position first) and "Archived" (position last)

#### Scenario: System folders cannot be deleted
- **WHEN** a user attempts to delete a system folder
- **THEN** the operation SHALL be rejected

### Requirement: Chat Folder Assignment
Each chat SHALL have a nullable `folderId` referencing a folder and a `folderPosition` (fractional index string) for manual ordering within the folder. Chats without a folderId SHALL appear in Uncategorized.

#### Scenario: New workspace defaults to Uncategorized
- **WHEN** a workspace is created without specifying a folder
- **THEN** the chat SHALL be assigned to the Uncategorized folder

#### Scenario: New workspace created from folder "+" button
- **WHEN** a user clicks the "+" button on a folder header
- **THEN** a new workspace form SHALL open with that folder pre-selected

#### Scenario: Folder deleted with chats inside
- **WHEN** a user deletes a folder containing chats
- **THEN** all chats in that folder SHALL be moved to Uncategorized

### Requirement: Sub-Chat Manual Ordering
Each sub-chat SHALL have a `position` (fractional index string) for manual ordering within its parent workspace.

#### Scenario: Sub-chat reorder via drag
- **WHEN** a user drags a sub-chat tab or sidebar row to a new position
- **THEN** the sub-chat's position SHALL be updated and the new order persisted to DB

### Requirement: Sidebar Folder Rendering
The sidebar SHALL render workspaces grouped by folder in order: Uncategorized (always top), user-created folders (manual order), Archived (always bottom). Each folder section SHALL be collapsible with persisted collapsed state.

#### Scenario: Folder section header
- **WHEN** a folder is rendered in the sidebar
- **THEN** it SHALL display: colored Lucide icon, folder name, workspace count, and a "+" button to create a workspace in that folder

#### Scenario: Empty folder visibility
- **WHEN** a folder has no workspaces
- **THEN** it SHALL still be visible in the sidebar

#### Scenario: Collapsed state persistence
- **WHEN** a user collapses or expands a folder
- **THEN** the collapsed state SHALL be saved to the DB and restored on next app launch

### Requirement: Move Workspace Between Folders
Users SHALL be able to move workspaces between folders via context menu "Move to -> [folder name]" and via drag-and-drop between folder sections.

#### Scenario: Move via context menu
- **WHEN** a user right-clicks a workspace and selects "Move to -> Review"
- **THEN** the workspace's folderId SHALL update to the Review folder

#### Scenario: Move via drag-and-drop
- **WHEN** a user drags a workspace from one folder section to another
- **THEN** the workspace SHALL be reassigned to the target folder at the drop position

### Requirement: Manual Ordering
Users SHALL be able to manually reorder folders, workspaces within folders, and sub-chats within workspaces via drag-and-drop. All ordering is persisted to the DB.

#### Scenario: Reorder folders in sidebar
- **WHEN** a user drags a folder header to a new position
- **THEN** the folder order SHALL update (system folders stay pinned to top/bottom)

#### Scenario: Reorder workspaces within a folder
- **WHEN** a user drags a workspace row within a folder section
- **THEN** the workspace's folderPosition SHALL update

### Requirement: Manage Folders Panel
A "Manage folders" button at the bottom of the sidebar (near settings) SHALL open a panel where users can add, rename, delete, reorder, and customize folders.

#### Scenario: Add folder
- **WHEN** a user clicks "Add folder" in the manage panel
- **THEN** a new folder SHALL be created with a default name, icon, and color

#### Scenario: Customize folder
- **WHEN** a user edits a folder in the manage panel
- **THEN** they SHALL be able to change name (inline), color (curated palette of 8-12 colors), and icon (searchable Lucide icon grid)

#### Scenario: Delete folder
- **WHEN** a user deletes a non-system folder
- **THEN** the folder SHALL be removed and its workspaces moved to Uncategorized

### Requirement: Folder Picker in New Workspace Form
The new workspace creation form SHALL include a folder picker dropdown alongside the repo picker. Default selection is Uncategorized.

#### Scenario: Create workspace with folder
- **WHEN** a user creates a workspace and selects "In Progress" from the folder picker
- **THEN** the new workspace SHALL be placed in the "In Progress" folder

## REMOVED Requirements

### Requirement: Pinned Workspaces
**Reason**: Replaced by customizable folders. Users can create a "Priority" or equivalent folder instead.
**Migration**: pinnedChatIds in localStorage is discarded. No data loss since pins were cosmetic.

### Requirement: Separate Archive View
**Reason**: Archived becomes a system folder visible in the main sidebar. No separate view needed.
**Migration**: Chats with `archivedAt` set are moved to the system Archived folder.
