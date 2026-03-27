## Context

1Code already has a lightweight diff reply path in `active-chat.tsx`: selecting diff text opens `Reply`, `QuickCommentInput` collects one line of text, and the app immediately sends a normal user message containing a diff mention token plus that text.

That flow is useful plumbing, but it does not support the desired review workflow:
- pending comments visible in the diff while reviewing
- pending comments mirrored in the composer before send
- one destination selector for the current workspace
- sending multiple review comments together with normal user text

The diff renderer is built on `@pierre/diffs` and renders inside shadow DOM. That makes inline comment UI the main technical constraint.

## Goals

- Let users create pending review comments from diff selections without sending immediately
- Keep pending comments visible inline in the diff until they are sent or deleted
- Mirror pending comments in the composer as attachment-like items
- Allow normal freeform composer text to be sent in the same action
- Scope send targeting to chats/subchats in the current workspace only
- Reuse the existing chat transport and message rendering as much as possible
- Preserve pending comments when send fails so retry is trivial

## Non-Goals

- Persisting pending review comments across app reloads
- Rendering agent replies inline on the diff
- Rich edit-in-place support for existing drafts
- A brand-new message part type or dedicated sent-message card for review comments
- Reworking the existing tool-edit reply flow beyond keeping it compatible

## Proposed UX

### Draft creation

1. User selects a line or range inside the diff.
2. User chooses `Reply`.
3. Instead of sending immediately, the app creates a `ReviewCommentDraft`.
4. The draft appears:
   - inline in the diff near the selected anchor
   - in the composer as an attachment-like card

Drafts are delete-and-recreate only in v1.

### Target selector

The composer shows one `Sending to <chat>` selector for all pending review comments in the current workspace.

V1 assumption:
- selecting a different target also switches the active subchat to that target

Reason:
- the existing editor text, draft persistence, queue handling, and send pipeline are already subchat-centric
- keeping target and active subchat aligned avoids inventing a hidden second composer state

### Send

The normal send action sends:
- all pending review comment drafts
- any freeform user text in the composer

Each review comment draft is serialized with its own wrapper instruction, for example:

```text
Address this comment:
@[diff:path/to/file.ts:42:preview:...]
Please simplify this branch condition.
```

If there are multiple drafts, the send path concatenates multiple wrapped comment blocks before the freeform text.

On success:
- pending review comments disappear from the diff and composer

On failure:
- pending review comments remain unchanged for retry

## State Model

Add a workspace-scoped in-memory model keyed by parent chat ID:

```ts
type ReviewCommentDraft = {
  id: string
  filePath: string
  lineNumber?: number
  lineType?: "old" | "new"
  selectedText: string
  preview: string
  comment: string
}
```

Companion state:
- `targetSubChatId`

Why workspace-scoped instead of subchat-scoped:
- drafts originate from the workspace diff, not from one chat transcript
- the target selector can point to another subchat in the same workspace

Why in-memory instead of `drafts.ts`:
- user explicitly accepted no reload persistence for v1
- this avoids expanding localStorage draft serialization for a new transient attachment type

## Inline Rendering Strategy

`@pierre/diffs` does not expose an obvious React extension point for line widgets in the current integration. Because the diff content is in shadow DOM, the safest v1 design is:

- keep review-comment data in React state outside the diff library
- anchor each draft by `filePath + lineNumber`
- render a light-DOM overlay or injected sibling card positioned relative to the matching diff row
- if the exact row cannot be resolved after a rerender, fall back to a file-level placement inside the same diff card

This keeps the spec honest about the implementation cost while still meeting the product requirement that pending comments remain visible in the diff.

## Composer Integration

Add a new attachment-like composer card for review comments instead of overloading:
- `DiffTextContext`, which represents raw code context without user comment text
- `PastedTextFile`, which implies file-backed persistence that v1 does not need

The card should show:
- file name / line hint
- short preview of the comment
- delete affordance

The send path can still serialize these drafts into normal text mentions, which keeps downstream chat rendering unchanged.

## Risks / Tradeoffs

- Inline anchoring inside shadow DOM is the highest-risk UI piece.
- Aligning target selection with active subchat is a deliberate simplification; if users later want off-screen targeting without switching tabs, the state model will need to grow.
- Because drafts are in-memory only, they are intentionally lost on full reload.
