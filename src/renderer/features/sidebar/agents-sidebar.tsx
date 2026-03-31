"use client"

import React from "react"
import { useState, useRef, useMemo, useEffect, useCallback, memo, forwardRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "motion/react"
import { Button as ButtonCustom } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { useSetAtom, useAtom, useAtomValue } from "jotai"
import {
  autoAdvanceTargetAtom,
  createTeamDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSidebarOpenAtom,
  agentsHelpPopoverOpenAtom,
  selectedAgentChatIdsAtom,
  isAgentMultiSelectModeAtom,
  toggleAgentChatSelectionAtom,
  selectAllAgentChatsAtom,
  clearAgentChatSelectionAtom,
  selectedAgentChatsCountAtom,
  isDesktopAtom,
  isFullscreenAtom,
  chatSourceModeAtom,
  selectedTeamIdAtom,
  type ChatSourceMode,
  type SettingsTab,
  showWorkspaceIconAtom,
  betaKanbanEnabledAtom,
  betaAutomationsEnabledAtom,
} from "../../lib/atoms"
import {
  useRemoteChats,
  useUserTeams,
  usePrefetchRemoteChat,
  useArchiveRemoteChat,
  useArchiveRemoteChatsBatch,
  useRestoreRemoteChat,
  useRenameRemoteChat,
} from "../../lib/hooks/use-remote-chats"
import { usePrefetchLocalChat } from "../../lib/hooks/use-prefetch-local-chat"
import { ArchivePopover } from "../agents/ui/archive-popover"
import { ChevronDown, ChevronRight, MoreHorizontal, Columns3, ArrowUpRight, FolderIcon, Plus } from "lucide-react"
import * as LucideIcons from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { remoteTrpc } from "../../lib/remote-trpc"
// Desktop: archive is handled inline, not via hook
import { OpenLocallyDialog } from "../agents/components/open-locally-dialog"
import { useAutoImport } from "../agents/hooks/use-auto-import"
import { ConfirmArchiveDialog } from "../../components/confirm-archive-dialog"
import { ManageFoldersDialog } from "./manage-folders-dialog"
import { ProjectIcon } from "../../components/ui/project-icon"
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { Kbd } from "../../components/ui/kbd"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "../../components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "../../components/ui/context-menu"
import {
  IconDoubleChevronLeft,
  SettingsIcon,
  PlusIcon,
  PublisherStudioIcon,
  SearchIcon,
  GitHubLogo,
  LoadingDot,
  ArchiveIcon,
  TrashIcon,
  QuestionCircleIcon,
  QuestionIcon,
  TicketIcon,
  CloudIcon,
} from "../../components/ui/icons"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import {
  selectedAgentChatIdAtom,
  selectedChatIsRemoteAtom,
  previousAgentChatIdAtom,
  selectedDraftIdAtom,
  showNewChatFormAtom,
  loadingSubChatsAtom,
  agentsUnseenChangesAtom,
  archivePopoverOpenAtom,
  agentsDebugModeAtom,
  selectedProjectAtom,
  justCreatedIdsAtom,
  undoStackAtom,
  pendingUserQuestionsAtom,
  desktopViewAtom,
  type UndoItem,
} from "../agents/atoms"
import { useAgentSubChatStore, OPEN_SUB_CHATS_CHANGE_EVENT } from "../agents/stores/sub-chat-store"
import { getWindowId } from "../../contexts/WindowContext"
import { AgentsHelpPopover } from "../agents/components/agents-help-popover"
import { getShortcutKey, isDesktopApp } from "../../lib/utils/platform"
import { useResolvedHotkeyDisplay, useResolvedHotkeyDisplayWithAlt } from "../../lib/hotkeys"
import { pluralize } from "../agents/utils/pluralize"
import { useNewChatDrafts, deleteNewChatDraft, type NewChatDraft } from "../agents/lib/drafts"
import {
  TrafficLights,
} from "../agents/components/traffic-light-spacer"
import { useHotkeys } from "react-hotkeys-hook"
import { Checkbox } from "../../components/ui/checkbox"
import { useHaptic } from "./hooks/use-haptic"
import { TypewriterText } from "../../components/ui/typewriter-text"
import { exportChat, copyChat, type ExportFormat } from "../agents/lib/export-chat"
import { DESKTOP_LOCAL_ONLY } from "../../../shared/local-mode"

// Feedback URL: uses env variable for hosted version, falls back to public Discord for open source
const FEEDBACK_URL =
  import.meta.env.VITE_FEEDBACK_URL || "https://discord.gg/8ektTZGnj4"

/** Resolve a Lucide icon name (kebab-case) to its React component */
function getFolderIcon(iconName: string): React.ComponentType<{ className?: string; style?: React.CSSProperties }> {
  // Convert kebab-case to PascalCase for Lucide import lookup
  const pascalName = iconName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")
  const Icon = (LucideIcons as Record<string, unknown>)[pascalName]
  if (Icon && (typeof Icon === "function" || typeof Icon === "object")) return Icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  return FolderIcon
}

// Folder context to avoid threading folders through every prop layer
type FolderData = { id: string; name: string; icon: string; color: string; system: boolean }
type FolderContextType = {
  folders: FolderData[]
  onMoveToFolder: (chatId: string, folderId: string) => void
  onBulkMoveToFolder: (folderId: string) => void
}
const FolderContext = React.createContext<FolderContextType>({
  folders: [],
  onMoveToFolder: () => {},
  onBulkMoveToFolder: () => {},
})

// "Move to folder" submenu for single chat context menu
const MoveToFolderMenu = memo(function MoveToFolderMenu({ chatId }: { chatId: string }) {
  const { folders, onMoveToFolder } = React.useContext(FolderContext)
  if (folders.length === 0) return null
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Move to folder</ContextMenuSubTrigger>
      <ContextMenuSubContent sideOffset={6} alignOffset={-4}>
        {folders.map((f) => {
          const Icon = getFolderIcon(f.icon)
          return (
            <ContextMenuItem key={f.id} onClick={() => onMoveToFolder(chatId, f.id)}>
              <Icon className="h-3.5 w-3.5 mr-2 flex-shrink-0" style={{ color: f.color }} />
              {f.name}
            </ContextMenuItem>
          )
        })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
})

// "Move to folder" submenu for bulk context menu
const BulkMoveToFolderMenu = memo(function BulkMoveToFolderMenu({ count }: { count: number }) {
  const { folders, onBulkMoveToFolder } = React.useContext(FolderContext)
  if (folders.length === 0) return null
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Move {count} to folder</ContextMenuSubTrigger>
      <ContextMenuSubContent sideOffset={6} alignOffset={-4}>
        {folders.map((f) => {
          const Icon = getFolderIcon(f.icon)
          return (
            <ContextMenuItem key={f.id} onClick={() => onBulkMoveToFolder(f.id)}>
              <Icon className="h-3.5 w-3.5 mr-2 flex-shrink-0" style={{ color: f.color }} />
              {f.name}
            </ContextMenuItem>
          )
        })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
})

// GitHub avatar with loading placeholder
const GitHubAvatar = React.memo(function GitHubAvatar({
  gitOwner,
  className = "h-4 w-4",
}: {
  gitOwner: string
  className?: string
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => setIsLoaded(true), [])
  const handleError = useCallback(() => setHasError(true), [])

  if (hasError) {
    return <GitHubLogo className={cn(className, "text-muted-foreground flex-shrink-0")} />
  }

  return (
    <div className={cn(className, "relative flex-shrink-0")}>
      {/* Placeholder background while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 rounded-sm bg-muted" />
      )}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn(className, "rounded-sm flex-shrink-0", isLoaded ? 'opacity-100' : 'opacity-0')}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
})

// Component to render chat icon with loading status
const ChatIcon = React.memo(function ChatIcon({
  isSelected,
  isLoading,
  hasUnseenChanges = false,
  hasPendingPlan = false,
  hasPendingQuestion = false,
  isMultiSelectMode = false,
  isChecked = false,
  onCheckboxClick,
  gitOwner,
  gitProvider,
  projectIconPath,
  projectUpdatedAt,
  projectId,
  showIcon = true,
}: {
  isSelected: boolean
  isLoading: boolean
  hasUnseenChanges?: boolean
  hasPendingPlan?: boolean
  hasPendingQuestion?: boolean
  isMultiSelectMode?: boolean
  isChecked?: boolean
  onCheckboxClick?: (e: React.MouseEvent) => void
  gitOwner?: string | null
  gitProvider?: string | null
  projectIconPath?: string | null
  projectUpdatedAt?: string | Date | null
  projectId?: string
  showIcon?: boolean
}) {
  const hasStatus = hasPendingQuestion || isLoading || hasUnseenChanges || hasPendingPlan

  if (!showIcon && !isMultiSelectMode) return null

  return (
    <div className="relative flex-shrink-0 w-4 h-4">
      {/* Checkbox for multi-select */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 ease-out",
          isMultiSelectMode ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
        )}
        onClick={onCheckboxClick}
      >
        <Checkbox checked={isChecked} className="cursor-pointer h-4 w-4" tabIndex={isMultiSelectMode ? 0 : -1} />
      </div>
      {/* Status indicator only - no project icon */}
      {!isMultiSelectMode && hasStatus && (
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {hasPendingQuestion ? (
              <motion.div key="question" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                <QuestionIcon className="w-4 h-4 text-blue-500" />
              </motion.div>
            ) : isLoading ? (
              <motion.div key="loading" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                <LoadingDot isLoading={true} className="w-3.5 h-3.5 text-muted-foreground" />
              </motion.div>
            ) : hasPendingPlan ? (
              <motion.div key="plan" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}
                className="w-2 h-2 rounded-full bg-amber-500" />
            ) : (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
})

// Memoized Draft Item component to prevent re-renders on hover
const DraftItem = React.memo(function DraftItem({
  draftId,
  draftText,
  draftUpdatedAt,
  projectGitOwner,
  projectGitProvider,
  projectGitRepo,
  projectName,
  isSelected,
  isMultiSelectMode,
  isMobileFullscreen,
  showIcon,
  onSelect,
  onDelete,
  formatTime,
}: {
  draftId: string
  draftText: string
  draftUpdatedAt: number
  projectGitOwner: string | null | undefined
  projectGitProvider: string | null | undefined
  projectGitRepo: string | null | undefined
  projectName: string | null | undefined
  isSelected: boolean
  isMultiSelectMode: boolean
  isMobileFullscreen: boolean
  showIcon: boolean
  onSelect: (draftId: string) => void
  onDelete: (draftId: string) => void
  formatTime: (dateStr: string) => string
}) {
  return (
    <div
      onClick={() => onSelect(draftId)}
      className={cn(
        "w-full text-left py-1.5 cursor-pointer group relative",
        "transition-colors duration-75",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isMultiSelectMode ? "px-3" : "pl-2 pr-2",
        !isMultiSelectMode && "rounded-md",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        {showIcon && (
          <div className="pt-0.5">
            <div className="relative flex-shrink-0 w-4 h-4">
              {projectGitOwner && projectGitProvider === "github" ? (
                <GitHubAvatar gitOwner={projectGitOwner} />
              ) : (
                <GitHubLogo className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="truncate block text-sm leading-tight flex-1">
              {draftText.slice(0, 50)}
              {draftText.length > 50 ? "..." : ""}
            </span>
            {/* Delete button - shown on hover */}
            {!isMultiSelectMode && !isMobileFullscreen && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(draftId)
                }}
                tabIndex={-1}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                aria-label="Delete draft"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground/60 truncate">
              <span className="text-blue-500">Draft</span>
              {projectGitRepo
                ? ` • ${projectGitRepo}`
                : projectName
                  ? ` • ${projectName}`
                  : ""}
            </span>
            <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
              {formatTime(new Date(draftUpdatedAt).toISOString())}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})

// Memoized Agent Chat Item component to prevent re-renders on hover
const AgentChatItem = React.memo(function AgentChatItem({
  chatId,
  chatName,
  chatBranch,
  chatUpdatedAt,
  chatProjectId,
  globalIndex,
  isSelected,
  isLoading,
  hasUnseenChanges,
  hasPendingPlan,
  hasPendingQuestion,
  isMultiSelectMode,
  isChecked,
  isFocused,
  isMobileFullscreen,
  isDesktop,
  isPinned,
  displayText,
  gitOwner,
  gitProvider,
  projectIconPath,
  projectUpdatedAt,
  stats,
  selectedChatIdsSize,
  canShowPinOption,
  areAllSelectedPinned,
  filteredChatsLength,
  isLastInFilteredChats,
  isRemote,
  showIcon,
  onChatClick,
  onCheckboxClick,
  onMouseEnter,
  onMouseLeave,
  onArchive,
  onTogglePin,
  onRenameClick,
  onSaveRename,
  isEditing,
  onEditingChange,
  onCopyBranch,
  onDelete,
  onOpenLocally,
  onBulkPin,
  onBulkUnpin,
  onBulkArchive,
  archivePending,
  archiveBatchPending,
  nameRefCallback,
  formatTime,
  isJustCreated,
}: {
  chatId: string
  chatName: string | null
  chatBranch: string | null
  chatUpdatedAt: Date | null
  chatProjectId: string
  globalIndex: number
  isSelected: boolean
  isLoading: boolean
  hasUnseenChanges: boolean
  hasPendingPlan: boolean
  hasPendingQuestion: boolean
  isMultiSelectMode: boolean
  isChecked: boolean
  isFocused: boolean
  isMobileFullscreen: boolean
  isDesktop: boolean
  isPinned: boolean
  displayText: string
  gitOwner: string | null | undefined
  gitProvider: string | null | undefined
  projectIconPath: string | null | undefined
  projectUpdatedAt: string | Date | null | undefined
  stats: { fileCount: number; additions: number; deletions: number } | undefined
  selectedChatIdsSize: number
  canShowPinOption: boolean
  areAllSelectedPinned: boolean
  filteredChatsLength: number
  isLastInFilteredChats: boolean
  isRemote: boolean
  showIcon: boolean
  onChatClick: (chatId: string, e?: React.MouseEvent, globalIndex?: number) => void
  onCheckboxClick: (e: React.MouseEvent, chatId: string) => void
  onMouseEnter: (chatId: string, chatName: string | null, element: HTMLElement, globalIndex: number) => void
  onMouseLeave: () => void
  onArchive: (chatId: string) => void
  onTogglePin: (chatId: string) => void
  onRenameClick: (chat: { id: string; name: string | null; isRemote?: boolean }) => void
  onSaveRename: (chatId: string, newName: string, isRemote?: boolean) => void
  isEditing: boolean
  onEditingChange: (chatId: string | null) => void
  onCopyBranch: (branch: string) => void
  onDelete: (chatId: string) => void
  onOpenLocally: (chatId: string) => void
  onBulkPin: () => void
  onBulkUnpin: () => void
  onBulkArchive: () => void
  archivePending: boolean
  archiveBatchPending: boolean
  nameRefCallback: (chatId: string, el: HTMLSpanElement | null) => void
  formatTime: (dateStr: string) => string
  isJustCreated: boolean
}) {
  // Resolved hotkey for context menu
  const archiveWorkspaceHotkey = useResolvedHotkeyDisplay("archive-workspace")



  // Inline rename state
  const [editValue, setEditValue] = useState(chatName || "")
  const renameInputRef = useRef<HTMLInputElement>(null)
  const editStartTimeRef = useRef(0)

  const handleRenameSave = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== (chatName || "")) {
      onSaveRename(chatId, trimmed, isRemote)
    }
    onEditingChange(null)
  }, [editValue, chatId, chatName, isRemote, onSaveRename, onEditingChange])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation() // prevent parent from intercepting space/enter
    if (e.key === "Enter") { e.preventDefault(); handleRenameSave() }
    else if (e.key === "Escape") { e.preventDefault(); setEditValue(chatName || ""); onEditingChange(null) }
  }, [handleRenameSave, chatName, onEditingChange])

  const handleRenameBlur = useCallback(() => {
    if (Date.now() - editStartTimeRef.current < 200) {
      requestAnimationFrame(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() })
      return
    }
    handleRenameSave()
  }, [handleRenameSave])

  useEffect(() => {
    if (isEditing && renameInputRef.current) {
      editStartTimeRef.current = Date.now()
      setEditValue(chatName || "")
      requestAnimationFrame(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() })
    }
  }, [isEditing, chatName])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-chat-item
          data-chat-index={globalIndex}
          onClick={(e) => {
            if (isMobileFullscreen && !isDesktop) return
            onChatClick(chatId, e, globalIndex)
          }}
          onTouchEnd={(e) => {
            if (isMobileFullscreen && !isDesktop) {
              e.preventDefault()
              onChatClick(chatId, undefined, globalIndex)
            }
          }}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onChatClick(chatId, undefined, globalIndex)
            }
          }}
          onMouseEnter={(e) => {
            onMouseEnter(chatId, chatName, e.currentTarget, globalIndex)
          }}
          onMouseLeave={onMouseLeave}
          className={cn(
            "w-full text-left py-1.5 cursor-pointer group relative",
            "transition-colors duration-75",
            "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            // In multi-select: px-3 compensates for removed container px-2, keeping text aligned
            isMultiSelectMode ? "px-3" : "pl-2 pr-2",
            !isMultiSelectMode && "rounded-md",
            isSelected
              ? "bg-foreground/5 text-foreground"
              : isFocused
                ? "bg-foreground/5 text-foreground"
                : // On mobile, no hover effect to prevent double-tap issue
                  isMobileFullscreen
                  ? "text-muted-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            isChecked &&
              (isMobileFullscreen
                ? "bg-primary/10"
                : "bg-primary/10 hover:bg-primary/15"),
          )}
        >
          <div className="flex items-start gap-2.5">
            {/* Icon container - only render if showIcon or in multi-select mode */}
            {(showIcon || isMultiSelectMode) && (
              <div className="pt-0.5">
                <ChatIcon
                  isSelected={isSelected}
                  isLoading={isLoading}
                  hasUnseenChanges={hasUnseenChanges}
                  hasPendingPlan={hasPendingPlan}
                  hasPendingQuestion={hasPendingQuestion}
                  isMultiSelectMode={isMultiSelectMode}
                  isChecked={isChecked}
                  onCheckboxClick={(e) => onCheckboxClick(e, chatId)}
                  gitOwner={gitOwner}
                  gitProvider={gitProvider}
                  projectIconPath={projectIconPath}
                  projectUpdatedAt={projectUpdatedAt}
                  projectId={chatProjectId}
                  showIcon={showIcon}
                />
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={handleRenameBlur}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate block text-sm leading-tight flex-1 bg-transparent outline-none border-none min-w-0"
                  />
                ) : (
                  <span
                    ref={(el) => nameRefCallback(chatId, el)}
                    className="truncate block text-sm leading-tight flex-1"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      onEditingChange(chatId)
                    }}
                  >
                    <TypewriterText
                      text={chatName || ""}
                      placeholder="New workspace"
                      id={chatId}
                      isJustCreated={isJustCreated}
                      showPlaceholder={true}
                    />
                  </span>
                )}
                {/* Archive button or inline loader/status when icon is hidden */}
                {!isMultiSelectMode && !isMobileFullscreen && (
                  <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center relative">
                    {/* Inline loader/status when icon is hidden - always visible, hides on hover */}
                    {!showIcon && (hasPendingQuestion || isLoading || hasUnseenChanges || hasPendingPlan) && (
                      <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
                        <AnimatePresence mode="wait">
                          {hasPendingQuestion ? (
                            <motion.div
                              key="question"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                            >
                              <QuestionIcon className="w-3.5 h-3.5 text-blue-500" />
                            </motion.div>
                          ) : isLoading ? (
                            <motion.div
                              key="loading"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                            >
                              <LoadingDot isLoading={true} className="w-3.5 h-3.5 text-muted-foreground" />
                            </motion.div>
                          ) : hasPendingPlan ? (
                            <motion.div
                              key="plan"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                              className="w-2 h-2 rounded-full bg-amber-500"
                            />
                          ) : (
                            <motion.div
                              key="done"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                            >
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    {/* Archive button - appears on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onArchive(chatId)
                      }}
                      tabIndex={-1}
                      className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                      aria-label="Archive workspace"
                    >
                      <ArchiveIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 min-w-0">
                {/* Cloud icon for remote chats */}
                {isRemote && (
                  <CloudIcon className="h-2.5 w-2.5 flex-shrink-0" />
                )}
                <span className="truncate flex-1 min-w-0">{displayText}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {stats && (stats.additions > 0 || stats.deletions > 0) && (
                    <>
                      <span className="text-green-600/40 dark:text-green-500/30">
                        +{stats.additions}
                      </span>
                      <span className="text-red-600/40 dark:text-red-500/30">
                        -{stats.deletions}
                      </span>
                    </>
                  )}
                  <span>
                    {formatTime(
                      chatUpdatedAt?.toISOString() ?? new Date().toISOString(),
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Multi-select context menu */}
        {isMultiSelectMode && isChecked ? (
          <>
            <BulkMoveToFolderMenu count={selectedChatIdsSize} />
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onBulkArchive} disabled={archiveBatchPending}>
              {archiveBatchPending
                ? "Archiving..."
                : `Archive ${selectedChatIdsSize} ${pluralize(selectedChatIdsSize, "workspace")}`}
            </ContextMenuItem>
          </>
        ) : (
          <>
            {isRemote && (
              <>
                <ContextMenuItem onClick={() => onOpenLocally(chatId)}>
                  Fork Locally
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <MoveToFolderMenu chatId={chatId} />
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onEditingChange(chatId)}>
              Rename workspace
            </ContextMenuItem>
            {chatBranch && (
              <ContextMenuItem onClick={() => onCopyBranch(chatBranch)}>
                Copy branch name
              </ContextMenuItem>
            )}
            <ContextMenuSub>
              <ContextMenuSubTrigger>Export workspace</ContextMenuSubTrigger>
              <ContextMenuSubContent sideOffset={6} alignOffset={-4}>
                <ContextMenuItem onClick={() => exportChat({ chatId: isRemote ? chatId.replace(/^remote_/, '') : chatId, format: "markdown", isRemote })}>
                  Download as Markdown
                </ContextMenuItem>
                <ContextMenuItem onClick={() => exportChat({ chatId: isRemote ? chatId.replace(/^remote_/, '') : chatId, format: "json", isRemote })}>
                  Download as JSON
                </ContextMenuItem>
                <ContextMenuItem onClick={() => exportChat({ chatId: isRemote ? chatId.replace(/^remote_/, '') : chatId, format: "text", isRemote })}>
                  Download as Text
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => copyChat({ chatId: isRemote ? chatId.replace(/^remote_/, '') : chatId, format: "markdown", isRemote })}>
                  Copy as Markdown
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyChat({ chatId: isRemote ? chatId.replace(/^remote_/, '') : chatId, format: "json", isRemote })}>
                  Copy as JSON
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyChat({ chatId: isRemote ? chatId.replace(/^remote_/, '') : chatId, format: "text", isRemote })}>
                  Copy as Text
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            {isDesktop && (
              <ContextMenuItem onClick={async () => {
                const result = await window.desktopApi?.newWindow({ chatId })
                if (result?.blocked) {
                  toast.info("This workspace is already open in another window", {
                    description: "Switching to the existing window.",
                    duration: 3000,
                  })
                }
              }}>
                Open in new window
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onArchive(chatId)} className="justify-between">
              Archive workspace
              {archiveWorkspaceHotkey && <Kbd>{archiveWorkspaceHotkey}</Kbd>}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onDelete(chatId)}
              className="text-destructive focus:text-destructive"
            >
              Delete workspace
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

// Custom comparator for ChatListSection to handle Set/Map props correctly
// Sets and Maps from Jotai atoms are stable by reference when unchanged,
// but we add explicit size checks for extra safety
function chatListSectionPropsAreEqual(
  prevProps: ChatListSectionProps,
  nextProps: ChatListSectionProps
): boolean {
  // Quick checks for primitive props that change often
  if (prevProps.selectedChatId !== nextProps.selectedChatId) return false
  if (prevProps.selectedChatIsRemote !== nextProps.selectedChatIsRemote) return false
  if (prevProps.focusedChatIndex !== nextProps.focusedChatIndex) return false
  if (prevProps.isMultiSelectMode !== nextProps.isMultiSelectMode) return false
  if (prevProps.canShowPinOption !== nextProps.canShowPinOption) return false
  if (prevProps.areAllSelectedPinned !== nextProps.areAllSelectedPinned) return false
  if (prevProps.archivePending !== nextProps.archivePending) return false
  if (prevProps.archiveBatchPending !== nextProps.archiveBatchPending) return false
  if (prevProps.editingChatId !== nextProps.editingChatId) return false
  if (prevProps.title !== nextProps.title) return false
  if (prevProps.isMobileFullscreen !== nextProps.isMobileFullscreen) return false
  if (prevProps.isDesktop !== nextProps.isDesktop) return false
  if (prevProps.showIcon !== nextProps.showIcon) return false

  // Check arrays by reference (they're stable from useMemo in parent)
  if (prevProps.chats !== nextProps.chats) return false
  if (prevProps.filteredChats !== nextProps.filteredChats) return false

  // Check Sets by reference - Jotai atoms return same reference if unchanged
  if (prevProps.loadingChatIds !== nextProps.loadingChatIds) return false
  if (prevProps.unseenChanges !== nextProps.unseenChanges) return false
  if (prevProps.workspacePendingPlans !== nextProps.workspacePendingPlans) return false
  if (prevProps.workspacePendingQuestions !== nextProps.workspacePendingQuestions) return false
  if (prevProps.selectedChatIds !== nextProps.selectedChatIds) return false
  if (prevProps.pinnedChatIds !== nextProps.pinnedChatIds) return false
  if (prevProps.justCreatedIds !== nextProps.justCreatedIds) return false

  // Check Maps by reference
  if (prevProps.projectsMap !== nextProps.projectsMap) return false
  if (prevProps.workspaceFileStats !== nextProps.workspaceFileStats) return false

  // Callback functions are stable from useCallback in parent
  // No need to compare them - they only change when their deps change

  return true
}

interface ChatListSectionProps {
  title: string
  chats: Array<{
    id: string
    name: string | null
    branch: string | null
    updatedAt: Date | null
    projectId: string | null
    isRemote: boolean
    meta?: { repository?: string; branch?: string | null } | null
    remoteStats?: { fileCount: number; additions: number; deletions: number } | null
  }>
  selectedChatId: string | null
  selectedChatIsRemote: boolean
  focusedChatIndex: number
  loadingChatIds: Set<string>
  unseenChanges: Set<string>
  workspacePendingPlans: Set<string>
  workspacePendingQuestions: Set<string>
  isMultiSelectMode: boolean
  selectedChatIds: Set<string>
  isMobileFullscreen: boolean
  isDesktop: boolean
  pinnedChatIds: Set<string>
  projectsMap: Map<string, { gitOwner?: string | null; gitProvider?: string | null; gitRepo?: string | null; name?: string | null }>
  workspaceFileStats: Map<string, { fileCount: number; additions: number; deletions: number }>
  filteredChats: Array<{ id: string }>
  canShowPinOption: boolean
  areAllSelectedPinned: boolean
  showIcon: boolean
  onChatClick: (chatId: string, e?: React.MouseEvent, globalIndex?: number) => void
  onCheckboxClick: (e: React.MouseEvent, chatId: string) => void
  onMouseEnter: (chatId: string, chatName: string | null, element: HTMLElement, globalIndex: number) => void
  onMouseLeave: () => void
  onArchive: (chatId: string) => void
  onTogglePin: (chatId: string) => void
  onRenameClick: (chat: { id: string; name: string | null; isRemote?: boolean }) => void
  onSaveRename: (chatId: string, newName: string, isRemote?: boolean) => void
  editingChatId: string | null
  onEditingChange: (chatId: string | null) => void
  onCopyBranch: (branch: string) => void
  onDelete: (chatId: string) => void
  onOpenLocally: (chatId: string) => void
  onBulkPin: () => void
  onBulkUnpin: () => void
  onBulkArchive: () => void
  archivePending: boolean
  archiveBatchPending: boolean
  nameRefCallback: (chatId: string, el: HTMLSpanElement | null) => void
  formatTime: (dateStr: string) => string
  justCreatedIds: Set<string>
}

// Memoized Chat List Section component
const ChatListSection = React.memo(function ChatListSection({
  title,
  chats,
  selectedChatId,
  selectedChatIsRemote,
  focusedChatIndex,
  loadingChatIds,
  unseenChanges,
  workspacePendingPlans,
  workspacePendingQuestions,
  isMultiSelectMode,
  selectedChatIds,
  isMobileFullscreen,
  isDesktop,
  pinnedChatIds,
  projectsMap,
  workspaceFileStats,
  filteredChats,
  canShowPinOption,
  areAllSelectedPinned,
  showIcon,
  onChatClick,
  onCheckboxClick,
  onMouseEnter,
  onMouseLeave,
  onArchive,
  onTogglePin,
  onRenameClick,
  onSaveRename,
  editingChatId,
  onEditingChange,
  onCopyBranch,
  onDelete,
  onOpenLocally,
  onBulkPin,
  onBulkUnpin,
  onBulkArchive,
  archivePending,
  archiveBatchPending,
  nameRefCallback,
  formatTime,
  justCreatedIds,
}: ChatListSectionProps) {
  if (chats.length === 0) return null

  // Pre-compute global indices map to avoid O(n²) findIndex in map()
  const globalIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    filteredChats.forEach((c, i) => map.set(c.id, i))
    return map
  }, [filteredChats])

  return (
    <>
      {title && (
        <div
          className={cn(
            "flex items-center h-4 mb-1",
            isMultiSelectMode ? "pl-3" : "pl-2",
          )}
        >
          <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {title}
          </h3>
        </div>
      )}
      <div className="list-none p-0 m-0 mb-1">
        {chats.map((chat) => {
          const isLoading = loadingChatIds.has(chat.id)
          // For remote chats, compare without prefix; for local, compare directly
          // Remote chat IDs in list have "remote_" prefix, but selectedChatId is the original ID
          const chatOriginalId = chat.isRemote ? chat.id.replace(/^remote_/, '') : chat.id
          const isSelected = selectedChatId === chatOriginalId && selectedChatIsRemote === chat.isRemote
          const isPinned = pinnedChatIds.has(chat.id)
          const globalIndex = globalIndexMap.get(chat.id) ?? -1
          const isFocused = focusedChatIndex === globalIndex && focusedChatIndex >= 0

          // For remote chats, get repo info from meta; for local, from projectsMap
          const project = chat.projectId ? projectsMap.get(chat.projectId) : null
          const repoName = chat.isRemote
            ? chat.meta?.repository
            : (project?.gitRepo || project?.name)
          const displayText = chat.branch
            ? repoName
              ? `${repoName} • ${chat.branch}`
              : chat.branch
            : repoName || (chat.isRemote ? "Remote project" : "Local project")

          const isChecked = selectedChatIds.has(chat.id)
          // TODO: remote stats disabled — backend no longer computes them (was causing 50s+ loads)
          // Will re-enable once stats are precomputed at write time
          const stats = chat.isRemote ? null : workspaceFileStats.get(chat.id)
          const hasPendingPlan = workspacePendingPlans.has(chat.id)
          const hasPendingQuestion = workspacePendingQuestions.has(chat.id)
          const isLastInFilteredChats = globalIndex === filteredChats.length - 1
          const isJustCreated = justCreatedIds.has(chat.id)

          // For remote chats, extract gitOwner from meta.repository (e.g. "owner/repo" -> "owner")
          const gitOwner = chat.isRemote
            ? chat.meta?.repository?.split('/')[0]
            : project?.gitOwner
          const gitProvider = chat.isRemote ? 'github' : project?.gitProvider

          return (
            <AgentChatItem
              key={chat.id}
              chatId={chat.id}
              chatName={chat.name}
              chatBranch={chat.branch}
              chatUpdatedAt={chat.updatedAt}
              chatProjectId={chat.projectId ?? ""}
              globalIndex={globalIndex}
              isSelected={isSelected}
              isLoading={isLoading}
              hasUnseenChanges={unseenChanges.has(chat.id)}
              hasPendingPlan={hasPendingPlan}
              hasPendingQuestion={hasPendingQuestion}
              isMultiSelectMode={isMultiSelectMode}
              isChecked={isChecked}
              isFocused={isFocused}
              isMobileFullscreen={isMobileFullscreen}
              isDesktop={isDesktop}
              isPinned={isPinned}
              displayText={displayText}
              gitOwner={gitOwner}
              gitProvider={gitProvider}
              projectIconPath={project?.iconPath}
              projectUpdatedAt={project?.updatedAt}
              stats={stats ?? undefined}
              selectedChatIdsSize={selectedChatIds.size}
              canShowPinOption={canShowPinOption}
              areAllSelectedPinned={areAllSelectedPinned}
              filteredChatsLength={filteredChats.length}
              isLastInFilteredChats={isLastInFilteredChats}
              showIcon={showIcon}
              onChatClick={onChatClick}
              onCheckboxClick={onCheckboxClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onArchive={onArchive}
              onTogglePin={onTogglePin}
              onRenameClick={onRenameClick}
              onSaveRename={onSaveRename}
              isEditing={editingChatId === chat.id}
              onEditingChange={onEditingChange}
              onCopyBranch={onCopyBranch}
              onDelete={onDelete}
              onOpenLocally={onOpenLocally}
              onBulkPin={onBulkPin}
              onBulkUnpin={onBulkUnpin}
              onBulkArchive={onBulkArchive}
              archivePending={archivePending}
              archiveBatchPending={archiveBatchPending}
              isRemote={chat.isRemote}
              nameRefCallback={nameRefCallback}
              formatTime={formatTime}
              isJustCreated={isJustCreated}
            />
          )
        })}
      </div>
    </>
  )
}, chatListSectionPropsAreEqual)

interface AgentsSidebarProps {
  userId?: string | null | undefined
  clerkUser?: any
  desktopUser?: { id: string; email: string; name?: string | null } | null
  onSignOut?: () => void
  onToggleSidebar?: () => void
  isMobileFullscreen?: boolean
  onChatSelect?: () => void
}

// Memoized Archive Button to prevent re-creation on every sidebar render
const ArchiveButton = memo(forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function ArchiveButton(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        {...props}
      >
        <ArchiveIcon className="h-4 w-4" />
      </button>
    )
  }
))

// Isolated Kanban Button - clears selection to show Kanban view
const KanbanButton = memo(function KanbanButton() {
  const kanbanEnabled = useAtomValue(betaKanbanEnabledAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)

  // Resolved hotkey for tooltip (respects custom bindings)
  const openKanbanHotkey = useResolvedHotkeyDisplay("open-kanban")

  const handleClick = useCallback(() => {
    // Clear selected chat, draft, and new form state to show Kanban view
    setSelectedChatId(null)
    setSelectedDraftId(null)
    setShowNewChatForm(false)
    setDesktopView(null) // Clear automations/inbox view
  }, [setSelectedChatId, setSelectedDraftId, setShowNewChatForm, setDesktopView])

  // Hide button if feature is disabled
  if (!kanbanEnabled) return null

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        >
          <Columns3 className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        Kanban View
        {openKanbanHotkey && <Kbd>{openKanbanHotkey}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
})

// Custom SVG icons matching web's icons.tsx
function SidebarInboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3 12H7.5C8.12951 12 8.72229 12.2964 9.1 12.8L9.4 13.2C9.77771 13.7036 10.3705 14 11 14H13C13.6295 14 14.2223 13.7036 14.6 13.2L14.9 12.8C15.2777 12.2964 15.8705 12 16.5 12H21M21.7365 11.5389L18.5758 6.00772C18.2198 5.38457 17.5571 5 16.8394 5H7.16065C6.44293 5 5.78024 5.38457 5.42416 6.00772L2.26351 11.5389C2.09083 11.841 2 12.1831 2 12.5311V17C2 18.1046 2.89543 19 4 19H20C21.1046 19 22 18.1046 22 17V12.5311C22 12.1831 21.9092 11.841 21.7365 11.5389Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SidebarAutomationsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M9.50006 5.39844C7.09268 6.1897 5.1897 8.09268 4.39844 10.5001M19.8597 14.5001C19.9518 14.0142 20.0001 13.5128 20.0001 13.0001C20.0001 10.9895 19.2584 9.1522 18.0337 7.74679M6.70841 19.0001C8.11868 20.2448 9.97117 21.0001 12.0001 21.0001C12.5127 21.0001 13.0141 20.9518 13.5 20.8597"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="4" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

// Isolated Inbox Button - full-width navigation link matching web layout
const InboxButton = memo(function InboxButton() {
  const automationsEnabled = useAtomValue(betaAutomationsEnabledAtom)
  const inboxEnabled = automationsEnabled && !DESKTOP_LOCAL_ONLY
  const desktopView = useAtomValue(desktopViewAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const teamId = useAtomValue(selectedTeamIdAtom)

  const { data: unreadData } = useQuery({
    queryKey: ["automations", "inboxUnreadCount", teamId],
    queryFn: () => remoteTrpc.automations.getInboxUnreadCount.query({ teamId: teamId! }),
    enabled: !!teamId && inboxEnabled,
    refetchInterval: 30_000,
  })
  const inboxUnreadCount = unreadData?.count ?? 0

  const handleClick = useCallback(() => {
    setSelectedChatId(null)
    setSelectedDraftId(null)
    setShowNewChatForm(false)
    setDesktopView("inbox")
  }, [setSelectedChatId, setSelectedDraftId, setShowNewChatForm, setDesktopView])

  if (!inboxEnabled) return null

  const isActive = desktopView === "inbox"

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2.5 w-full pl-2 pr-2 py-1.5 rounded-md text-sm transition-colors duration-150",
        isActive
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <SidebarInboxIcon className="h-4 w-4" />
      <span className="flex-1 text-left">Inbox</span>
      {inboxUnreadCount > 0 && (
        <span className="bg-muted text-muted-foreground text-xs font-medium px-1.5 py-0.5 rounded-md min-w-[20px] text-center">
          {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
        </span>
      )}
    </button>
  )
})

// Isolated Automations Button - full-width navigation link matching web layout
const AutomationsButton = memo(function AutomationsButton() {
  const automationsEnabled = useAtomValue(betaAutomationsEnabledAtom)

  const handleClick = useCallback(() => {
    window.desktopApi.openExternal("https://21st.dev/agents/app/automations")
  }, [])

  if (!automationsEnabled || DESKTOP_LOCAL_ONLY) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-2.5 w-full pl-2 pr-2 py-1.5 rounded-md text-sm transition-colors duration-150",
        "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <SidebarAutomationsIcon className="h-4 w-4" />
      <span className="flex-1 text-left">Automations</span>
      <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
    </button>
  )
})

// Isolated Archive Section - subscribes to archivePopoverOpenAtom internally
// to prevent sidebar re-renders when popover opens/closes
interface ArchiveSectionProps {
  archivedChatsCount: number
}

const ArchiveSection = memo(function ArchiveSection({ archivedChatsCount }: ArchiveSectionProps) {
  const archivePopoverOpen = useAtomValue(archivePopoverOpenAtom)
  const [blockArchiveTooltip, setBlockArchiveTooltip] = useState(false)
  const prevArchivePopoverOpen = useRef(false)
  const archiveButtonRef = useRef<HTMLButtonElement>(null)

  // Handle tooltip blocking when popover closes
  useEffect(() => {
    if (prevArchivePopoverOpen.current && !archivePopoverOpen) {
      archiveButtonRef.current?.blur()
      setBlockArchiveTooltip(true)
      const timer = setTimeout(() => setBlockArchiveTooltip(false), 300)
      prevArchivePopoverOpen.current = archivePopoverOpen
      return () => clearTimeout(timer)
    }
    prevArchivePopoverOpen.current = archivePopoverOpen
  }, [archivePopoverOpen])

  if (archivedChatsCount === 0) return null

  return (
    <Tooltip
      delayDuration={500}
      open={archivePopoverOpen || blockArchiveTooltip ? false : undefined}
    >
      <TooltipTrigger asChild>
        <div>
          <ArchivePopover
            trigger={<ArchiveButton ref={archiveButtonRef} />}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>Archive</TooltipContent>
    </Tooltip>
  )
})

// Isolated Sidebar Header - contains dropdown, traffic lights, close button
// Subscribes to dropdown state internally to prevent sidebar re-renders
interface SidebarHeaderProps {
  isDesktop: boolean
  isFullscreen: boolean | null
  isMobileFullscreen: boolean
  onToggleSidebar?: () => void
  handleSidebarMouseEnter: () => void
  handleSidebarMouseLeave: (e: React.MouseEvent) => void
  closeButtonRef: React.RefObject<HTMLDivElement | null>
  searchSlot?: React.ReactNode
}

const SidebarHeader = memo(function SidebarHeader({
  isDesktop,
  isFullscreen,
  isMobileFullscreen,
  onToggleSidebar,
  handleSidebarMouseEnter,
  handleSidebarMouseLeave,
  closeButtonRef,
  searchSlot,
}: SidebarHeaderProps) {
  const toggleSidebarHotkey = useResolvedHotkeyDisplay("toggle-sidebar")
  const shouldShowTrafficLights = isDesktop && isFullscreen !== true

  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      {/* Draggable area for window movement - background layer (hidden in fullscreen) */}
      {isDesktop && !isFullscreen && (
        <div
          className="absolute inset-x-0 top-0 h-[40px] z-0"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "drag",
          }}
          data-sidebar-content
        />
      )}

      {/* No-drag zone over native traffic lights */}
      <TrafficLights
        isFullscreen={isFullscreen}
        isDesktop={isDesktop}
        className="absolute left-[15px] top-[12px] z-20"
      />

      {/* Inline header row: [traffic light space] [search] [close button] */}
      <div
        className={cn(
          "relative z-10 flex items-center gap-1 px-2 pt-2 pb-1.5",
          shouldShowTrafficLights ? "pl-[100px]" : "",
        )}
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {searchSlot && <div className="flex-1 min-w-0">{searchSlot}</div>}

        {/* Close button */}
        {!isMobileFullscreen && (
          <div
            ref={closeButtonRef}
            className="transition-opacity duration-150 opacity-0 group-hover/sidebar:opacity-100 flex-shrink-0"
          >
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <ButtonCustom
                  variant="ghost"
                  size="icon"
                  onClick={onToggleSidebar}
                  tabIndex={-1}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                  aria-label="Close sidebar"
                >
                  <IconDoubleChevronLeft className="h-4 w-4" />
                </ButtonCustom>
              </TooltipTrigger>
              <TooltipContent>
                Close sidebar
                {toggleSidebarHotkey && <Kbd>{toggleSidebarHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  )
})

// Isolated Help Section - subscribes to agentsHelpPopoverOpenAtom internally
// to prevent sidebar re-renders when popover opens/closes
interface HelpSectionProps {
  isMobile: boolean
}

const HelpSection = memo(function HelpSection({ isMobile }: HelpSectionProps) {
  const [helpPopoverOpen, setHelpPopoverOpen] = useAtom(agentsHelpPopoverOpenAtom)
  const [blockHelpTooltip, setBlockHelpTooltip] = useState(false)
  const prevHelpPopoverOpen = useRef(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)

  // Handle tooltip blocking when popover closes
  useEffect(() => {
    if (prevHelpPopoverOpen.current && !helpPopoverOpen) {
      helpButtonRef.current?.blur()
      setBlockHelpTooltip(true)
      const timer = setTimeout(() => setBlockHelpTooltip(false), 300)
      prevHelpPopoverOpen.current = helpPopoverOpen
      return () => clearTimeout(timer)
    }
    prevHelpPopoverOpen.current = helpPopoverOpen
  }, [helpPopoverOpen])

  return (
    <Tooltip
      delayDuration={500}
      open={helpPopoverOpen || blockHelpTooltip ? false : undefined}
    >
      <TooltipTrigger asChild>
        <div>
          <AgentsHelpPopover
            open={helpPopoverOpen}
            onOpenChange={setHelpPopoverOpen}
            isMobile={isMobile}
          >
            <button
              ref={helpButtonRef}
              type="button"
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
              suppressHydrationWarning
            >
              <QuestionCircleIcon className="h-4 w-4" />
            </button>
          </AgentsHelpPopover>
        </div>
      </TooltipTrigger>
      <TooltipContent>Help</TooltipContent>
    </Tooltip>
  )
})

export function AgentsSidebar({
  userId = "demo-user-id",
  clerkUser = null,
  desktopUser = {
    id: "demo-user-id",
    email: "demo@example.com",
    name: "Demo User",
  },
  onSignOut = () => {},
  onToggleSidebar,
  isMobileFullscreen = false,
  onChatSelect,
}: AgentsSidebarProps) {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const [selectedChatIsRemote, setSelectedChatIsRemote] = useAtom(selectedChatIsRemoteAtom)
  const previousChatId = useAtomValue(previousAgentChatIdAtom)
  const autoAdvanceTarget = useAtomValue(autoAdvanceTargetAtom)
  const [selectedDraftId, setSelectedDraftId] = useAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const [loadingSubChats] = useAtom(loadingSubChatsAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  // Use ref instead of state to avoid re-renders on hover
  const isSidebarHoveredRef = useRef(false)
  const closeButtonRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [focusedChatIndex, setFocusedChatIndex] = useState<number>(-1) // -1 means no focus
  const hoveredChatIndexRef = useRef<number>(-1) // Track hovered chat for X hotkey - ref to avoid re-renders

  // Global desktop/fullscreen state from atoms (initialized in AgentsLayout)
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)

  // Multi-select state
  const [selectedChatIds, setSelectedChatIds] = useAtom(
    selectedAgentChatIdsAtom,
  )
  const isMultiSelectMode = useAtomValue(isAgentMultiSelectModeAtom)
  const selectedChatsCount = useAtomValue(selectedAgentChatsCountAtom)
  const toggleChatSelection = useSetAtom(toggleAgentChatSelectionAtom)
  const selectAllChats = useSetAtom(selectAllAgentChatsAtom)
  const clearChatSelection = useSetAtom(clearAgentChatSelectionAtom)

  // Scroll gradient refs - use DOM manipulation to avoid re-renders
  const topGradientRef = useRef<HTMLDivElement>(null)
  const bottomGradientRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Multiple drafts state - uses event-based sync instead of polling
  const drafts = useNewChatDrafts()

  // Read unseen changes from global atoms
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const justCreatedIds = useAtomValue(justCreatedIdsAtom)

  // Haptic feedback
  const { trigger: triggerHaptic } = useHaptic()

  // Resolved hotkeys for tooltips
  const { primary: newWorkspaceHotkey, alt: newWorkspaceAltHotkey } = useResolvedHotkeyDisplayWithAlt("new-workspace")
  const settingsHotkey = useResolvedHotkeyDisplay("open-settings")

  // Inline rename state
  const [editingChatId, setEditingChatId] = useState<string | null>(null)

  // Confirm archive dialog state
  const [confirmArchiveDialogOpen, setConfirmArchiveDialogOpen] = useState(false)
  const [archivingChatId, setArchivingChatId] = useState<string | null>(null)
  const [activeProcessCount, setActiveProcessCount] = useState(0)
  const [hasWorktree, setHasWorktree] = useState(false)
  const [uncommittedCount, setUncommittedCount] = useState(0)

  // Import sandbox dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importingChatId, setImportingChatId] = useState<string | null>(null)

  // Manage folders panel state
  const [manageFoldersOpen, setManageFoldersOpen] = useState(false)

  // Track initial mount to skip footer animation on load
  const hasFooterAnimated = useRef(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Agent name tooltip refs (for truncated names) - using DOM manipulation to avoid re-renders
  const agentTooltipRef = useRef<HTMLDivElement>(null)
  const nameRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const agentTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const setDesktopViewForSettings = useSetAtom(desktopViewAtom)
  const setSidebarOpenForSettings = useSetAtom(agentsSidebarOpenAtom)
  // Navigate to settings page instead of opening a dialog
  const setSettingsDialogOpen = useCallback((open: boolean) => {
    if (open) {
      setDesktopViewForSettings("settings")
      setSidebarOpenForSettings(true)
    } else {
      setDesktopViewForSettings(null)
    }
  }, [setDesktopViewForSettings, setSidebarOpenForSettings])
  const setCreateTeamDialogOpen = useSetAtom(createTeamDialogOpenAtom)

  // Debug mode for testing first-time user experience
  const debugMode = useAtomValue(agentsDebugModeAtom)

  // Sidebar appearance settings
  const showWorkspaceIcon = useAtomValue(showWorkspaceIconAtom)

  // Desktop: use selectedProject instead of teams
  const [selectedProject] = useAtom(selectedProjectAtom)

  // Keep chatSourceModeAtom for backwards compatibility (used in other places)
  const [chatSourceMode, setChatSourceMode] = useAtom(chatSourceModeAtom)

  // Sync chatSourceMode with selectedChatIsRemote on startup
  // This fixes the race condition where atoms load independently from localStorage
  const hasRunStartupSync = useRef(false)
  useEffect(() => {
    if (hasRunStartupSync.current) return
    hasRunStartupSync.current = true

    const correctMode = selectedChatIsRemote ? "sandbox" : "local"
    if (chatSourceMode !== correctMode) {
      setChatSourceMode(correctMode)
    }
  }, [])

  // Fetch all local chats (no project filter)
  const { data: localChats } = trpc.chats.list.useQuery({})

  useUserTeams(!DESKTOP_LOCAL_ONLY)

  // Fetch remote sandbox chats (same as web) - requires teamId
  const { data: remoteChats } = useRemoteChats()

  // Prefetch individual chat data on hover
  const prefetchRemoteChat = usePrefetchRemoteChat()
  const prefetchLocalChat = usePrefetchLocalChat()
  const ENABLE_CHAT_HOVER_PREFETCH = false

  // Merge local and remote chats into unified list
  const agentChats = useMemo(() => {
    const unified: Array<{
      id: string
      name: string | null
      createdAt: Date | null
      updatedAt: Date | null
      archivedAt: Date | null
      projectId: string | null
      worktreePath: string | null
      branch: string | null
      baseBranch: string | null
      prUrl: string | null
      prNumber: number | null
      folderId: string | null
      folderPosition: string
      sandboxId?: string | null
      meta?: { repository?: string; branch?: string | null } | null
      isRemote: boolean
      remoteStats?: { fileCount: number; additions: number; deletions: number } | null
    }> = []

    // Add local chats
    if (localChats) {
      for (const chat of localChats) {
        unified.push({
          id: chat.id,
          name: chat.name,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          archivedAt: chat.archivedAt,
          projectId: chat.projectId,
          worktreePath: chat.worktreePath,
          branch: chat.branch,
          baseBranch: chat.baseBranch,
          prUrl: chat.prUrl,
          prNumber: chat.prNumber,
          folderId: chat.folderId ?? null,
          folderPosition: chat.folderPosition ?? "a0",
          isRemote: false,
        })
      }
    }

    // Add remote chats with prefixed IDs to avoid collisions
    if (remoteChats) {
      for (const chat of remoteChats) {
        unified.push({
          id: `remote_${chat.id}`,
          name: chat.name,
          createdAt: new Date(chat.created_at),
          updatedAt: new Date(chat.updated_at),
          archivedAt: null,
          projectId: null,
          worktreePath: null,
          branch: chat.meta?.branch ?? null,
          baseBranch: null,
          prUrl: null,
          prNumber: null,
          sandboxId: chat.sandbox_id,
          meta: chat.meta,
          folderId: null, // Remote chats go to Uncategorized
          folderPosition: "a0",
          isRemote: true,
          remoteStats: chat.stats,
        })
      }
    }

    // Sort by updatedAt descending (most recent first) within each folder
    unified.sort((a, b) => {
      if (a.folderId !== b.folderId) return 0 // grouping happens in render
      const aT = a.updatedAt?.getTime() ?? 0
      const bT = b.updatedAt?.getTime() ?? 0
      return bT - aT
    })

    return unified
  }, [localChats, remoteChats])

  // Track open sub-chat changes for reactivity
  const [openSubChatsVersion, setOpenSubChatsVersion] = useState(0)
  useEffect(() => {
    const handleChange = () => setOpenSubChatsVersion((v) => v + 1)
    window.addEventListener(OPEN_SUB_CHATS_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(OPEN_SUB_CHATS_CHANGE_EVENT, handleChange)
  }, [])

  // Store previous value to avoid unnecessary React Query refetches
  const prevOpenSubChatIdsRef = useRef<string[]>([])

  // Collect all open sub-chat IDs from localStorage for all workspaces
  const allOpenSubChatIds = useMemo(() => {
    // openSubChatsVersion is used to trigger recalculation when sub-chats change
    void openSubChatsVersion
    if (!agentChats) return prevOpenSubChatIdsRef.current

    const windowId = getWindowId()
    const allIds: string[] = []
    for (const chat of agentChats) {
      try {
        // Use window-prefixed key (matches sub-chat-store.ts)
        const stored = localStorage.getItem(`${windowId}:agent-open-sub-chats-${chat.id}`)
        if (stored) {
          const ids = JSON.parse(stored) as string[]
          allIds.push(...ids)
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Compare with previous - if content is same, return old reference
    // This prevents React Query from refetching when array content hasn't changed
    const prev = prevOpenSubChatIdsRef.current
    const sorted = [...allIds].sort()
    const prevSorted = [...prev].sort()
    if (sorted.length === prevSorted.length && sorted.every((id, i) => id === prevSorted[i])) {
      return prev
    }

    prevOpenSubChatIdsRef.current = allIds
    return allIds
  }, [agentChats, openSubChatsVersion])

  // File changes stats from DB - only for open sub-chats
  const { data: fileStatsData } = trpc.chats.getFileStats.useQuery(
    { openSubChatIds: allOpenSubChatIds },
    { refetchInterval: 5000, enabled: allOpenSubChatIds.length > 0, placeholderData: (prev) => prev }
  )

  // Pending plan approvals from DB - only for open sub-chats
  const { data: pendingPlanApprovalsData } = trpc.chats.getPendingPlanApprovals.useQuery(
    { openSubChatIds: allOpenSubChatIds },
    { refetchInterval: 5000, enabled: allOpenSubChatIds.length > 0, placeholderData: (prev) => prev }
  )

  // Fetch all projects for git info
  const { data: projects } = trpc.projects.list.useQuery()

  // Fetch folders for sidebar grouping
  const { data: foldersData } = trpc.folders.list.useQuery()

  // Auto-import hook for "Open Locally" functionality
  const { getMatchingProjects, autoImport, isImporting } = useAutoImport()

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])


  // Get utils outside of callbacks - hooks must be called at top level
  const utils = trpc.useUtils()

  // Folder mutations
  const moveToFolderMutation = trpc.chats.moveToFolder.useMutation({
    onSuccess: () => { utils.chats.list.invalidate() },
  })
  const moveBatchToFolderMutation = trpc.chats.moveBatchToFolder.useMutation({
    onSuccess: () => { utils.chats.list.invalidate() },
  })
  const toggleFolderCollapseMutation = trpc.folders.toggleCollapse.useMutation({
    onSuccess: () => { utils.folders.list.invalidate() },
  })

  // Unified undo stack for workspaces and sub-chats (Jotai atom)
  const [undoStack, setUndoStack] = useAtom(undoStackAtom)

  // Restore chat mutation (for undo)
  const restoreChatMutation = trpc.chats.restore.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
      // Select the restored chat
      setSelectedChatId(variables.id)
    },
  })

  // Remove workspace item from stack by chatId
  const removeWorkspaceFromStack = useCallback((chatId: string) => {
    setUndoStack((prev) => {
      const index = prev.findIndex((item) => item.type === "workspace" && item.chatId === chatId)
      if (index !== -1) {
        clearTimeout(prev[index].timeoutId)
        return [...prev.slice(0, index), ...prev.slice(index + 1)]
      }
      return prev
    })
  }, [setUndoStack])

  // Remote archive mutations (for sandbox mode)
  const archiveRemoteChatMutation = useArchiveRemoteChat()
  const archiveRemoteChatsBatchMutation = useArchiveRemoteChatsBatch()
  const restoreRemoteChatMutation = useRestoreRemoteChat()
  const renameRemoteChatMutation = useRenameRemoteChat()

  // Archive chat mutation
  const archiveChatMutation = trpc.chats.archive.useMutation({
    onSuccess: (_, variables) => {
      // Hide tooltip if visible (element may be removed from DOM before mouseLeave fires)
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
        agentTooltipTimerRef.current = null
      }
      if (agentTooltipRef.current) {
        agentTooltipRef.current.style.display = "none"
      }

      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      // If archiving the currently selected chat, navigate based on auto-advance setting
      if (selectedChatId === variables.id) {
        const currentIndex = agentChats?.findIndex((c) => c.id === variables.id) ?? -1

        if (autoAdvanceTarget === "next") {
          // Find next workspace in list (after current index)
          const nextChat = agentChats?.find((c, i) => i > currentIndex && c.id !== variables.id)
          if (nextChat) {
            setSelectedChatId(nextChat.id)
          } else {
            // No next workspace, go to new workspace view
            setSelectedChatId(null)
          }
        } else if (autoAdvanceTarget === "previous") {
          // Go to previously selected workspace
          const isPreviousAvailable = previousChatId &&
            agentChats?.some((c) => c.id === previousChatId && c.id !== variables.id)
          if (isPreviousAvailable) {
            setSelectedChatId(previousChatId)
          } else {
            setSelectedChatId(null)
          }
        } else {
          // Close: go to new workspace view
          setSelectedChatId(null)
        }
      }

      // Clear after 10 seconds (Cmd+Z window)
      const timeoutId = setTimeout(() => {
        removeWorkspaceFromStack(variables.id)
      }, 10000)

      // Add to unified undo stack for Cmd+Z
      setUndoStack((prev) => [...prev, {
        type: "workspace",
        chatId: variables.id,
        timeoutId,
      }])
    },
  })

  // Cmd+Z to undo archive (supports multiple undos for workspaces AND sub-chats)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && undoStack.length > 0) {
        e.preventDefault()
        // Get the most recent item
        const lastItem = undoStack[undoStack.length - 1]
        if (!lastItem) return

        // Clear timeout and remove from stack
        clearTimeout(lastItem.timeoutId)
        setUndoStack((prev) => prev.slice(0, -1))

        if (lastItem.type === "workspace") {
          // Restore workspace from archive
          if (lastItem.isRemote) {
            // Strip remote_ prefix before calling API (stored with prefix for undo stack identification)
            const originalId = lastItem.chatId.replace(/^remote_/, '')
            restoreRemoteChatMutation.mutate(originalId, {
              onSuccess: () => {
                setSelectedChatId(originalId)
                setSelectedChatIsRemote(true)
                setChatSourceMode("sandbox")
              },
              onError: (error) => {
                console.error('[handleUndo] Failed to restore remote workspace:', error)
                toast.error("Failed to restore workspace")
              },
            })
          } else {
            restoreChatMutation.mutate({ id: lastItem.chatId })
          }
        } else if (lastItem.type === "subchat") {
          // Restore sub-chat tab (re-add to open tabs)
          const store = useAgentSubChatStore.getState()
          store.addToOpenSubChats(lastItem.subChatId)
          store.setActiveSubChat(lastItem.subChatId)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [undoStack, setUndoStack, restoreChatMutation, restoreRemoteChatMutation, setSelectedChatId])

  // Batch archive mutation
  const archiveChatsBatchMutation = trpc.chats.archiveBatch.useMutation({
    onSuccess: (_, variables) => {
      // Hide tooltip if visible (element may be removed from DOM before mouseLeave fires)
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
        agentTooltipTimerRef.current = null
      }
      if (agentTooltipRef.current) {
        agentTooltipRef.current.style.display = "none"
      }

      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      // Add each chat to unified undo stack for Cmd+Z
      const newItems: UndoItem[] = variables.chatIds.map((chatId) => {
        const timeoutId = setTimeout(() => {
          removeWorkspaceFromStack(chatId)
        }, 10000)
        return { type: "workspace" as const, chatId, timeoutId }
      })
      setUndoStack((prev) => [...prev, ...newItems])
    },
  })

  const deleteChatMutation = trpc.chats.delete.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.invalidate()
      if (selectedChatId === variables.id) {
        const currentIndex = agentChats?.findIndex((c) => c.id === variables.id) ?? -1
        const nextChat = agentChats?.find((c, i) => i > currentIndex && c.id !== variables.id)
        setSelectedChatId(nextChat?.id ?? null)
      }
    },
  })

  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)

  const handleDeleteWorkspace = useCallback((chatId: string) => {
    setDeletingChatId(chatId)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!deletingChatId) return
    deleteChatMutation.mutate({ id: deletingChatId })
    setDeletingChatId(null)
  }, [deletingChatId, deleteChatMutation])

  // Reset selected chat when project changes (but not on initial load)
  const prevProjectIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    // Skip on initial mount (prevProjectIdRef is undefined)
    if (prevProjectIdRef.current === undefined) {
      prevProjectIdRef.current = selectedProject?.id ?? null
      return
    }
    // Only reset if project actually changed from a real value (not from null/initial load)
    if (
      prevProjectIdRef.current !== null &&
      prevProjectIdRef.current !== selectedProject?.id &&
      selectedChatId
    ) {
      setSelectedChatId(null)
    }
    prevProjectIdRef.current = selectedProject?.id ?? null
  }, [selectedProject?.id]) // Don't include selectedChatId in deps to avoid loops


  // Rename mutation
  const renameChatMutation = trpc.chats.rename.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
    },
    onError: () => {
      toast.error("Failed to rename agent")
    },
  })

  const handleMoveToFolder = useCallback((chatId: string, folderId: string) => {
    moveToFolderMutation.mutate({ chatId, folderId })
  }, [moveToFolderMutation])

  const handleBulkMoveToFolder = useCallback((folderId: string) => {
    const chatIds = Array.from(selectedChatIds)
    if (chatIds.length === 0) return
    moveBatchToFolderMutation.mutate({ chatIds, folderId })
    clearChatSelection()
  }, [selectedChatIds, moveBatchToFolderMutation, clearChatSelection])

  const handleToggleFolderCollapse = useCallback((folderId: string) => {
    toggleFolderCollapseMutation.mutate({ id: folderId })
  }, [toggleFolderCollapseMutation])

  // Group chats by folder, respecting folder order
  const { chatsByFolder, filteredChats, orderedFolderIds } = useMemo(() => {
    if (!agentChats || !foldersData) return { chatsByFolder: new Map(), filteredChats: [], orderedFolderIds: [] }

    const filtered = searchQuery.trim()
      ? agentChats.filter((chat) => (chat.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()))
      : agentChats

    // Group by folderId
    const byFolder = new Map<string, typeof filtered>()
    for (const chat of filtered) {
      const fid = chat.folderId ?? "system_uncategorized"
      if (!byFolder.has(fid)) byFolder.set(fid, [])
      byFolder.get(fid)!.push(chat)
    }
    // Sort within each folder by updatedAt (most recent first)
    for (const [, chats] of byFolder) {
      chats.sort((a, b) => {
        const aT = a.updatedAt?.getTime() ?? 0
        const bT = b.updatedAt?.getTime() ?? 0
        return bT - aT
      })
    }

    // Build flat list following folder order for keyboard navigation
    const folderIds = foldersData.map((f) => f.id)
    const flat: typeof filtered = []
    for (const fid of folderIds) {
      const folderChats = byFolder.get(fid)
      if (folderChats) flat.push(...folderChats)
    }
    // Include any chats not matched to a known folder
    for (const chat of filtered) {
      if (!flat.includes(chat)) flat.push(chat)
    }

    return { chatsByFolder: byFolder, filteredChats: flat, orderedFolderIds: folderIds }
  }, [searchQuery, agentChats, foldersData])

  const handleRenameClick = useCallback((_chat: { id: string; name: string | null; isRemote?: boolean }) => {
    // kept for interface compat; inline editing is triggered via onEditingChange
  }, [])

  const handleEditingChange = useCallback((chatId: string | null) => {
    setEditingChatId(chatId)
  }, [])

  const handleSaveRename = useCallback(async (chatId: string, newName: string, isRemote?: boolean) => {
    const cachedChats = utils.chats.list.getData({})
    const oldName = cachedChats?.find((c) => c.id === chatId)?.name || ""
    try {
      if (isRemote) {
        await renameRemoteChatMutation.mutateAsync({ chatId, name: newName })
      } else {
        // Optimistic update
        utils.chats.list.setData({}, (old) => {
          if (!old) return old
          return old.map((c) => (c.id === chatId ? { ...c, name: newName } : c))
        })
        try {
          await renameChatMutation.mutateAsync({ id: chatId, name: newName })
        } catch {
          utils.chats.list.setData({}, (old) => {
            if (!old) return old
            return old.map((c) => (c.id === chatId ? { ...c, name: oldName } : c))
          })
          throw new Error("Failed to rename local workspace")
        }
      }
    } catch (error) {
      console.error('[handleSaveRename] Rename failed:', error)
      toast.error(isRemote ? "Failed to rename remote workspace" : "Failed to rename workspace")
    }
  }, [renameRemoteChatMutation, renameChatMutation, utils.chats.list])


  // Get clerk username
  const clerkUsername = clerkUser?.username

  // Handle bulk archive of selected chats
  const handleBulkArchive = useCallback(() => {
    const chatIdsToArchive = Array.from(selectedChatIds)
    if (chatIdsToArchive.length === 0) return

    // Separate remote and local chats
    const remoteIds: string[] = []
    const localIds: string[] = []
    for (const chatId of chatIdsToArchive) {
      const chat = agentChats?.find((c) => c.id === chatId)
      if (chat?.isRemote) {
        // Extract original ID from prefixed remote ID
        remoteIds.push(chatId.replace(/^remote_/, ''))
      } else {
        localIds.push(chatId)
      }
    }

    // If active chat is being archived, navigate to previous or new workspace
    const isArchivingActiveChat =
      selectedChatId && chatIdsToArchive.includes(selectedChatId)

    const onSuccessCallback = () => {
      if (isArchivingActiveChat) {
        // Check if previous chat is available (exists and not being archived)
        const remainingChats = filteredChats.filter(
          (c) => !chatIdsToArchive.includes(c.id)
        )
        const isPreviousAvailable = previousChatId &&
          remainingChats.some((c) => c.id === previousChatId)

        if (isPreviousAvailable) {
          setSelectedChatId(previousChatId)
        } else {
          setSelectedChatId(null)
        }
      }
      clearChatSelection()
    }

    // Track completions for combined callback
    let completedCount = 0
    const expectedCount = (remoteIds.length > 0 ? 1 : 0) + (localIds.length > 0 ? 1 : 0)

    const handlePartialSuccess = (archivedIds: string[], isRemote: boolean) => {
      // Add remote chats to undo stack
      if (isRemote) {
        const newItems: UndoItem[] = archivedIds.map((id) => {
          const timeoutId = setTimeout(() => removeWorkspaceFromStack(`remote_${id}`), 10000)
          return { type: "workspace" as const, chatId: `remote_${id}`, timeoutId, isRemote: true }
        })
        setUndoStack((prev) => [...prev, ...newItems])
      }

      completedCount++
      if (completedCount === expectedCount) {
        onSuccessCallback()
      }
    }

    // Archive remote chats
    if (remoteIds.length > 0) {
      archiveRemoteChatsBatchMutation.mutate(remoteIds, {
        onSuccess: () => handlePartialSuccess(remoteIds, true),
      })
    }

    // Archive local chats
    if (localIds.length > 0) {
      archiveChatsBatchMutation.mutate({ chatIds: localIds }, {
        onSuccess: () => handlePartialSuccess(localIds, false),
      })
    }
  }, [
    selectedChatIds,
    selectedChatId,
    previousChatId,
    filteredChats,
    agentChats,
    archiveChatsBatchMutation,
    archiveRemoteChatsBatchMutation,
    setSelectedChatId,
    clearChatSelection,
    removeWorkspaceFromStack,
    setUndoStack,
  ])

  // Delete a draft from localStorage
  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      deleteNewChatDraft(draftId)
      // If the deleted draft was selected, clear selection
      if (selectedDraftId === draftId) {
        setSelectedDraftId(null)
      }
    },
    [selectedDraftId, setSelectedDraftId],
  )

  // Select a draft for editing
  const handleDraftSelect = useCallback(
    (draftId: string) => {
      // Navigate to NewChatForm with this draft selected
      setSelectedChatId(null)
      setSelectedDraftId(draftId)
      setShowNewChatForm(false) // Clear explicit new chat state when selecting a draft
      if (isMobileFullscreen && onChatSelect) {
        onChatSelect()
      }
    },
    [setSelectedChatId, setSelectedDraftId, setShowNewChatForm, isMobileFullscreen, onChatSelect],
  )

  // Reset focused index when search query changes
  useEffect(() => {
    setFocusedChatIndex(-1)
  }, [searchQuery, filteredChats.length])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedChatIndex >= 0 && filteredChats.length > 0) {
      const focusedElement = scrollContainerRef.current?.querySelector(
        `[data-chat-index="${focusedChatIndex}"]`,
      ) as HTMLElement
      if (focusedElement) {
        focusedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        })
      }
    }
  }, [focusedChatIndex, filteredChats.length])

  // Derive which chats have loading sub-chats
  const loadingChatIds = useMemo(
    () => new Set([...loadingSubChats.values()]),
    [loadingSubChats],
  )

  // Convert file stats to a Map for easy lookup (only for local chats)
  // Remote chat stats are provided directly via chat.remoteStats
  const workspaceFileStats = useMemo(() => {
    const statsMap = new Map<string, { fileCount: number; additions: number; deletions: number }>()

    // For local mode, use stats from DB query
    if (fileStatsData) {
      for (const stat of fileStatsData) {
        statsMap.set(stat.chatId, {
          fileCount: stat.fileCount,
          additions: stat.additions,
          deletions: stat.deletions,
        })
      }
    }

    return statsMap
  }, [fileStatsData])

  // Aggregate pending plan approvals by workspace (chatId) from DB
  const workspacePendingPlans = useMemo(() => {
    const chatIdsWithPendingPlans = new Set<string>()
    if (pendingPlanApprovalsData) {
      for (const { chatId } of pendingPlanApprovalsData) {
        chatIdsWithPendingPlans.add(chatId)
      }
    }
    return chatIdsWithPendingPlans
  }, [pendingPlanApprovalsData])

  // Get workspace IDs that have pending user questions
  const workspacePendingQuestions = useMemo(() => {
    const chatIds = new Set<string>()
    for (const question of pendingQuestions.values()) {
      chatIds.add(question.parentChatId)
    }
    return chatIds
  }, [pendingQuestions])

  const handleNewAgent = () => {
    triggerHaptic("light")
    setSelectedChatId(null)
    setSelectedDraftId(null) // Clear selected draft so form starts empty
    setShowNewChatForm(true) // Explicitly show new chat form
    setDesktopView(null) // Clear automations/inbox view
    // On mobile, switch to chat mode to show NewChatForm
    if (isMobileFullscreen && onChatSelect) {
      onChatSelect()
    }
  }

  const handleChatClick = useCallback(async (
    chatId: string,
    e?: React.MouseEvent,
    globalIndex?: number,
  ) => {
    // Shift+click for range selection (works in both normal and multi-select mode)
    if (e?.shiftKey) {
      e.preventDefault()

      const clickedIndex =
        globalIndex ?? filteredChats.findIndex((c) => c.id === chatId)

      if (clickedIndex === -1) return

      // Find the anchor: use active chat or last selected item
      let anchorIndex = -1

      // First try: use currently active/selected chat as anchor
      if (selectedChatId) {
        anchorIndex = filteredChats.findIndex((c) => c.id === selectedChatId)
      }

      // If no active chat, try to use the last item in selection
      if (anchorIndex === -1 && selectedChatIds.size > 0) {
        // Find the first selected item in the list as anchor
        for (let i = 0; i < filteredChats.length; i++) {
          if (selectedChatIds.has(filteredChats[i]!.id)) {
            anchorIndex = i
            break
          }
        }
      }

      // If still no anchor, just select the clicked item
      if (anchorIndex === -1) {
        if (!selectedChatIds.has(chatId)) {
          toggleChatSelection(chatId)
        }
        return
      }

      // Select range from anchor to clicked item
      const startIndex = Math.min(anchorIndex, clickedIndex)
      const endIndex = Math.max(anchorIndex, clickedIndex)

      // Build new selection set with the range
      const newSelection = new Set(selectedChatIds)
      for (let i = startIndex; i <= endIndex; i++) {
        const chat = filteredChats[i]
        if (chat) {
          newSelection.add(chat.id)
        }
      }
      setSelectedChatIds(newSelection)
      return
    }

    // In multi-select mode, clicking on the item still navigates to the chat
    // Only clicking on the checkbox toggles selection

    // Check if this is a remote chat (has remote_ prefix)
    const isRemote = chatId.startsWith('remote_')
    // Extract original ID for remote chats
    const originalId = isRemote ? chatId.replace(/^remote_/, '') : chatId

    // Prevent opening same chat in multiple windows.
    // Claim new chat BEFORE releasing old one — if claim fails, we keep the current chat.
    if (window.desktopApi?.claimChat) {
      const result = await window.desktopApi.claimChat(originalId)
      if (!result.ok) {
        toast.info("This workspace is already open in another window", {
          description: "Switching to the existing window.",
          duration: 3000,
        })
        await window.desktopApi.focusChatOwner(originalId)
        return
      }
      // Release old chat only after new one is successfully claimed
      if (selectedChatId && selectedChatId !== originalId) {
        await window.desktopApi.releaseChat(selectedChatId)
      }
    }

    setSelectedChatId(originalId)
    setSelectedChatIsRemote(isRemote)
    // Sync chatSourceMode for ChatView to load data from correct source
    setChatSourceMode(isRemote ? "sandbox" : "local")
    setShowNewChatForm(false) // Clear new chat form state when selecting a workspace
    setDesktopView(null) // Clear automations/inbox view when selecting a chat
    // On mobile, notify parent to switch to chat mode
    if (isMobileFullscreen && onChatSelect) {
      onChatSelect()
    }
  }, [filteredChats, selectedChatId, selectedChatIds, toggleChatSelection, setSelectedChatIds, setSelectedChatId, setSelectedChatIsRemote, setChatSourceMode, setShowNewChatForm, setDesktopView, isMobileFullscreen, onChatSelect])

  const handleCheckboxClick = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    toggleChatSelection(chatId)
  }, [toggleChatSelection])

  const formatTime = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60_000)
    const diffHours = Math.floor(diffMs / 3_600_000)
    const diffDays = Math.floor(diffMs / 86_400_000)

    if (diffMins < 1) return "now"
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
    return `${Math.floor(diffDays / 365)}y`
  }, [])

  // Archive single chat - wrapped for memoized component
  // Checks for active terminal processes and worktree, shows confirmation dialog if needed
  const handleArchiveSingle = useCallback(async (chatId: string) => {
    // Check if this specific chat is remote
    const chat = agentChats?.find((c) => c.id === chatId)
    const chatIsRemote = chat?.isRemote ?? false

    // For remote chats, archive directly (no local processes/worktree to check)
    if (chatIsRemote) {
      // Extract original ID from prefixed remote ID (remove "remote_" prefix)
      const originalId = chatId.replace(/^remote_/, '')
      archiveRemoteChatMutation.mutate(originalId, {
        onSuccess: () => {
          // Handle navigation after archive (same logic as local)
          if (selectedChatId === chatId) {
            const currentIndex = agentChats?.findIndex((c) => c.id === chatId) ?? -1

            if (autoAdvanceTarget === "next") {
              const nextChat = agentChats?.find((c, i) => i > currentIndex && c.id !== chatId)
              setSelectedChatId(nextChat?.id ?? null)
            } else if (autoAdvanceTarget === "previous") {
              const isPreviousAvailable = previousChatId &&
                agentChats?.some((c) => c.id === previousChatId && c.id !== chatId)
              setSelectedChatId(isPreviousAvailable ? previousChatId : null)
            } else {
              setSelectedChatId(null)
            }
          }

          // Add to undo stack for Cmd+Z
          const timeoutId = setTimeout(() => {
            removeWorkspaceFromStack(chatId)
          }, 10000)

          setUndoStack((prev) => [...prev, {
            type: "workspace",
            chatId,
            timeoutId,
            isRemote: true,
          }])
        },
        onError: (error) => {
          console.error('[handleArchiveSingle] Failed to archive remote workspace:', error)
          toast.error("Failed to archive workspace")
        },
      })
      return
    }

    // Fetch both session count and worktree status in parallel
    const isLocalMode = !chat?.branch
    const [sessionCount, worktreeStatus] = await Promise.all([
      // Local mode: terminals are shared and won't be killed on archive, so skip count
      isLocalMode
        ? Promise.resolve(0)
        : utils.terminal.getActiveSessionCount.fetch({ workspaceId: chatId }),
      utils.chats.getWorktreeStatus.fetch({ chatId }),
    ])

    const needsConfirmation = sessionCount > 0 || worktreeStatus.hasWorktree

    if (needsConfirmation) {
      // Show confirmation dialog
      setArchivingChatId(chatId)
      setActiveProcessCount(sessionCount)
      setHasWorktree(worktreeStatus.hasWorktree)
      setUncommittedCount(worktreeStatus.uncommittedCount)
      setConfirmArchiveDialogOpen(true)
    } else {
      // No active processes and no worktree, archive directly
      archiveChatMutation.mutate({ id: chatId })
    }
  }, [
    agentChats,
    archiveRemoteChatMutation,
    archiveChatMutation,
    utils.terminal.getActiveSessionCount,
    utils.chats.getWorktreeStatus,
    selectedChatId,
    autoAdvanceTarget,
    previousChatId,
    setSelectedChatId,
    removeWorkspaceFromStack,
    setUndoStack,
  ])

  // Confirm archive after user accepts dialog (optimistic - closes immediately)
  const handleConfirmArchive = useCallback((deleteWorktree: boolean) => {
    if (archivingChatId) {
      archiveChatMutation.mutate({ id: archivingChatId, deleteWorktree })
      setArchivingChatId(null)
    }
  }, [archiveChatMutation, archivingChatId])

  // Close archive confirmation dialog
  const handleCloseArchiveDialog = useCallback(() => {
    setConfirmArchiveDialogOpen(false)
    setArchivingChatId(null)
  }, [])

  // Handle open locally for sandbox chats
  const handleOpenLocally = useCallback(
    (chatId: string) => {
      const remoteChat = remoteChats?.find((c) => c.id === chatId)
      if (!remoteChat) return

      const matchingProjects = getMatchingProjects(projects ?? [], remoteChat)

      if (matchingProjects.length === 1) {
        // Auto-import: single match found
        autoImport(remoteChat, matchingProjects[0]!)
      } else {
        // Show dialog: 0 or 2+ matches
        setImportingChatId(chatId)
        setImportDialogOpen(true)
      }
    },
    [remoteChats, projects, getMatchingProjects, autoImport]
  )

  // Close import sandbox dialog
  const handleCloseImportDialog = useCallback(() => {
    setImportDialogOpen(false)
    setImportingChatId(null)
  }, [])

  // Get the remote chat for import dialog
  const importingRemoteChat = useMemo(() => {
    if (!importingChatId || !remoteChats) return null
    return remoteChats.find((chat) => chat.id === importingChatId) ?? null
  }, [importingChatId, remoteChats])

  // Get matching projects for import dialog (only computed when dialog is open)
  const importMatchingProjects = useMemo(() => {
    if (!importingRemoteChat) return []
    return getMatchingProjects(projects ?? [], importingRemoteChat)
  }, [importingRemoteChat, projects, getMatchingProjects])

  // Create new workspace in a specific folder
  const handleNewChatInFolder = useCallback((folderId: string) => {
    setShowNewChatForm(true)
    setSelectedChatId(null)
    setSelectedDraftId(null)
    // Store target folder for the new chat form to pick up
    newChatFolderIdRef.current = folderId
  }, [setShowNewChatForm, setSelectedChatId, setSelectedDraftId])
  const newChatFolderIdRef = useRef<string | null>(null)

  // Copy branch name to clipboard
  const handleCopyBranch = useCallback((branch: string) => {
    navigator.clipboard.writeText(branch)
    toast.success("Branch name copied", { description: branch })
  }, [])

  // Ref callback for name elements
  const nameRefCallback = useCallback((chatId: string, el: HTMLSpanElement | null) => {
    if (el) {
      nameRefs.current.set(chatId, el)
    }
  }, [])

  // Handle agent card hover for truncated name tooltip (1s delay)
  // Uses DOM manipulation instead of state to avoid re-renders
  const handleAgentMouseEnter = useCallback(
    (chatId: string, name: string | null, cardElement: HTMLElement, globalIndex: number) => {
      // Update hovered index ref
      hoveredChatIndexRef.current = globalIndex

      // Prefetch chat data on hover for instant load on click (currently disabled to reduce memory pressure)
      if (ENABLE_CHAT_HOVER_PREFETCH) {
        const chat = agentChats?.find((c) => c.id === chatId)
        if (chat?.isRemote) {
          const originalId = chatId.replace(/^remote_/, '')
          prefetchRemoteChat(originalId)
        } else {
          prefetchLocalChat(chatId)
        }
      }

      // Clear any existing timer
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
      }

      const nameEl = nameRefs.current.get(chatId)
      if (!nameEl) return

      // Check if name is truncated
      const isTruncated = nameEl.scrollWidth > nameEl.clientWidth
      if (!isTruncated) return

      // Show tooltip after 1 second delay via DOM manipulation (no state update)
      agentTooltipTimerRef.current = setTimeout(() => {
        const tooltip = agentTooltipRef.current
        if (!tooltip) return

        const rect = cardElement.getBoundingClientRect()
        tooltip.style.display = "block"
        tooltip.style.top = `${rect.top + rect.height / 2}px`
        tooltip.style.left = `${rect.right + 8}px`
        tooltip.textContent = name || ""
      }, 1000)
    },
    [agentChats, prefetchRemoteChat, prefetchLocalChat, ENABLE_CHAT_HOVER_PREFETCH],
  )

  const handleAgentMouseLeave = useCallback(() => {
    // Reset hovered index
    hoveredChatIndexRef.current = -1
    // Clear timer if hovering ends before delay
    if (agentTooltipTimerRef.current) {
      clearTimeout(agentTooltipTimerRef.current)
      agentTooltipTimerRef.current = null
    }
    // Hide tooltip via DOM manipulation (no state update)
    const tooltip = agentTooltipRef.current
    if (tooltip) {
      tooltip.style.display = "none"
    }
  }, [])

  // Update sidebar hover UI - DOM manipulation for close button, state for TrafficLights
  // TrafficLights component handles native traffic light visibility via its own effect
  // Update sidebar hover UI via DOM manipulation (no state update to avoid re-renders)
  const updateSidebarHoverUI = useCallback((hovered: boolean) => {
    isSidebarHoveredRef.current = hovered
    // Update close button opacity
    if (closeButtonRef.current) {
      closeButtonRef.current.style.opacity = hovered ? "1" : "0"
    }
  }, [])

  const handleSidebarMouseEnter = useCallback(() => {
    updateSidebarHoverUI(true)
  }, [updateSidebarHoverUI])

  const handleSidebarMouseLeave = useCallback((e: React.MouseEvent) => {
    // Electron's drag region (WebkitAppRegion: "drag") returns a non-HTMLElement
    // object as relatedTarget. We preserve hover state in this case so the
    // traffic lights remain visible when hovering over the drag area.
    const relatedTarget = e.relatedTarget
    if (!relatedTarget || !(relatedTarget instanceof HTMLElement)) return
    const isStillInSidebar = relatedTarget.closest("[data-sidebar-content]")
    if (!isStillInSidebar) {
      updateSidebarHoverUI(false)
    }
  }, [updateSidebarHoverUI])

  // Check if scroll is needed and show/hide gradients via DOM manipulation
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const checkScroll = () => {
      const needsScroll = container.scrollHeight > container.clientHeight
      if (needsScroll) {
        if (bottomGradientRef.current) bottomGradientRef.current.style.opacity = "1"
        if (topGradientRef.current) topGradientRef.current.style.opacity = "0"
      } else {
        if (bottomGradientRef.current) bottomGradientRef.current.style.opacity = "0"
        if (topGradientRef.current) topGradientRef.current.style.opacity = "0"
      }
    }

    checkScroll()
    // Re-check when content might change
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [filteredChats])

  // Direct listener for Cmd+K to focus search input
  useEffect(() => {
    const handleSearchHotkey = (e: KeyboardEvent) => {
      // Check for Cmd+K or Ctrl+K (only for search functionality)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.code === "KeyK" &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()

        // Focus search input
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener("keydown", handleSearchHotkey, true)

    return () => {
      window.removeEventListener("keydown", handleSearchHotkey, true)
    }
  }, [])

  // Multi-select hotkeys
  // X to toggle selection of hovered or focused chat
  useHotkeys(
    "x",
    () => {
      if (!filteredChats || filteredChats.length === 0) return

      // Prefer hovered, then focused - do NOT fallback to 0 (would conflict with sub-chat sidebar)
      const targetIndex =
        hoveredChatIndexRef.current >= 0
          ? hoveredChatIndexRef.current
          : focusedChatIndex >= 0
            ? focusedChatIndex
            : -1

      if (targetIndex >= 0 && targetIndex < filteredChats.length) {
        const chatId = filteredChats[targetIndex]!.id
        // Toggle selection (both select and deselect)
        toggleChatSelection(chatId)
      }
    },
    [filteredChats, focusedChatIndex, toggleChatSelection],
  )

  // Cmd+A / Ctrl+A to select all chats (only when at least one is already selected)
  useHotkeys(
    "mod+a",
    (e) => {
      if (isMultiSelectMode && filteredChats && filteredChats.length > 0) {
        e.preventDefault()
        selectAllChats(filteredChats.map((c) => c.id))
      }
    },
    [filteredChats, selectAllChats, isMultiSelectMode],
  )

  // Escape to clear selection
  useHotkeys(
    "escape",
    () => {
      if (isMultiSelectMode) {
        clearChatSelection()
        setFocusedChatIndex(-1)
      }
    },
    [isMultiSelectMode, clearChatSelection],
  )

  // Cmd+E to archive current workspace (desktop) or Opt+Cmd+E (web)
  useEffect(() => {
    const handleArchiveHotkey = (e: KeyboardEvent) => {
      const isDesktop = isDesktopApp()

      // Desktop: Cmd+E (without Alt)
      const isDesktopShortcut =
        isDesktop &&
        e.metaKey &&
        e.code === "KeyE" &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey
      // Web: Opt+Cmd+E (with Alt)
      const isWebShortcut = e.altKey && e.metaKey && e.code === "KeyE"

      if (isDesktopShortcut || isWebShortcut) {
        e.preventDefault()

        // If multi-select mode, bulk archive selected chats
        if (isMultiSelectMode && selectedChatIds.size > 0) {
          const isPending = archiveRemoteChatsBatchMutation.isPending || archiveChatsBatchMutation.isPending
          if (!isPending) {
            handleBulkArchive()
          }
          return
        }

        // Otherwise archive current chat (with confirmation if has active processes)
        const isPending = archiveRemoteChatMutation.isPending || archiveChatMutation.isPending
        if (selectedChatId && !isPending) {
          handleArchiveSingle(selectedChatId)
        }
      }
    }

    window.addEventListener("keydown", handleArchiveHotkey)
    return () => window.removeEventListener("keydown", handleArchiveHotkey)
  }, [
    selectedChatId,
    archiveChatMutation,
    archiveRemoteChatMutation,
    isMultiSelectMode,
    selectedChatIds,
    archiveChatsBatchMutation,
    archiveRemoteChatsBatchMutation,
    handleBulkArchive,
    handleArchiveSingle,
  ])

  // Clear selection when project changes
  useEffect(() => {
    clearChatSelection()
  }, [selectedProject?.id, clearChatSelection])

  // Handle scroll for gradients - use DOM manipulation to avoid re-renders
  const handleAgentsScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
      const needsScroll = scrollHeight > clientHeight

      if (!needsScroll) {
        if (topGradientRef.current) topGradientRef.current.style.opacity = "0"
        if (bottomGradientRef.current) bottomGradientRef.current.style.opacity = "0"
        return
      }

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5
      const isAtTop = scrollTop <= 5

      // Update gradient visibility via DOM (no setState = no re-render)
      if (topGradientRef.current) {
        topGradientRef.current.style.opacity = isAtTop ? "0" : "1"
      }
      if (bottomGradientRef.current) {
        bottomGradientRef.current.style.opacity = isAtBottom ? "0" : "1"
      }
    },
    [],
  )

  // Folder context value for passing to deeply nested chat items
  const folderContextValue = useMemo<FolderContextType>(() => ({
    folders: (foldersData ?? []).map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color, system: f.system })),
    onMoveToFolder: handleMoveToFolder,
    onBulkMoveToFolder: handleBulkMoveToFolder,
  }), [foldersData, handleMoveToFolder, handleBulkMoveToFolder])

  // Mobile fullscreen mode - render without ResizableSidebar wrapper
  const sidebarContent = (
    <div
      className={cn(
        "group/sidebar flex flex-col gap-0 overflow-hidden select-none",
        isMobileFullscreen
          ? "h-full w-full bg-background"
          : "h-full bg-sidebar",
      )}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
      data-mobile-fullscreen={isMobileFullscreen || undefined}
      data-sidebar-content
    >
      {/* Header with search inline next to traffic lights */}
      <SidebarHeader
        isDesktop={isDesktop}
        isFullscreen={isFullscreen}
        isMobileFullscreen={isMobileFullscreen}
        onToggleSidebar={onToggleSidebar}
        handleSidebarMouseEnter={handleSidebarMouseEnter}
        handleSidebarMouseLeave={handleSidebarMouseLeave}
        closeButtonRef={closeButtonRef}
        searchSlot={
          <Input
            ref={searchInputRef}
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                searchInputRef.current?.blur()
                setFocusedChatIndex(-1)
                return
              }
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setFocusedChatIndex((prev) => prev === -1 ? 0 : prev < filteredChats.length - 1 ? prev + 1 : prev)
                return
              }
              if (e.key === "ArrowUp") {
                e.preventDefault()
                setFocusedChatIndex((prev) => prev === -1 ? filteredChats.length - 1 : prev > 0 ? prev - 1 : prev)
                return
              }
              if (e.key === "Enter") {
                e.preventDefault()
                if (focusedChatIndex >= 0) {
                  const focusedChat = filteredChats[focusedChatIndex]
                  if (focusedChat) {
                    handleChatClick(focusedChat.id)
                    searchInputRef.current?.blur()
                    setFocusedChatIndex(-1)
                  }
                }
                return
              }
            }}
            className={cn(
              "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
              isMobileFullscreen ? "h-10" : "h-7",
            )}
          />
        }
      />

      {/* New Workspace */}
      <div className="px-2 flex-shrink-0">
        <div className="space-y-2">
          {/* New Workspace Button */}
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <ButtonCustom
                onClick={handleNewAgent}
                variant="outline"
                size="sm"
                className={cn(
                  "px-2 w-full hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground rounded-lg gap-1.5",
                  isMobileFullscreen ? "h-10" : "h-7",
                )}
              >
                <span className="text-sm font-medium">New Workspace</span>
              </ButtonCustom>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex flex-col items-start gap-1">
              <span>Start a new workspace</span>
              {newWorkspaceHotkey && (
                <span className="flex items-center gap-1.5">
                  <Kbd>{newWorkspaceHotkey}</Kbd>
                  {newWorkspaceAltHotkey && <><span className="text-[10px] opacity-50">or</span><Kbd>{newWorkspaceAltHotkey}</Kbd></>}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Navigation Links - Inbox & Automations */}
      <div className="px-2 pb-1 flex-shrink-0 space-y-0.5 -mx-1">
        <InboxButton />
        <AutomationsButton />
      </div>

      {/* Scrollable Agents List */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleAgentsScroll}
          className={cn(
            "h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent",
            isMultiSelectMode ? "px-0" : "px-2",
          )}
        >
          {/* Drafts Section - always show regardless of chat source mode */}
          {drafts.length > 0 && !searchQuery && (
            <div className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}>
              <div
                className={cn(
                  "flex items-center h-4 mb-1",
                  isMultiSelectMode ? "pl-3" : "pl-2",
                )}
              >
                <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  Drafts
                </h3>
              </div>
              <div className="list-none p-0 m-0">
                {drafts.map((draft) => (
                  <DraftItem
                    key={draft.id}
                    draftId={draft.id}
                    draftText={draft.text}
                    draftUpdatedAt={draft.updatedAt}
                    projectGitOwner={draft.project?.gitOwner}
                    projectGitProvider={draft.project?.gitProvider}
                    projectGitRepo={draft.project?.gitRepo}
                    projectName={draft.project?.name}
                    isSelected={selectedDraftId === draft.id && !selectedChatId}
                    isMultiSelectMode={isMultiSelectMode}
                    isMobileFullscreen={isMobileFullscreen}
                    showIcon={showWorkspaceIcon}
                    onSelect={handleDraftSelect}
                    onDelete={handleDeleteDraft}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Folder Sections */}
          <FolderContext.Provider value={folderContextValue}>
          {foldersData && foldersData.length > 0 && (
            <div className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}>
              {foldersData.map((folder) => {
                const folderChats = chatsByFolder.get(folder.id) ?? []
                const IconComponent = getFolderIcon(folder.icon)
                return (
                  <div key={folder.id}>
                    {/* Folder Header */}
                    <button
                      type="button"
                      onClick={() => handleToggleFolderCollapse(folder.id)}
                      className={cn(
                        "flex items-center gap-1.5 w-full h-6 mt-1 mb-1 group border-y",
                        isMultiSelectMode ? "pl-3 pr-2" : "pl-2 pr-2",
                      )}
                      style={{
                        backgroundColor: `${folder.color}1a`,
                        borderColor: `${folder.color}30`,
                      }}
                    >
                      <IconComponent className="h-3 w-3 flex-shrink-0" style={{ color: folder.color }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap truncate">
                        {folder.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                        {folderChats.length}
                      </span>
                      {folder.collapsed
                        ? <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />}
                      <div className="flex-1" />
                      {!folder.system || folder.id !== "system_archived" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleNewChatInFolder(folder.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-opacity"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      ) : null}
                    </button>
                    {/* Folder Chats */}
                    {!folder.collapsed && (
                      <ChatListSection
                        title=""
                        chats={folderChats}
                        selectedChatId={selectedChatId}
                        selectedChatIsRemote={selectedChatIsRemote}
                        focusedChatIndex={focusedChatIndex}
                        loadingChatIds={loadingChatIds}
                        unseenChanges={unseenChanges}
                        workspacePendingPlans={workspacePendingPlans}
                        workspacePendingQuestions={workspacePendingQuestions}
                        isMultiSelectMode={isMultiSelectMode}
                        selectedChatIds={selectedChatIds}
                        isMobileFullscreen={isMobileFullscreen}
                        isDesktop={isDesktop}
                        pinnedChatIds={new Set()}
                        projectsMap={projectsMap}
                        workspaceFileStats={workspaceFileStats}
                        filteredChats={filteredChats}
                        canShowPinOption={false}
                        areAllSelectedPinned={false}
                        showIcon={showWorkspaceIcon}
                        onChatClick={handleChatClick}
                        onCheckboxClick={handleCheckboxClick}
                        onMouseEnter={handleAgentMouseEnter}
                        onMouseLeave={handleAgentMouseLeave}
                        onArchive={handleArchiveSingle}
                        onTogglePin={() => {}}
                        onRenameClick={handleRenameClick}
                        onSaveRename={handleSaveRename}
                        editingChatId={editingChatId}
                        onEditingChange={handleEditingChange}
                        onCopyBranch={handleCopyBranch}
                        onDelete={handleDeleteWorkspace}
                        onOpenLocally={handleOpenLocally}
                        onBulkPin={() => {}}
                        onBulkUnpin={() => {}}
                        onBulkArchive={handleBulkArchive}
                        archivePending={archiveChatMutation.isPending || archiveRemoteChatMutation.isPending}
                        archiveBatchPending={archiveChatsBatchMutation.isPending || archiveRemoteChatsBatchMutation.isPending}
                        nameRefCallback={nameRefCallback}
                        formatTime={formatTime}
                        justCreatedIds={justCreatedIds}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </FolderContext.Provider>
        </div>

        {/* Top gradient fade (appears when scrolled down) */}
        <div
          ref={topGradientRef}
          className="absolute top-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-b from-tl-background via-tl-background/50 to-transparent transition-opacity duration-200 opacity-0"
        />

        {/* Bottom gradient fade */}
        <div
          ref={bottomGradientRef}
          className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-tl-background via-tl-background/50 to-transparent transition-opacity duration-200 opacity-0"
        />
      </div>

      {/* Footer - Multi-select toolbar or normal footer */}
      <AnimatePresence mode="wait">
        {isMultiSelectMode ? (
          <motion.div
            key="multi-select-footer"
            initial={hasFooterAnimated.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            onAnimationComplete={() => {
              hasFooterAnimated.current = true
            }}
            className="p-2 flex flex-col gap-2"
          >
            {/* Selection info */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {selectedChatsCount} selected
              </span>
              <button
                onClick={clearChatSelection}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkArchive}
                disabled={archiveChatsBatchMutation.isPending}
                className="flex-1 h-8 gap-1.5 text-xs rounded-lg"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                {archiveChatsBatchMutation.isPending
                  ? "Archiving..."
                  : "Archive"}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="normal-footer"
            initial={hasFooterAnimated.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            onAnimationComplete={() => {
              hasFooterAnimated.current = true
            }}
            className="p-2 pt-2 flex flex-col gap-2"
          >
            <div className="flex items-center">
              <div className="flex items-center gap-1">
                {/* Settings Button */}
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsActiveTab("preferences")
                        setSettingsDialogOpen(true)
                      }}
                      className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                    >
                      <SettingsIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Settings{settingsHotkey && <> <Kbd>{settingsHotkey}</Kbd></>}</TooltipContent>
                </Tooltip>

                {/* Help Button - isolated component to prevent sidebar re-renders */}
                <HelpSection isMobile={isMobileFullscreen} />

                {/* Kanban View Button - isolated component */}
                <KanbanButton />

                {/* Manage Folders Button */}
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setManageFoldersOpen(true)}
                      className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                    >
                      <FolderIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Manage folders</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <>
      {sidebarContent}

      {/* Agent name tooltip portal - always rendered, visibility controlled via ref/DOM */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={agentTooltipRef}
            className="fixed z-[100000] max-w-xs px-2 py-1 text-xs bg-popover border border-border rounded-md shadow-lg dark pointer-events-none text-foreground/90 whitespace-nowrap"
            style={{
              display: "none",
              transform: "translateY(-50%)",
            }}
          />,
          document.body,
        )}
      {/* Confirm Archive Dialog */}
      <ConfirmArchiveDialog
        isOpen={confirmArchiveDialogOpen}
        onClose={handleCloseArchiveDialog}
        onConfirm={handleConfirmArchive}
        activeProcessCount={activeProcessCount}
        hasWorktree={hasWorktree}
        uncommittedCount={uncommittedCount}
      />

      {/* Delete Workspace Confirmation */}
      <AlertDialog open={!!deletingChatId} onOpenChange={(open) => { if (!open) setDeletingChatId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the workspace and all its chats. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Open Locally Dialog */}
      <OpenLocallyDialog
        isOpen={importDialogOpen}
        onClose={handleCloseImportDialog}
        remoteChat={importingRemoteChat}
        matchingProjects={importMatchingProjects}
        allProjects={projects ?? []}
        remoteSubChatId={null}
      />

      {/* Manage Folders Dialog */}
      <ManageFoldersDialog
        open={manageFoldersOpen}
        onOpenChange={setManageFoldersOpen}
      />
    </>
  )
}
