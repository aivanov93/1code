export type CodexThinkingLevel = "low" | "medium" | "high" | "xhigh"

export type ClaudeEffortLevel = "low" | "medium" | "high" | "max"

export const ALL_CLAUDE_EFFORT_LEVELS: ClaudeEffortLevel[] = [
  "low",
  "medium",
  "high",
  "max",
]

export function formatClaudeEffortLabel(effort: ClaudeEffortLevel): string {
  if (effort === "max") return "Max"
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}

export type ClaudeModelOption = {
  label: string
  slug: string
}

export type CodexModelOption = {
  label: string
  slug: string
  thinkings: CodexThinkingLevel[]
  defaultThinking: CodexThinkingLevel
}

export const ALL_CODEX_THINKING_LEVELS: CodexThinkingLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
]

export const SEEDED_CLAUDE_MODELS: ClaudeModelOption[] = [
  { label: "Opus 4.6", slug: "opus" },
  { label: "Sonnet 4.6", slug: "sonnet" },
  { label: "Haiku 4.5", slug: "haiku" },
]

export const SEEDED_CODEX_MODELS: CodexModelOption[] = [
  {
    label: "Codex 5.3",
    slug: "gpt-5.3-codex",
    thinkings: ["low", "medium", "high", "xhigh"],
    defaultThinking: "high",
  },
  {
    label: "Codex 5.2",
    slug: "gpt-5.2-codex",
    thinkings: ["low", "medium", "high", "xhigh"],
    defaultThinking: "high",
  },
  {
    label: "Codex 5.1 Max",
    slug: "gpt-5.1-codex-max",
    thinkings: ["low", "medium", "high", "xhigh"],
    defaultThinking: "high",
  },
  {
    label: "Codex 5.1 Mini",
    slug: "gpt-5.1-codex-mini",
    thinkings: ["medium", "high"],
    defaultThinking: "high",
  },
]

export function formatCodexThinkingLabel(thinking: CodexThinkingLevel): string {
  if (thinking === "xhigh") return "Extra High"
  return thinking.charAt(0).toUpperCase() + thinking.slice(1)
}

export function getDefaultClaudeModelSlug(
  models: ClaudeModelOption[],
): string {
  return models[0]?.slug || SEEDED_CLAUDE_MODELS[0]!.slug
}

export function getDefaultCodexModel(
  models: CodexModelOption[],
): CodexModelOption {
  return models[0] || SEEDED_CODEX_MODELS[0]!
}

export function getDefaultCodexModelSlug(
  models: CodexModelOption[],
): string {
  return getDefaultCodexModel(models).slug
}

export function normalizeCodexThinkingSelection(
  model: CodexModelOption | undefined,
  selectedThinking?: string | null,
): CodexThinkingLevel {
  const fallbackModel = model || SEEDED_CODEX_MODELS[0]
  if (!fallbackModel) return "high"

  if (
    selectedThinking &&
    fallbackModel.thinkings.includes(selectedThinking as CodexThinkingLevel)
  ) {
    return selectedThinking as CodexThinkingLevel
  }

  if (fallbackModel.thinkings.includes(fallbackModel.defaultThinking)) {
    return fallbackModel.defaultThinking
  }

  return fallbackModel.thinkings[0] || "high"
}
