## 1. Implementation
- [x] 1.1 Add workspace-scoped in-memory review comment draft state and target-subchat state
- [x] 1.2 Change diff quick reply from immediate send to draft creation
- [x] 1.3 Render pending review comments inline in the diff and as attachment-like items in the composer
- [x] 1.4 Add a workspace-scoped `Sending to <chat>` selector that keeps send target and active subchat aligned
- [x] 1.5 Serialize pending review comments into the normal send / queue path with one wrapper instruction per comment plus optional freeform text
- [x] 1.6 Clear pending review comments only after successful send and keep them unchanged on send failure
- [ ] 1.7 Manually verify multi-comment drafting, target switching, success clearing, and failure retry behavior
