"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

// Chromium 137+ Selection API extension for Shadow DOM support
declare global {
  interface Selection {
    getComposedRanges?(options: { shadowRoots: ShadowRoot[] }): StaticRange[]
  }
}

// Discriminated union for selection source
export type TextSelectionSource =
  | { type: "assistant-message"; messageId: string }
  | { type: "diff"; filePath: string; lineNumber?: number; lineType?: "old" | "new" }
  | { type: "tool-edit"; filePath: string; isWrite: boolean }
  | { type: "plan"; planPath: string }
  | { type: "file-viewer"; filePath: string }

export interface TextSelectionState {
  selectedText: string | null
  source: TextSelectionSource | null
  selectionRect: DOMRect | null
}

export interface HoveredDiffLineState {
  text: string
  source: Extract<TextSelectionSource, { type: "diff" }>
  rect: DOMRect
}

interface TextSelectionContextValue extends TextSelectionState {
  hoveredDiffLine: HoveredDiffLineState | null
  clearSelection: () => void
  // Legacy getters for backwards compatibility
  selectedMessageId: string | null
}

const TextSelectionContext = createContext<TextSelectionContextValue | null>(
  null
)

export function useTextSelection(): TextSelectionContextValue {
  const ctx = useContext(TextSelectionContext)
  if (!ctx) {
    throw new Error(
      "useTextSelection must be used within TextSelectionProvider"
    )
  }
  return ctx
}

interface TextSelectionProviderProps {
  children: ReactNode
}

// Collect all open shadow roots from diffs-container elements
function getDiffShadowRoots(): ShadowRoot[] {
  const roots: ShadowRoot[] = []
  document.querySelectorAll("diffs-container").forEach((el) => {
    const sr = (el as HTMLElement).shadowRoot
    if (sr) roots.push(sr)
  })
  return roots
}

/**
 * Convert a StaticRange to a live Range (needed for toString() and getBoundingClientRect()).
 * StaticRange from getComposedRanges doesn't have these methods.
 */
function toLiveRange(staticRange: StaticRange): Range | null {
  try {
    const range = document.createRange()
    range.setStart(staticRange.startContainer, staticRange.startOffset)
    range.setEnd(staticRange.endContainer, staticRange.endOffset)
    return range
  } catch {
    return null
  }
}

/**
 * Get the selection range that works across Shadow DOM boundaries.
 * Uses getComposedRanges (Chromium 137+) to resolve nodes inside shadow trees.
 * Falls back to getRangeAt(0) for non-shadow selections.
 *
 * Returns the resolved range, the element at the start, and the extracted text.
 * We extract text here because selection.toString() may be empty/incorrect
 * for selections inside Shadow DOM.
 */
function getSelectionRange(selection: Selection): { range: Range; element: Element | null; text: string } | null {
  // Try getComposedRanges first — works across Shadow DOM (Chromium 137+)
  if (typeof selection.getComposedRanges === "function") {
    const shadowRoots = getDiffShadowRoots()
    try {
      const ranges = selection.getComposedRanges({ shadowRoots })
      if (ranges.length > 0) {
        const staticRange = ranges[0]!
        if (staticRange.startContainer === staticRange.endContainer && staticRange.startOffset === staticRange.endOffset) {
          return null
        }
        const liveRange = toLiveRange(staticRange)
        if (!liveRange) return null

        const container = staticRange.startContainer
        const element = container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element)
        const text = liveRange.toString()
        return { range: liveRange, element, text }
      }
    } catch {
      // Fall through to legacy path
    }
  }

  // Legacy path — works for light DOM selections
  if (selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const element = container.nodeType === Node.TEXT_NODE
    ? container.parentElement
    : (container as Element)
  const text = selection.toString()
  return { range, element, text }
}

// Helper to extract line number from diff selection
// @pierre/diffs uses data-line and data-line-type attributes on line rows
function extractDiffLineInfo(element: Element): { lineNumber?: number; lineType?: "old" | "new" } {
  const lineRow = element.closest?.("[data-line]") as HTMLElement | null
  if (!lineRow) return {}

  const lineNum = lineRow.getAttribute("data-line")
  const lineType = lineRow.getAttribute("data-line-type")

  let lineNumber: number | undefined
  let type: "old" | "new" | undefined

  if (lineNum) {
    lineNumber = parseInt(lineNum, 10)
  }

  if (lineType) {
    if (lineType === "change-deletion") {
      type = "old"
    } else if (lineType === "change-addition") {
      type = "new"
    } else {
      type = "new"
    }
  }

  return { lineNumber, lineType: type }
}

function findClosestDiffRow(node: Node | null): HTMLElement | null {
  let current: Node | null = node
  while (current) {
    if (current instanceof HTMLElement) {
      const row = current.closest("[data-line]")
      if (row) return row as HTMLElement
    }
    const root = current.getRootNode()
    if (root instanceof ShadowRoot) {
      current = root.host
      continue
    }
    break
  }
  return null
}

function findDiffCardForRow(row: HTMLElement | null): HTMLElement | null {
  if (!row) return null
  let current: Node | null = row
  while (current) {
    if (current instanceof HTMLElement) {
      const card = current.closest("[data-diff-file-path]")
      if (card) return card as HTMLElement
    }
    const root = current.getRootNode()
    if (root instanceof ShadowRoot) {
      current = root.host
      continue
    }
    break
  }
  return null
}

function getLineRowsBetween(startRow: HTMLElement, endRow: HTMLElement): HTMLElement[] {
  const root = startRow.getRootNode()
  if (!(root instanceof ShadowRoot || root instanceof Document)) {
    return [startRow]
  }

  const rows = Array.from(root.querySelectorAll("[data-line]")) as HTMLElement[]
  const startIndex = rows.indexOf(startRow)
  const endIndex = rows.indexOf(endRow)
  if (startIndex === -1 || endIndex === -1) return [startRow]

  const from = Math.min(startIndex, endIndex)
  const to = Math.max(startIndex, endIndex)
  return rows.slice(from, to + 1)
}

function extractDiffRowsText(rows: HTMLElement[]): string {
  return rows
    .map((row) => {
      const contentNodes = Array.from(row.querySelectorAll("[data-column-content]")) as HTMLElement[]
      const contentText = contentNodes
        .map((node) => node.textContent?.trim() || "")
        .filter(Boolean)
      if (contentText.length > 0) return contentText.join(" ")
      return row.textContent?.trim() || ""
    })
    .filter(Boolean)
    .join("\n")
}

function buildDiffSelectionRect(rows: HTMLElement[]): DOMRect | null {
  if (rows.length === 0) return null
  const firstRect = rows[0]?.getBoundingClientRect()
  const lastRect = rows[rows.length - 1]?.getBoundingClientRect()
  if (!firstRect || !lastRect) return null

  const top = firstRect.top
  const bottom = lastRect.bottom
  const left = firstRect.left
  const width = Math.min(Math.max(firstRect.width * 0.22, 64), 120)
  return new DOMRect(left, top, width, bottom - top)
}

function getComposedPathRow(event: MouseEvent): HTMLElement | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : []
  for (const target of path) {
    if (target instanceof HTMLElement) {
      const row = target.closest("[data-line]")
      if (row) return row as HTMLElement
    }
    if (target instanceof ShadowRoot) {
      const row = findClosestDiffRow(target.host)
      if (row) return row
    }
  }

  if (event.target instanceof Node) {
    return findClosestDiffRow(event.target)
  }
  return null
}

export function TextSelectionProvider({
  children,
}: TextSelectionProviderProps) {
  const [state, setState] = useState<TextSelectionState>({
    selectedText: null,
    source: null,
    selectionRect: null,
  })
  const [hoveredDiffLine, setHoveredDiffLine] = useState<HoveredDiffLineState | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setState({
      selectedText: null,
      source: null,
      selectionRect: null,
    })
  }, [])

  useEffect(() => {
    let rafId: number | null = null
    const manualDiffDragRef: {
      startRow: HTMLElement | null
      diffCard: HTMLElement | null
      active: boolean
    } = {
      startRow: null,
      diffCard: null,
      active: false,
    }

    const setManualDiffSelection = (startRow: HTMLElement, endRow: HTMLElement) => {
      const rows = getLineRowsBetween(startRow, endRow)
      const text = extractDiffRowsText(rows).trim()
      const diffCard = findDiffCardForRow(startRow)
      const filePath = diffCard?.getAttribute("data-diff-file-path")
      const rect = buildDiffSelectionRect(rows)
      if (!text || !filePath || !rect) {
        setState({ selectedText: null, source: null, selectionRect: null })
        return
      }

      const lineInfo = extractDiffLineInfo(startRow)
      setState({
        selectedText: text,
        source: {
          type: "diff",
          filePath,
          lineNumber: lineInfo.lineNumber,
          lineType: lineInfo.lineType,
        },
        selectionRect: rect,
      })
    }

    const setHoveredLine = (row: HTMLElement | null) => {
      if (!row || manualDiffDragRef.active) {
        setHoveredDiffLine(null)
        return
      }

      const diffCard = findDiffCardForRow(row)
      const filePath = diffCard?.getAttribute("data-diff-file-path")
      const rect = buildDiffSelectionRect([row])
      if (!filePath || !rect) {
        setHoveredDiffLine(null)
        return
      }

      const text = extractDiffRowsText([row]).trim()
      if (!text) {
        setHoveredDiffLine(null)
        return
      }

      const lineInfo = extractDiffLineInfo(row)
      setHoveredDiffLine({
        text,
        source: {
          type: "diff",
          filePath,
          lineNumber: lineInfo.lineNumber,
          lineType: lineInfo.lineType,
        },
        rect,
      })
    }

    const handleSelectionChange = () => {
      if (manualDiffDragRef.active) return
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        rafId = null

        const selection = window.getSelection()
        if (!selection) {
          setState({ selectedText: null, source: null, selectionRect: null })
          return
        }

        // Get selection range — works across Shadow DOM via getComposedRanges
        // We get text from the range directly, not selection.toString(),
        // because selection.toString() may be empty for Shadow DOM selections
        const result = getSelectionRange(selection)
        if (!result) {
          setState({ selectedText: null, source: null, selectionRect: null })
          return
        }

        const { range, element, text: rawText } = result
        const text = rawText.trim()
        if (!text) {
          setState({ selectedText: null, source: null, selectionRect: null })
          return
        }

        // --- Resolve source ---
        let source: TextSelectionSource | null = null

        if (element) {
          // Check for file viewer content
          const fileViewerElement = element.closest?.(
            "[data-file-viewer-path]"
          ) as HTMLElement | null

          // Check for plan sidebar content
          const planElement = element.closest?.(
            "[data-plan-path]"
          ) as HTMLElement | null

          // Check for assistant message
          const messageElement = element.closest?.(
            "[data-assistant-message-id]"
          ) as HTMLElement | null

          // Check for tool-edit (Edit/Write tool in chat)
          const toolEditElement = element.closest?.(
            '[data-part-type="tool-Edit"], [data-part-type="tool-Write"]'
          ) as HTMLElement | null

          // Check for diff — element may be inside Shadow DOM of diffs-container
          // With getComposedRanges, element is the actual node inside the shadow tree
          // Walk up through shadow boundaries to find [data-diff-file-path]
          const diffCard = (() => {
            let node: Node | null = element
            while (node) {
              if (node instanceof HTMLElement) {
                const card = node.closest("[data-diff-file-path]")
                if (card) return card as HTMLElement
              }
              // Cross shadow boundary
              const root = node.getRootNode()
              if (root instanceof ShadowRoot) {
                node = root.host
                continue
              }
              break
            }
            return null
          })()

          // Priority: file-viewer > plan > tool-edit > diff > assistant-message
          if (fileViewerElement) {
            const filePath = fileViewerElement.getAttribute("data-file-viewer-path") || "unknown"
            source = { type: "file-viewer", filePath }
          }

          if (!source && planElement) {
            const planPath = planElement.getAttribute("data-plan-path") || "unknown"
            source = { type: "plan", planPath }
          }

          if (!source && toolEditElement) {
            const partType = toolEditElement.getAttribute("data-part-type")
            const isWrite = partType === "tool-Write"
            const filePath = toolEditElement.getAttribute("data-tool-file-path") || "unknown"
            source = { type: "tool-edit", filePath, isWrite }
          }

          if (!source && diffCard) {
            const filePath = diffCard.getAttribute("data-diff-file-path")
            if (filePath) {
              const lineInfo = extractDiffLineInfo(element)
              source = {
                type: "diff",
                filePath,
                lineNumber: lineInfo.lineNumber,
                lineType: lineInfo.lineType,
              }
            }
          }

          if (!source && messageElement) {
            const messageId = messageElement.getAttribute("data-assistant-message-id")
            if (messageId) {
              source = { type: "assistant-message", messageId }
            }
          }
        }

        // Selection is not within a supported element
        if (!source) {
          setState({
            selectedText: null,
            source: null,
            selectionRect: null,
          })
          return
        }

        const rect = source.type === "diff"
          ? buildDiffSelectionRect(
              (() => {
                const diffRow = findClosestDiffRow(element)
                return diffRow ? [diffRow] : []
              })()
            ) || range.getBoundingClientRect()
          : range.getBoundingClientRect()

        setState({
          selectedText: text,
          source,
          selectionRect: rect,
        })
      })
    }

    const handleMouseDown = (event: MouseEvent) => {
      const row = getComposedPathRow(event)
      if (!row) return
      const clickedContent = event.target instanceof Element
        ? event.target.closest?.("[data-column-content]")
        : null
      if (clickedContent) return

      const diffCard = findDiffCardForRow(row)
      if (!diffCard) return

      manualDiffDragRef.startRow = row
      manualDiffDragRef.diffCard = diffCard
      manualDiffDragRef.active = true
      setHoveredDiffLine(null)
      window.getSelection()?.removeAllRanges()
      event.preventDefault()
      setManualDiffSelection(row, row)
    }

    const handleMouseMove = (event: MouseEvent) => {
      const row = getComposedPathRow(event)
      if (manualDiffDragRef.active && manualDiffDragRef.startRow && manualDiffDragRef.diffCard) {
        if (!row) return
        const diffCard = findDiffCardForRow(row)
        if (diffCard !== manualDiffDragRef.diffCard) return
        setManualDiffSelection(manualDiffDragRef.startRow, row)
        return
      }

      if (stateRef.current.selectedText) {
        setHoveredDiffLine(null)
        return
      }

      if (!row) {
        return
      }

      setHoveredLine(row)
    }

    const handleMouseUp = () => {
      manualDiffDragRef.startRow = null
      manualDiffDragRef.diffCard = null
      manualDiffDragRef.active = false
    }

    document.addEventListener("selectionchange", handleSelectionChange)
    document.addEventListener("mousedown", handleMouseDown, true)
    document.addEventListener("mousemove", handleMouseMove, true)
    document.addEventListener("mouseup", handleMouseUp, true)

    // Listen for Monaco editor selection changes (Monaco doesn't fire native selectionchange)
    const handleMonacoSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string | null
        source: TextSelectionSource | null
        rect: DOMRect | null
      }
      if (!detail.text) {
        setState({ selectedText: null, source: null, selectionRect: null })
      } else {
        setState({
          selectedText: detail.text,
          source: detail.source,
          selectionRect: detail.rect,
        })
      }
    }

    window.addEventListener("monaco-selection-change", handleMonacoSelection)

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      document.removeEventListener("mousedown", handleMouseDown, true)
      document.removeEventListener("mousemove", handleMouseMove, true)
      document.removeEventListener("mouseup", handleMouseUp, true)
      window.removeEventListener("monaco-selection-change", handleMonacoSelection)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  // Compute legacy selectedMessageId for backwards compatibility
  const selectedMessageId = state.source?.type === "assistant-message"
    ? state.source.messageId
    : null

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo<TextSelectionContextValue>(() => ({
    ...state,
    hoveredDiffLine,
    clearSelection,
    selectedMessageId,
  }), [state, hoveredDiffLine, clearSelection, selectedMessageId])

  return (
    <TextSelectionContext.Provider value={contextValue}>
      {children}
    </TextSelectionContext.Provider>
  )
}
