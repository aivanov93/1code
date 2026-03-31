"use client"

import { memo, useState, useCallback, useRef, useEffect } from "react"
import { trpc } from "@/lib/trpc"

interface NotesWidgetProps {
  subChatId: string | null
}

/**
 * Freeform notes widget persisted per sub-chat.
 * Auto-saves on blur and after a debounce while typing.
 */
export const NotesWidget = memo(function NotesWidget({ subChatId }: NotesWidgetProps) {
  const [localValue, setLocalValue] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: subChat } = trpc.chats.getSubChat.useQuery(
    { id: subChatId! },
    { enabled: !!subChatId },
  )

  const mutation = trpc.chats.updateSubChatNotes.useMutation()

  // Sync from server when the active subchat changes
  useEffect(() => {
    if (subChatId !== editingId) {
      // Flush pending save for the previous subchat
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      setLocalValue(subChatId && subChat ? (subChat.notes ?? "") : "")
      setEditingId(subChatId)
    }
  }, [subChatId, subChat, editingId])

  const save = useCallback((value: string) => {
    if (!subChatId) return
    mutation.mutate({ id: subChatId, notes: value })
  }, [subChatId, mutation])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setLocalValue(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => save(value), 1000)
  }, [save])

  const handleBlur = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    save(localValue)
  }, [save, localValue])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (!subChatId) return null

  return (
    <div className="px-2 pb-2">
      <textarea
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Add notes..."
        className="w-full min-h-[60px] max-h-[200px] resize-y bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none border-none p-0 leading-relaxed"
        rows={3}
      />
    </div>
  )
})
