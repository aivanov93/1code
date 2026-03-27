"use client"

import { useState } from "react"
import { MessageSquareMore, X } from "lucide-react"
import { cn } from "../../../lib/utils"
import type { ReviewCommentDraft } from "../lib/review-comment-drafts"

interface AgentReviewCommentItemProps {
  draft: ReviewCommentDraft
  onRemove?: () => void
  variant?: "composer" | "inline"
}

export function AgentReviewCommentItem({
  draft,
  onRemove,
  variant = "composer",
}: AgentReviewCommentItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const fileName = draft.filePath.split("/").pop() || draft.filePath
  const lineLabel = draft.lineNumber ? `Line ${draft.lineNumber}` : "Code selection"
  const showRemove = draft.state === "pending" && !!onRemove

  return (
    <div
      className={cn(
        "relative rounded-lg bg-muted/50",
        variant === "composer"
          ? "flex items-center gap-2 min-w-[120px] max-w-[220px] pl-1 pr-2 py-1"
          : "border border-border/60 px-3 py-2"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "shrink-0 rounded-md bg-muted flex items-center justify-center",
        variant === "composer" ? "w-8 self-stretch" : "size-8"
      )}>
        <MessageSquareMore className="size-4 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {fileName}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {lineLabel}
          {draft.lineType && (
            <span className={cn(
              "ml-1",
              draft.lineType === "new" ? "text-green-500" : "text-red-500"
            )}>
              {draft.lineType === "new" ? "Added" : "Removed"}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-foreground/80 truncate">
          {draft.comment}
        </div>
      </div>

      {showRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className={cn(
            "absolute size-4 rounded-full bg-background border border-border flex items-center justify-center",
            "text-muted-foreground hover:text-foreground transition-[opacity,transform] duration-150 ease-out active:scale-[0.97] z-10",
            variant === "composer" ? "-top-1.5 -right-1.5" : "top-2 right-2",
            isHovered ? "opacity-100" : "opacity-0"
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
