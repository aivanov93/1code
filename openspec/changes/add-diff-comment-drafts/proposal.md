# Change: diff comment drafts for chat review

## Why
1Code already supports a one-shot diff reply flow, but it sends immediately into the active subchat. That is weaker than the Conductor-style review pass the user wants: collect multiple comments in the diff, keep them visible while reviewing, mirror them in the composer, and send them together with normal chat text.

## What Changes
- Replace one-shot diff reply with pending diff comment drafts that stay visible inline until sent or deleted
- Mirror pending diff comment drafts in the composer as attachment-like items
- Add a workspace-scoped `Sending to <chat>` selector for pending review comments
- Send pending review comments through the normal chat send flow with one wrapper instruction per comment
- Keep review comment drafts in memory only for v1 and preserve them on send failure

## Impact
- Affected specs: `diff-comment-drafts`
- Affected code: `src/renderer/features/agents/main/active-chat.tsx`, `src/renderer/features/agents/main/chat-input-area.tsx`, `src/renderer/features/agents/ui/agent-diff-view.tsx`, text selection / quick comment UI, composer attachment UI, workspace subchat targeting state
