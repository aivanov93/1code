import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronDown, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
  codexApiKeyAtom,
  codexLoginModalOpenAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  normalizeCodexApiKey,
  openaiApiKeyAtom,
} from "../../../lib/atoms"
import { ClaudeCodeIcon, CodexIcon } from "../../ui/icons"
import {
  claudeModelCatalogAtom,
  codexModelCatalogAtom,
  lastSelectedCodexModelIdAtom,
  lastSelectedCodexThinkingAtom,
  lastSelectedModelIdAtom,
} from "../../../features/agents/atoms"
import {
  ALL_CODEX_THINKING_LEVELS,
  SEEDED_CLAUDE_MODELS,
  SEEDED_CODEX_MODELS,
  formatCodexThinkingLabel,
  normalizeCodexThinkingSelection,
  type ClaudeModelOption,
  type CodexModelOption,
  type CodexThinkingLevel,
} from "../../../features/agents/lib/models"
import { DESKTOP_LOCAL_ONLY } from "../../../../shared/local-mode"
import { trpc } from "../../../lib/trpc"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import { Checkbox } from "../../ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

function moveRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= rows.length) return rows
  const copy = [...rows]
  const [item] = copy.splice(index, 1)
  copy.splice(nextIndex, 0, item)
  return copy
}

function normalizeClaudeRows(rows: ClaudeModelOption[]): ClaudeModelOption[] {
  return rows.map((row) => ({
    label: row.label.trim(),
    slug: row.slug.trim(),
  }))
}

function normalizeCodexRows(rows: CodexModelOption[]): CodexModelOption[] {
  return rows.map((row) => {
    const thinkings = ALL_CODEX_THINKING_LEVELS.filter((thinking) =>
      row.thinkings.includes(thinking),
    )
    const defaultThinking = normalizeCodexThinkingSelection(
      { ...row, thinkings },
      row.defaultThinking,
    )

    return {
      label: row.label.trim(),
      slug: row.slug.trim(),
      thinkings,
      defaultThinking,
    }
  })
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>()
  for (const value of values) {
    const key = value.trim().toLowerCase()
    if (seen.has(key)) return value
    seen.add(key)
  }
  return null
}

function validateClaudeRows(rows: ClaudeModelOption[]): string | null {
  if (rows.length === 0) return "Add at least one Claude model."
  if (rows.some((row) => !row.label || !row.slug)) {
    return "Claude rows need both a label and a slug."
  }

  const duplicateLabel = findDuplicate(rows.map((row) => row.label))
  if (duplicateLabel) {
    return `Claude label must be unique: ${duplicateLabel}`
  }

  const duplicateSlug = findDuplicate(rows.map((row) => row.slug))
  if (duplicateSlug) {
    return `Claude slug must be unique: ${duplicateSlug}`
  }

  return null
}

function validateCodexRows(rows: CodexModelOption[]): string | null {
  if (rows.length === 0) return "Add at least one Codex model."
  if (rows.some((row) => !row.label || !row.slug)) {
    return "Codex rows need both a label and a slug."
  }
  if (rows.some((row) => row.thinkings.length === 0)) {
    return "Each Codex row needs at least one thinking level."
  }

  const duplicateLabel = findDuplicate(rows.map((row) => row.label))
  if (duplicateLabel) {
    return `Codex label must be unique: ${duplicateLabel}`
  }

  const duplicateSlug = findDuplicate(rows.map((row) => row.slug))
  if (duplicateSlug) {
    return `Codex slug must be unique: ${duplicateSlug}`
  }

  return null
}

// Account row component
function AccountRow({
  account,
  isActive,
  onSetActive,
  onRename,
  onRemove,
  isLoading,
}: {
  account: {
    id: string
    displayName: string | null
    email: string | null
    connectedAt: string | null
  }
  isActive: boolean
  onSetActive: () => void
  onRename: () => void
  onRemove: () => void
  isLoading: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-sm font-medium">
            {account.displayName || "Anthropic Account"}
          </div>
          {account.email && (
            <div className="text-xs text-muted-foreground">{account.email}</div>
          )}
          {!account.email && account.connectedAt && (
            <div className="text-xs text-muted-foreground">
              Connected{" "}
              {new Date(account.connectedAt).toLocaleDateString(undefined, {
                dateStyle: "short",
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetActive}
            disabled={isLoading}
          >
            Switch
          </Button>
        )}
        {isActive && (
          <Badge variant="secondary" className="text-xs">
            Active
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onRemove}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// Anthropic accounts section component
function AnthropicAccountsSection() {
  const { data: accounts, isLoading: isAccountsLoading, refetch: refetchList } =
    trpc.anthropicAccounts.list.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: activeAccount, refetch: refetchActive } =
    trpc.anthropicAccounts.getActive.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: claudeCodeIntegration } = trpc.claudeCode.getIntegration.useQuery()
  const trpcUtils = trpc.useUtils()

  // Auto-migrate legacy account if needed
  const migrateLegacy = trpc.anthropicAccounts.migrateLegacy.useMutation({
    onSuccess: async () => {
      await refetchList()
      await refetchActive()
    },
  })

  // Trigger migration if: no accounts, not loading, has legacy connection, not already migrating
  useEffect(() => {
    if (
      !isAccountsLoading &&
      accounts?.length === 0 &&
      claudeCodeIntegration?.isConnected &&
      !migrateLegacy.isPending &&
      !migrateLegacy.isSuccess
    ) {
      migrateLegacy.mutate()
    }
  }, [isAccountsLoading, accounts, claudeCodeIntegration, migrateLegacy])

  const setActiveMutation = trpc.anthropicAccounts.setActive.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account switched")
    },
    onError: (err) => {
      toast.error(`Failed to switch account: ${err.message}`)
    },
  })

  const renameMutation = trpc.anthropicAccounts.rename.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      toast.success("Account renamed")
    },
    onError: (err) => {
      toast.error(`Failed to rename account: ${err.message}`)
    },
  })

  const removeMutation = trpc.anthropicAccounts.remove.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account removed")
    },
    onError: (err) => {
      toast.error(`Failed to remove account: ${err.message}`)
    },
  })

  const handleRename = (accountId: string, currentName: string | null) => {
    const newName = window.prompt(
      "Enter new name for this account:",
      currentName || "Anthropic Account"
    )
    if (newName && newName.trim()) {
      renameMutation.mutate({ accountId, displayName: newName.trim() })
    }
  }

  const handleRemove = (accountId: string, displayName: string | null) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${displayName || "this account"}"? You will need to re-authenticate to use it again.`
    )
    if (confirmed) {
      removeMutation.mutate({ accountId })
    }
  }

  const isLoading =
    setActiveMutation.isPending ||
    renameMutation.isPending ||
    removeMutation.isPending

  // Don't show section if no accounts
  if (!isAccountsLoading && (!accounts || accounts.length === 0)) {
    return null
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
        {isAccountsLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading accounts...
          </div>
        ) : (
          accounts?.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isActive={activeAccount?.id === account.id}
              onSetActive={() => setActiveMutation.mutate({ accountId: account.id })}
              onRename={() => handleRename(account.id, account.displayName)}
              onRemove={() => handleRemove(account.id, account.displayName)}
              isLoading={isLoading}
            />
          ))
        )}
    </div>
  )
}

export function AgentsModelsTab() {
  const [storedClaudeModels, setStoredClaudeModels] = useAtom(claudeModelCatalogAtom)
  const [storedCodexModels, setStoredCodexModels] = useAtom(codexModelCatalogAtom)
  const [lastSelectedClaudeModel, setLastSelectedClaudeModel] = useAtom(
    lastSelectedModelIdAtom,
  )
  const [lastSelectedCodexModelId, setLastSelectedCodexModelId] = useAtom(
    lastSelectedCodexModelIdAtom,
  )
  const [lastSelectedCodexThinking, setLastSelectedCodexThinking] = useAtom(
    lastSelectedCodexThinkingAtom,
  )
  const setClaudeLoginModalConfig = useSetAtom(claudeLoginModalConfigAtom)
  const setClaudeLoginModalOpen = useSetAtom(agentsLoginModalOpenAtom)
  const setCodexLoginModalOpen = useSetAtom(codexLoginModalOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected
  const { data: codexIntegration, isLoading: isCodexLoading } =
    trpc.codex.getIntegration.useQuery()

  // OpenAI API key state
  const [storedCodexApiKey, setStoredCodexApiKey] = useAtom(codexApiKeyAtom)
  const [codexApiKey, setCodexApiKey] = useState(storedCodexApiKey)
  const [isSavingCodexApiKey, setIsSavingCodexApiKey] = useState(false)
  const codexOnboardingCompleted = useAtomValue(codexOnboardingCompletedAtom)
  const codexOnboardingAuthMethod = useAtomValue(codexOnboardingAuthMethodAtom)
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const [claudeModelsDraft, setClaudeModelsDraft] = useState(storedClaudeModels)
  const [codexModelsDraft, setCodexModelsDraft] = useState(storedCodexModels)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const codexLogoutMutation = trpc.codex.logout.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setClaudeModelsDraft(storedClaudeModels)
  }, [storedClaudeModels])

  useEffect(() => {
    setCodexModelsDraft(storedCodexModels)
  }, [storedCodexModels])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  useEffect(() => {
    setCodexApiKey(storedCodexApiKey)
  }, [storedCodexApiKey])

  const claudeModelsDirty =
    JSON.stringify(claudeModelsDraft) !== JSON.stringify(storedClaudeModels)
  const codexModelsDirty =
    JSON.stringify(codexModelsDraft) !== JSON.stringify(storedCodexModels)

  const handleSaveClaudeModels = useCallback(() => {
    const normalized = normalizeClaudeRows(claudeModelsDraft)
    const error = validateClaudeRows(normalized)
    if (error) {
      toast.error(error)
      return
    }

    setStoredClaudeModels(normalized)
    if (!normalized.some((row) => row.slug === lastSelectedClaudeModel)) {
      setLastSelectedClaudeModel(normalized[0]!.slug)
    }
    toast.success("Claude models updated")
  }, [
    claudeModelsDraft,
    lastSelectedClaudeModel,
    setLastSelectedClaudeModel,
    setStoredClaudeModels,
  ])

  const handleSaveCodexModels = useCallback(() => {
    const normalized = normalizeCodexRows(codexModelsDraft)
    const error = validateCodexRows(normalized)
    if (error) {
      toast.error(error)
      return
    }

    setStoredCodexModels(normalized)
    const selectedModel =
      normalized.find((row) => row.slug === lastSelectedCodexModelId) ||
      normalized[0]
    if (selectedModel && selectedModel.slug !== lastSelectedCodexModelId) {
      setLastSelectedCodexModelId(selectedModel.slug)
    }
    setLastSelectedCodexThinking(
      normalizeCodexThinkingSelection(selectedModel, lastSelectedCodexThinking),
    )
    toast.success("Codex models updated")
  }, [
    codexModelsDraft,
    lastSelectedCodexModelId,
    lastSelectedCodexThinking,
    setLastSelectedCodexModelId,
    setLastSelectedCodexThinking,
    setStoredCodexModels,
  ])

  const updateClaudeRow = useCallback(
    (index: number, patch: Partial<ClaudeModelOption>) => {
      setClaudeModelsDraft((rows) =>
        rows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, ...patch } : row,
        ),
      )
    },
    [],
  )

  const updateCodexRow = useCallback(
    (index: number, patch: Partial<CodexModelOption>) => {
      setCodexModelsDraft((rows) =>
        rows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, ...patch } : row,
        ),
      )
    },
    [],
  )

  const toggleCodexThinking = useCallback(
    (index: number, thinking: CodexThinkingLevel, checked: boolean) => {
      setCodexModelsDraft((rows) =>
        rows.map((row, rowIndex) => {
          if (rowIndex !== index) return row
          const thinkings = checked
            ? ALL_CODEX_THINKING_LEVELS.filter((item) =>
                item === thinking || row.thinkings.includes(item),
              )
            : row.thinkings.filter((item) => item !== thinking)

          if (thinkings.length === 0) {
            return row
          }

          return {
            ...row,
            thinkings,
            defaultThinking: normalizeCodexThinkingSelection(
              { ...row, thinkings },
              row.defaultThinking,
            ),
          }
        }),
      )
    },
    [],
  )

  const handleClaudeCodeSetup = () => {
    setClaudeLoginModalConfig({
      hideCustomModelSettingsLink: true,
      autoStartAuth: true,
    })
    setClaudeLoginModalOpen(true)
  }

  const handleCodexSetup = () => {
    setCodexLoginModalOpen(true)
  }

  const handleCodexLogout = async () => {
    const confirmed = window.confirm(
      "Log out from Codex on this device?",
    )
    if (!confirmed) return

    try {
      await codexLogoutMutation.mutateAsync()
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success("Codex disconnected")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect Codex"
      toast.error(message)
    }
  }

  const normalizedStoredCodexApiKey = normalizeCodexApiKey(storedCodexApiKey)
  const hasAppCodexApiKey = Boolean(normalizedStoredCodexApiKey)
  const hasLocalCodexSubscription =
    codexOnboardingCompleted && codexOnboardingAuthMethod === "chatgpt"
  const isCodexSubscriptionConnected =
    codexIntegration?.state === "connected_chatgpt" ||
    (!codexIntegration && hasLocalCodexSubscription)
  const isCodexSubscriptionActive =
    isCodexSubscriptionConnected && !hasAppCodexApiKey

  const codexConnectionText = isCodexSubscriptionConnected
    ? "Connected via ChatGPT"
    : codexIntegration?.state === "connected_api_key"
      ? "Not connected to subscription"
      : codexIntegration?.state === "not_logged_in"
        ? "Not connected"
        : "Status unavailable"
  const showCodexLoading =
    isCodexLoading && !hasAppCodexApiKey && !hasLocalCodexSubscription

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleCodexApiKeyBlur = async () => {
    const trimmedKey = codexApiKey.trim()

    if (trimmedKey === storedCodexApiKey) return
    if (!trimmedKey) return

    const normalized = normalizeCodexApiKey(trimmedKey)
    if (!normalized) {
      toast.error("Invalid Codex API key format. Key should start with 'sk-'")
      setCodexApiKey(storedCodexApiKey)
      return
    }

    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey(normalized)
      setCodexApiKey(normalized)
      await trpcUtils.codex.getIntegration.invalidate()
      toast.success("Codex API key saved")
    } catch {
      toast.error("Failed to save Codex API key")
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleRemoveCodexApiKey = async () => {
    setIsSavingCodexApiKey(true)
    try {
      setStoredCodexApiKey("")
      setCodexApiKey("")

      if (codexIntegration?.state === "connected_api_key") {
        await codexLogoutMutation.mutateAsync().catch(() => {
          toast.error("Codex API key removed, but failed to log out Codex CLI")
        })
      }

      await trpcUtils.codex.getIntegration.invalidate()
      toast.success("Codex API key removed")
    } catch {
      toast.error("Failed to remove Codex API key")
    } finally {
      setIsSavingCodexApiKey(false)
    }
  }

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey === storedOpenAIKey) return // No change
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key saved")
    } catch (err) {
      toast.error("Failed to save OpenAI API key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key removed")
    } catch (err) {
      toast.error("Failed to remove OpenAI API key")
    }
  }

  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
        </div>
      )}

      {/* ===== Models Section ===== */}
      <div className="space-y-4">
        <div className="bg-background rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-foreground">
                  Claude Models
                </h4>
                <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Editable label to slug mappings passed directly to Claude Code.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setClaudeModelsDraft(storedClaudeModels)}
                disabled={!claudeModelsDirty}
              >
                Reset
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setClaudeModelsDraft(SEEDED_CLAUDE_MODELS.map((row) => ({ ...row })))
                }
              >
                Restore Seeded
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                setClaudeModelsDraft((rows) => [...rows, { label: "", slug: "" }])
              }}>
                <Plus className="h-3 w-3 mr-1" />
                Add Model
              </Button>
              <Button
                size="sm"
                onClick={handleSaveClaudeModels}
                disabled={!claudeModelsDirty}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[44px_1.6fr_1.2fr_44px] gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
              <span>Order</span>
              <span>Label</span>
              <span>Slug</span>
              <span className="text-right">Delete</span>
            </div>
            <div className="divide-y divide-border">
              {claudeModelsDraft.map((row, index) => (
                <div
                  key={`claude-${index}`}
                  className="grid grid-cols-[44px_1.6fr_1.2fr_44px] gap-2 px-4 py-3 items-center"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      disabled={index === 0}
                      onClick={() =>
                        setClaudeModelsDraft((rows) => moveRow(rows, index, -1))
                      }
                    >
                      <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      disabled={index === claudeModelsDraft.length - 1}
                      onClick={() =>
                        setClaudeModelsDraft((rows) => moveRow(rows, index, 1))
                      }
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={row.label}
                    placeholder="Opus 4.6"
                    onChange={(e) => updateClaudeRow(index, { label: e.target.value })}
                  />
                  <Input
                    value={row.slug}
                    placeholder="opus"
                    onChange={(e) => updateClaudeRow(index, { slug: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 justify-self-end"
                    onClick={() =>
                      setClaudeModelsDraft((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-background rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-foreground">
                  Codex Models
                </h4>
                <CodexIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Editable label to slug mappings plus allowed/default thinking levels.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCodexModelsDraft(storedCodexModels)}
                disabled={!codexModelsDirty}
              >
                Reset
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setCodexModelsDraft(
                    SEEDED_CODEX_MODELS.map((row) => ({
                      ...row,
                      thinkings: [...row.thinkings],
                    })),
                  )
                }
              >
                Restore Seeded
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCodexModelsDraft((rows) => [
                    ...rows,
                    {
                      label: "",
                      slug: "",
                      thinkings: ["high"],
                      defaultThinking: "high",
                    },
                  ])
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Model
              </Button>
              <Button
                size="sm"
                onClick={handleSaveCodexModels}
                disabled={!codexModelsDirty}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[44px_1.3fr_1.2fr_2fr_120px_44px] gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
              <span>Order</span>
              <span>Label</span>
              <span>Slug</span>
              <span>Thinking</span>
              <span>Default</span>
              <span className="text-right">Delete</span>
            </div>
            <div className="divide-y divide-border">
              {codexModelsDraft.map((row, index) => (
                <div
                  key={`codex-${index}`}
                  className="grid grid-cols-[44px_1.3fr_1.2fr_2fr_120px_44px] gap-2 px-4 py-3 items-center"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      disabled={index === 0}
                      onClick={() =>
                        setCodexModelsDraft((rows) => moveRow(rows, index, -1))
                      }
                    >
                      <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      disabled={index === codexModelsDraft.length - 1}
                      onClick={() =>
                        setCodexModelsDraft((rows) => moveRow(rows, index, 1))
                      }
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={row.label}
                    placeholder="Codex 5.4"
                    onChange={(e) => updateCodexRow(index, { label: e.target.value })}
                  />
                  <Input
                    value={row.slug}
                    placeholder="gpt-5.4-codex"
                    onChange={(e) => updateCodexRow(index, { slug: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-3">
                    {ALL_CODEX_THINKING_LEVELS.map((thinking) => (
                      <label
                        key={`${row.slug || index}-${thinking}`}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <Checkbox
                          checked={row.thinkings.includes(thinking)}
                          onCheckedChange={(checked) =>
                            toggleCodexThinking(index, thinking, checked === true)
                          }
                        />
                        <span>{formatCodexThinkingLabel(thinking)}</span>
                      </label>
                    ))}
                  </div>
                  <select
                    value={row.defaultThinking}
                    onChange={(e) =>
                      updateCodexRow(index, {
                        defaultThinking: e.target.value as CodexThinkingLevel,
                      })
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {row.thinkings.map((thinking) => (
                      <option key={thinking} value={thinking}>
                        {formatCodexThinkingLabel(thinking)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 justify-self-end"
                    onClick={() =>
                      setCodexModelsDraft((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Accounts Section ===== */}
      <div className="space-y-2">
        {/* Anthropic Accounts */}
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Anthropic Accounts
            </h4>
            <p className="text-xs text-muted-foreground">
              {DESKTOP_LOCAL_ONLY
                ? "Existing Claude subscription accounts remain local. New sign-ins are disabled."
                : "Manage your Claude API accounts"}
            </p>
          </div>
          {!DESKTOP_LOCAL_ONLY && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClaudeCodeSetup}
              disabled={isClaudeCodeLoading}
            >
              <Plus className="h-3 w-3 mr-1" />
              {isClaudeCodeConnected ? "Add" : "Connect"}
            </Button>
          )}
        </div>

        <AnthropicAccountsSection />
      </div>

      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Codex Account
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your Codex account
            </p>
          </div>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
          {showCodexLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading account...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-6 p-4 hover:bg-muted/50">
                <div>
                  <div className="text-sm font-medium">Codex Subscription</div>
                  <div className="text-xs text-muted-foreground">
                    {codexConnectionText}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCodexSubscriptionActive && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                  {isCodexSubscriptionConnected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexLogout()}
                      disabled={codexLogoutMutation.isPending}
                    >
                      {codexLogoutMutation.isPending ? "..." : "Logout"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCodexSetup()}
                      disabled={
                        isCodexLoading ||
                        codexLogoutMutation.isPending ||
                        isSavingCodexApiKey
                      }
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== API Keys Section (Collapsible) ===== */}
      <Collapsible open={isApiKeysOpen} onOpenChange={setIsApiKeysOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
          <ChevronDown className={`h-4 w-4 transition-transform ${isApiKeysOpen ? "" : "-rotate-90"}`} />
          API Keys
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* Codex API Key */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Codex API Key</Label>
                  {hasAppCodexApiKey && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Takes priority over subscription
                </p>
              </div>
              <div className="flex-shrink-0 w-80 flex items-center gap-2">
                <Input
                  type="password"
                  value={codexApiKey}
                  onChange={(e) => setCodexApiKey(e.target.value)}
                  onBlur={handleCodexApiKeyBlur}
                  className="w-full font-mono"
                  placeholder="sk-..."
                />
                {hasAppCodexApiKey && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleRemoveCodexApiKey()}
                    disabled={isSavingCodexApiKey}
                    aria-label="Remove Codex API key"
                    className="text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* OpenAI API Key for Voice Input */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">OpenAI API Key</Label>
                  {canResetOpenAI && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetOpenAI}
                      disabled={setOpenAIKeyMutation.isPending}
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Required for voice transcription (Whisper API)
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  onBlur={handleSaveOpenAI}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
