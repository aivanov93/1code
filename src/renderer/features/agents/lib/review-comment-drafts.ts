export type ReviewCommentDraftState = "pending" | "queued"

export interface ReviewCommentDraft {
  id: string
  filePath: string
  lineNumber?: number
  lineType?: "old" | "new"
  selectedText: string
  selectedTextPreview: string
  comment: string
  state: ReviewCommentDraftState
}

export function createReviewCommentDraftId(): string {
  return `rcd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function createReviewCommentPreview(text: string, maxLength: number = 50): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}...`
}

export function serializeReviewCommentDraft(draft: ReviewCommentDraft): string {
  const fileName = draft.filePath.split("/").pop() || draft.filePath
  const location = draft.lineNumber ? `${fileName}:${draft.lineNumber}` : fileName
  return `${location}\n${draft.comment.trim()}`
}

export function serializeReviewCommentDrafts(drafts: ReviewCommentDraft[]): string {
  return drafts.map(serializeReviewCommentDraft).join("\n\n")
}
