## ADDED Requirements

### Requirement: Create Pending Diff Comment Drafts

The system SHALL let users create pending review comment drafts from a selected diff line or range without sending a chat message immediately.

#### Scenario: Create a draft from a diff selection

- **WHEN** a user selects text in the diff and chooses to reply
- **THEN** the system creates a pending review comment draft anchored to that diff context
- **AND** the system does not send a chat message yet
- **AND** the draft remains visible in the diff until it is sent or deleted

#### Scenario: Delete a pending draft before send

- **WHEN** a user removes a pending review comment draft before sending
- **THEN** the draft is removed from the diff
- **AND** the draft is removed from the composer

### Requirement: Mirror Pending Drafts In The Composer

The system SHALL mirror pending diff comment drafts in the composer as attachment-like items and allow them to be sent alongside freeform user text.

#### Scenario: Compose freeform text with pending drafts

- **WHEN** one or more pending review comment drafts exist
- **THEN** the composer shows one attachment-like item per draft
- **AND** the user can still type normal composer text
- **AND** the normal send action can send both the drafts and the freeform text together

### Requirement: Use A Workspace-Scoped Send Target

The system SHALL apply one workspace-scoped send target for all pending review comment drafts.

#### Scenario: Change the send target

- **WHEN** a user changes `Sending to <chat>` to another chat or subchat in the current workspace
- **THEN** all pending review comment drafts use that target for the next send
- **AND** the visible active subchat aligns with that target so freeform text and review drafts share one composer context

### Requirement: Send And Retry Review Comments Safely

The system SHALL send pending review comment drafts through the normal chat send flow using one wrapper instruction per draft, clear them on success, and preserve them on failure.

#### Scenario: Successful send clears drafts

- **WHEN** a user sends composer content with one or more pending review comment drafts
- **THEN** each draft is included in the outgoing user message with its diff context and comment text
- **AND** any freeform composer text is sent in the same action
- **AND** the pending review comment drafts disappear from the diff and composer after the send succeeds

#### Scenario: Failed send preserves drafts for retry

- **WHEN** sending composer content with pending review comment drafts fails
- **THEN** the pending review comment drafts remain visible in the diff unchanged
- **AND** the pending review comment drafts remain visible in the composer unchanged
