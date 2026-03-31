"use client"

import React, { useState, useCallback, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import { trpc } from "../../lib/trpc"
import { Trash2, ChevronUp, ChevronDown, Plus, Search } from "lucide-react"
import * as LucideIcons from "lucide-react"

// Row 1: Base16 Eighties
// Row 2: Base2Tone warm/cool mixes
const FOLDER_COLORS = [
  // Eighties
  "#f2777a", "#f99157", "#ffcc66", "#99cc99", "#66cccc", "#6699cc", "#cc99cc", "#d27b53",
  // Base2Tone / warmer neutrals
  "#a89984", "#7c6f64", "#b16286", "#d65d0e", "#689d6a", "#458588", "#98971a", "#928374",
]

// Curated icon set by category (shown when no search)
const FOLDER_ICON_SECTIONS: { label: string; icons: string[] }[] = [
  { label: "General", icons: ["folder", "inbox", "archive", "file-text", "clipboard", "layout-grid", "list", "hash"] },
  { label: "Status", icons: ["circle", "check-circle", "clock", "timer", "hourglass", "alert-circle", "pause-circle", "play-circle"] },
  { label: "Priority", icons: ["star", "heart", "flag", "bookmark", "zap", "flame", "target", "trophy"] },
  { label: "Dev", icons: ["code", "terminal", "git-branch", "bug", "package", "layers", "database", "cpu"] },
  { label: "Writing", icons: ["pen", "pen-line", "pen-tool", "pencil", "pencil-line", "pencil-ruler", "notebook-pen", "square-pen"] },
  { label: "Misc", icons: ["rocket", "shield", "lock", "eye", "lightbulb", "compass", "globe", "music"] },
]

// Build full icon list from Lucide exports (computed once, cached)
let _allLucideIcons: string[] | null = null
function getAllLucideIcons(): string[] {
  if (_allLucideIcons) return _allLucideIcons
  _allLucideIcons = Object.keys(LucideIcons).filter((k) => {
    if (k.endsWith("Icon") || k.startsWith("Lucide") || k.startsWith("create")) return false
    if (k === "default" || k === "icons" || k[0] !== k[0]?.toUpperCase()) return false
    const v = (LucideIcons as Record<string, unknown>)[k]
    return typeof v === "object" || typeof v === "function"
  }).map((k) =>
    // PascalCase -> kebab-case
    k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
  ).sort()
  return _allLucideIcons
}

function getFolderIcon(iconName: string): React.ComponentType<{ className?: string; style?: React.CSSProperties }> {
  const pascalName = iconName.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("")
  const Icon = (LucideIcons as Record<string, unknown>)[pascalName]
  // Lucide icons are forwardRef objects (typeof "object"), not plain functions
  if (Icon && (typeof Icon === "function" || typeof Icon === "object")) return Icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  return LucideIcons.Folder
}

interface ManageFoldersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageFoldersDialog({ open, onOpenChange }: ManageFoldersDialogProps) {
  const { data: folders } = trpc.folders.list.useQuery()
  const utils = trpc.useUtils()

  const createMutation = trpc.folders.create.useMutation({ onSuccess: () => utils.folders.list.invalidate() })
  const updateMutation = trpc.folders.update.useMutation({ onSuccess: () => utils.folders.list.invalidate() })
  const deleteMutation = trpc.folders.delete.useMutation({ onSuccess: () => { utils.folders.list.invalidate(); utils.chats.list.invalidate() } })
  const reorderMutation = trpc.folders.reorder.useMutation({ onSuccess: () => utils.folders.list.invalidate() })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [pickerFolderId, setPickerFolderId] = useState<string | null>(null)
  const [pickerType, setPickerType] = useState<"color" | "icon" | null>(null)
  const [iconSearch, setIconSearch] = useState("")

  const userFolders = folders?.filter((f) => !f.system) ?? []
  const systemFolders = folders?.filter((f) => f.system) ?? []

  const handleCreate = useCallback(() => {
    createMutation.mutate({ name: "New folder", icon: "folder", color: "#6699cc" })
  }, [createMutation])

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate({ id })
  }, [deleteMutation])

  const handleStartRename = useCallback((id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
  }, [])

  const handleSaveRename = useCallback((id: string) => {
    if (editingName.trim()) {
      updateMutation.mutate({ id, name: editingName.trim() })
    }
    setEditingId(null)
  }, [editingName, updateMutation])

  const handleColorChange = useCallback((id: string, color: string) => {
    updateMutation.mutate({ id, color })
    setPickerFolderId(null)
    setPickerType(null)
  }, [updateMutation])

  const handleIconChange = useCallback((id: string, icon: string) => {
    updateMutation.mutate({ id, icon })
    setPickerFolderId(null)
    setPickerType(null)
    setIconSearch("")
  }, [updateMutation])

  const handleMoveUp = useCallback((id: string) => {
    const idx = userFolders.findIndex((f) => f.id === id)
    if (idx <= 0) return
    const prev = userFolders[idx - 1]!
    const prevPrev = idx >= 2 ? userFolders[idx - 2]! : null
    // Place before prev: afterId = prevPrev (or uncategorized), beforeId = prev
    reorderMutation.mutate({ id, afterId: prevPrev?.id ?? "system_uncategorized", beforeId: prev.id })
  }, [userFolders, reorderMutation])

  const handleMoveDown = useCallback((id: string) => {
    const idx = userFolders.findIndex((f) => f.id === id)
    if (idx < 0 || idx >= userFolders.length - 1) return
    const next = userFolders[idx + 1]!
    const nextNext = idx < userFolders.length - 2 ? userFolders[idx + 2]! : null
    // Place after next: afterId = next, beforeId = nextNext (or archived)
    reorderMutation.mutate({ id, afterId: next.id, beforeId: nextNext?.id ?? "system_archived" })
  }, [userFolders, reorderMutation])

  const togglePicker = useCallback((id: string, type: "color" | "icon") => {
    if (pickerFolderId === id && pickerType === type) {
      setPickerFolderId(null)
      setPickerType(null)
      setIconSearch("")
    } else {
      setPickerFolderId(id)
      setPickerType(type)
      setIconSearch("")
    }
  }, [pickerFolderId, pickerType])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage folders</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
          {systemFolders.map((folder) => (
            <FolderRow
              key={folder.id} folder={folder}
              isEditing={editingId === folder.id} editingName={editingName}
              showPicker={pickerFolderId === folder.id}
              pickerType={pickerFolderId === folder.id ? pickerType : null}
              iconSearch={pickerFolderId === folder.id ? iconSearch : ""}
              onEditingNameChange={setEditingName} onStartRename={handleStartRename} onSaveRename={handleSaveRename}
              onDelete={null} onColorChange={null} onIconChange={null}
              onTogglePicker={() => {}} onIconSearchChange={() => {}}
              onMoveUp={null} onMoveDown={null}
            />
          ))}

          {userFolders.length > 0 && systemFolders.length > 0 && (
            <div className="h-px bg-border my-1" />
          )}

          {userFolders.map((folder, idx) => (
            <FolderRow
              key={folder.id} folder={folder}
              isEditing={editingId === folder.id} editingName={editingName}
              showPicker={pickerFolderId === folder.id}
              pickerType={pickerFolderId === folder.id ? pickerType : null}
              iconSearch={pickerFolderId === folder.id ? iconSearch : ""}
              onEditingNameChange={setEditingName} onStartRename={handleStartRename} onSaveRename={handleSaveRename}
              onDelete={handleDelete} onColorChange={handleColorChange} onIconChange={handleIconChange}
              onTogglePicker={togglePicker} onIconSearchChange={setIconSearch}
              onMoveUp={idx > 0 ? handleMoveUp : null}
              onMoveDown={idx < userFolders.length - 1 ? handleMoveDown : null}
            />
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={handleCreate} disabled={createMutation.isPending} className="w-full gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add folder
        </Button>
      </DialogContent>
    </Dialog>
  )
}

interface FolderRowProps {
  folder: { id: string; name: string; icon: string; color: string; system: boolean }
  isEditing: boolean
  editingName: string
  showPicker: boolean
  pickerType: "color" | "icon" | null
  iconSearch: string
  onEditingNameChange: (name: string) => void
  onStartRename: (id: string, name: string) => void
  onSaveRename: (id: string) => void
  onDelete: ((id: string) => void) | null
  onColorChange: ((id: string, color: string) => void) | null
  onIconChange: ((id: string, icon: string) => void) | null
  onTogglePicker: (id: string, type: "color" | "icon") => void
  onIconSearchChange: (query: string) => void
  onMoveUp: ((id: string) => void) | null
  onMoveDown: ((id: string) => void) | null
}

function FolderRow({ folder, isEditing, editingName, showPicker, pickerType, iconSearch, onEditingNameChange, onStartRename, onSaveRename, onDelete, onColorChange, onIconChange, onTogglePicker, onIconSearchChange, onMoveUp, onMoveDown }: FolderRowProps) {
  const Icon = getFolderIcon(folder.icon)

  // No search: show curated categories. With search: scan all ~1700 Lucide icons, cap at 60 results.
  const filteredSections = useMemo(() => {
    if (!iconSearch.trim()) return FOLDER_ICON_SECTIONS
    const q = iconSearch.toLowerCase()
    const allIcons = getAllLucideIcons()
    const matches = allIcons.filter((name) => name.includes(q)).slice(0, 60)
    if (matches.length === 0) return []
    return [{ label: `Results`, icons: matches }]
  }, [iconSearch])

  return (
    <div className="group">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
        {(onMoveUp || onMoveDown) ? (
          <div className="flex flex-col -my-1">
            <button type="button" onClick={() => onMoveUp?.(folder.id)} disabled={!onMoveUp}
              className={cn("h-3 w-3.5 flex items-center justify-center", onMoveUp ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20")}>
              <ChevronUp className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => onMoveDown?.(folder.id)} disabled={!onMoveDown}
              className={cn("h-3 w-3.5 flex items-center justify-center", onMoveDown ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20")}>
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="w-3.5" />
        )}

        <button
          type="button"
          onClick={() => !folder.system && onTogglePicker(folder.id, "icon")}
          className={cn("flex-shrink-0", !folder.system && "cursor-pointer hover:opacity-80")}
        >
          <Icon className="h-4 w-4" style={{ color: folder.color }} />
        </button>

        {isEditing ? (
          <Input
            autoFocus value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={() => onSaveRename(folder.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onSaveRename(folder.id); if (e.key === "Escape") onSaveRename(folder.id) }}
            className="h-6 text-sm px-1 py-0"
          />
        ) : (
          <span className="text-sm flex-1 truncate cursor-default" onDoubleClick={() => onStartRename(folder.id, folder.name)}>
            {folder.name}
          </span>
        )}

        {!folder.system && (
          <button type="button" onClick={() => onTogglePicker(folder.id, "color")}
            className="h-4 w-4 rounded-full border border-border/50 flex-shrink-0 hover:ring-1 hover:ring-ring/30"
            style={{ backgroundColor: folder.color }}
          />
        )}

        {onDelete && (
          <button type="button" onClick={() => onDelete(folder.id)}
            className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Color picker */}
      {showPicker && pickerType === "color" && onColorChange && (
        <div className="flex flex-wrap gap-1.5 px-8 py-2">
          {FOLDER_COLORS.map((color) => (
            <button key={color} type="button" onClick={() => onColorChange(folder.id, color)}
              className={cn(
                "h-5 w-5 rounded-full border transition-transform hover:scale-110",
                color === folder.color ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : "border-border/30",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}

      {/* Icon picker with search */}
      {showPicker && pickerType === "icon" && onIconChange && (
        <div className="px-4 py-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              autoFocus placeholder="Search icons..." value={iconSearch}
              onChange={(e) => onIconSearchChange(e.target.value)}
              className="h-7 text-xs pl-7 pr-2"
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filteredSections.map((section) => (
              <div key={section.label}>
                <div className="text-[10px] text-muted-foreground/60 font-medium mb-0.5 mt-1">{section.label}</div>
                <div className="flex flex-wrap gap-0.5">
                  {section.icons.map((iconName) => {
                    const PickerIcon = getFolderIcon(iconName)
                    return (
                      <button key={iconName} type="button" onClick={() => onIconChange(folder.id, iconName)}
                        title={iconName}
                        className={cn(
                          "h-7 w-7 flex items-center justify-center rounded-md transition-colors",
                          iconName === folder.icon ? "bg-accent text-accent-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <PickerIcon className="h-4 w-4" />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {filteredSections.length === 0 && (
              <div className="text-xs text-muted-foreground/50 py-2 text-center">No icons found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
