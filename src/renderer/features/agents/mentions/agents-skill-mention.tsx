"use client"

import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react"
import { createPortal } from "react-dom"
import type { FileMentionOption } from "./agents-mentions-editor"
import { MENTION_PREFIXES } from "./agents-mentions-editor"
import { SkillIcon, IconSpinner } from "../../../components/ui/icons"

function matchesSearch(text: string, search: string): boolean {
  if (!search) return true
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  return words.every((w) => lower.includes(w))
}

interface AgentsSkillMentionProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (mention: FileMentionOption) => void
  searchText: string
  position: { top: number; left: number }
  projectPath?: string
}

export const AgentsSkillMention = memo(function AgentsSkillMention({
  isOpen, onClose, onSelect, searchText, position, projectPath,
}: AgentsSkillMentionProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const placementRef = useRef<"above" | "below" | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const { data: skills = [], isFetching } = trpc.skills.listEnabled.useQuery(
    projectPath ? { cwd: projectPath } : undefined,
    { enabled: isOpen, staleTime: 5 * 60 * 1000 },
  )

  // No debounce - skills are in memory, filter immediately
  console.log("[SkillMention] render", { searchText, skillCount: skills.length, isOpen })
  const options: FileMentionOption[] = useMemo(() => {
    console.log("[SkillMention] filtering with searchText:", JSON.stringify(searchText))
    return skills
      .filter((s) => matchesSearch(s.name, searchText) || matchesSearch(s.description, searchText))
      .map((s) => ({
        id: `${MENTION_PREFIXES.SKILL}${s.name}`,
        label: s.name,
        path: s.path,
        repository: "",
        truncatedPath: s.description,
        type: "skill" as const,
        description: s.description,
        source: s.source as "user" | "project",
      }))
  }, [skills, searchText])

  useLayoutEffect(() => { setSelectedIndex(0) }, [isOpen, searchText])
  useEffect(() => { if (!isOpen) placementRef.current = null }, [isOpen])

  // Keyboard nav
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
          setSelectedIndex((p) => (p + 1) % options.length)
          break
        case "ArrowUp":
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
          setSelectedIndex((p) => (p - 1 + options.length) % options.length)
          break
        case "Enter":
        case "Tab":
          if (options.length > 0) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
            onSelect(options[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
          onClose()
          break
      }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [isOpen, options, selectedIndex, onSelect, onClose])

  // Scroll selected into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return
    const el = dropdownRef.current.querySelector(`[data-option-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [isOpen, selectedIndex])

  // Click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Positioning
  const dropdownWidth = 260
  const itemHeight = 28
  const headerHeight = 28
  const paddingHeight = 8
  const requestedHeight = Math.min(options.length * itemHeight + headerHeight + paddingHeight, 200)
  const gap = 8
  const safeMargin = 10
  const lineHeight = 20
  const availableBelow = window.innerHeight - (position.top + lineHeight) - safeMargin
  const availableAbove = position.top - safeMargin

  if (placementRef.current === null) {
    const shouldAbove = (availableAbove >= requestedHeight && availableBelow < requestedHeight) ||
      (availableAbove > availableBelow && availableAbove >= requestedHeight)
    placementRef.current = shouldAbove ? "above" : "below"
  }
  const placeAbove = placementRef.current === "above"
  let finalTop = placeAbove ? position.top - gap : position.top + lineHeight + gap
  let finalLeft = position.left
  if (finalLeft + dropdownWidth > window.innerWidth - safeMargin) finalLeft = window.innerWidth - dropdownWidth - safeMargin
  if (finalLeft < safeMargin) finalLeft = safeMargin
  const computedMaxHeight = Math.max(80, Math.min(requestedHeight, placeAbove ? availableAbove - gap : availableBelow - gap))
  const transformY = placeAbove ? "translateY(-100%)" : "translateY(0)"

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[99999] overflow-y-auto rounded-[10px] border border-border bg-popover py-1 text-xs text-popover-foreground shadow-lg dark [&::-webkit-scrollbar]:hidden"
      style={{ top: finalTop, left: finalLeft, width: `${dropdownWidth}px`, maxHeight: `${computedMaxHeight}px`, transform: transformY, scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
    >
      <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <span>Skills</span>
        <span className="text-yellow-500 font-mono text-[9px]">[{JSON.stringify(searchText)}]</span>
        {isFetching && <IconSpinner className="h-2.5 w-2.5" />}
      </div>

      {!isFetching && options.length === 0 && (
        <div className="h-7 px-1.5 mx-1 flex items-center text-xs text-muted-foreground">
          {searchText ? `No skills matching "${searchText}"` : "No skills found"}
        </div>
      )}

      {options.map((option, index) => {
        const isSelected = selectedIndex === index
        return (
          <div
            key={option.id}
            data-option-index={index}
            onClick={() => onSelect(option)}
            onMouseEnter={() => { setHoverIndex(index); setSelectedIndex(index) }}
            onMouseLeave={() => setHoverIndex((prev) => (prev === index ? null : prev))}
            className={cn(
              "group w-[calc(100%-8px)] mx-1 outline-none",
              "px-1.5 py-1 justify-start text-xs rounded-md",
              "transition-colors cursor-pointer select-none",
              isSelected
                ? "dark:bg-neutral-800 bg-accent text-foreground"
                : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
            )}
          >
            <div className="flex items-center gap-1.5">
              <SkillIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate font-medium">{option.label}</span>
            </div>
            {option.description && (
              <div className="text-[10px] text-muted-foreground/60 truncate pl-[18px]">{option.description}</div>
            )}
          </div>
        )
      })}
    </div>,
    document.body,
  )
})
