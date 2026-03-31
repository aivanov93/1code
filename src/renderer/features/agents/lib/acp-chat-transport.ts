import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import { normalizeCodexStreamChunk } from "../../../../shared/codex-tool-normalizer"
import {
  codexApiKeyAtom,
  codexLoginModalOpenAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  normalizeCodexApiKey,
  sessionInfoAtom,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import {
  pendingAuthRetryMessageAtom,
  codexModelCatalogAtom,
  subChatCodexModelIdAtomFamily,
  subChatCodexThinkingAtomFamily,
} from "../atoms"
import {
  getDefaultCodexModel,
  normalizeCodexThinkingSelection,
} from "./models"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import type { AgentMessageMetadata } from "../ui/agent-message-usage"

type UIMessageChunk = any

type ACPChatTransportConfig = {
  chatId: string
  subChatId: string
  cwd: string
  projectPath?: string
  mode: "plan" | "agent"
  provider: "codex"
}

type ImageAttachment = {
  base64Data: string
  mediaType: string
  filename?: string
}

// When a sub-chat hits auth-error, force one fresh Codex ACP session on next send.
const forceFreshSessionSubChats = new Set<string>()
const DEFAULT_CODEX_MODEL = "gpt-5.3-codex/high"
function getStoredCodexCredentials(): {
  hasApiKey: boolean
  hasSubscription: boolean
  hasAny: boolean
} {
  const hasApiKey = Boolean(normalizeCodexApiKey(appStore.get(codexApiKeyAtom)))
  const hasSubscription =
    appStore.get(codexOnboardingCompletedAtom) &&
    appStore.get(codexOnboardingAuthMethodAtom) === "chatgpt"

  return {
    hasApiKey,
    hasSubscription,
    hasAny: hasApiKey || hasSubscription,
  }
}

async function resolveCodexCredentialsForAuthError(): Promise<{
  hasApiKey: boolean
  hasSubscription: boolean
  hasAny: boolean
}> {
  const snapshot = getStoredCodexCredentials()

  let hasSubscription = false
  try {
    const integration = await trpcClient.codex.getIntegration.query()
    hasSubscription = integration.state === "connected_chatgpt"
  } catch {
    hasSubscription = false
  }

  return {
    hasApiKey: snapshot.hasApiKey,
    hasSubscription,
    hasAny: snapshot.hasApiKey || hasSubscription,
  }
}

function getSelectedCodexModel(subChatId: string): string {
  const codexModels = appStore.get(codexModelCatalogAtom)
  const selectedModelId = appStore.get(subChatCodexModelIdAtomFamily(subChatId))
  const selectedModel =
    codexModels.find((model) => model.slug === selectedModelId) ||
    getDefaultCodexModel(codexModels)

  if (!selectedModel) {
    return DEFAULT_CODEX_MODEL
  }

  const selectedThinking = appStore.get(subChatCodexThinkingAtomFamily(subChatId))
  const thinking = normalizeCodexThinkingSelection(selectedModel, selectedThinking)

  return `${selectedModel.slug}/${thinking}`
}

export class ACPChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: ACPChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    const lastUser = [...options.messages]
      .reverse()
      .find((message) => message.role === "user")

    const prompt = this.extractText(lastUser)
    const images = this.extractImages(lastUser)

    const lastAssistant = [...options.messages]
      .reverse()
      .find((message) => message.role === "assistant")
    const metadata = lastAssistant?.metadata as AgentMessageMetadata | undefined
    const sessionId = metadata?.sessionId

    const currentMode =
      useAgentSubChatStore
        .getState()
        .allSubChats.find((subChat) => subChat.id === this.config.subChatId)
        ?.mode || this.config.mode
    const forceNewSession = forceFreshSessionSubChats.has(this.config.subChatId)
    if (forceNewSession) {
      forceFreshSessionSubChats.delete(this.config.subChatId)
    }
    const codexApiKey = normalizeCodexApiKey(appStore.get(codexApiKeyAtom))
    const selectedModel = getSelectedCodexModel(this.config.subChatId)

    const subId = this.config.subChatId.slice(-8)

    // Shared refs for cancel() callback
    let activeSub: { unsubscribe: () => void } | null = null
    let activeStaleTimer: ReturnType<typeof setInterval> | null = null

    return new ReadableStream({
      start: (controller) => {
        const runId = crypto.randomUUID()
        let sub: { unsubscribe: () => void } | null = null
        let didUnsubscribe = false
        let forcedUnsubscribeTimer: ReturnType<typeof setTimeout> | null = null
        let streamCancelled = false

        // Stale stream detection + diagnostics (mirrors IPC transport)
        const STALE_TIMEOUT_MS = 60_000
        const streamStartedAt = Date.now()
        let lastChunkAt = Date.now()
        let chunkCount = 0
        let lastChunkType = ""
        const staleTimer = setInterval(() => {
          const gap = Date.now() - lastChunkAt
          const elapsed = ((Date.now() - streamStartedAt) / 1000).toFixed(0)
          if (gap > STALE_TIMEOUT_MS) {
            console.warn(`[SD] R:STALE(codex) sub=${subId} gap=${(gap / 1000).toFixed(0)}s elapsed=${elapsed}s n=${chunkCount} last=${lastChunkType} - closing stream`)
            clearInterval(staleTimer)
            try { controller.close() } catch { /* already closed */ }
          } else if (gap > 15_000) {
            console.log(`[SD] R:QUIET(codex) sub=${subId} gap=${(gap / 1000).toFixed(0)}s elapsed=${elapsed}s n=${chunkCount} last=${lastChunkType}`)
          }
        }, 10_000)
        activeStaleTimer = staleTimer
        console.log(`[SD] R:START(codex) sub=${subId} model=${selectedModel}`)

        const clearForcedUnsubscribeTimer = () => {
          if (!forcedUnsubscribeTimer) return
          clearTimeout(forcedUnsubscribeTimer)
          forcedUnsubscribeTimer = null
        }

        const safeUnsubscribe = () => {
          if (didUnsubscribe) return
          didUnsubscribe = true
          clearForcedUnsubscribeTimer()
          sub?.unsubscribe()
        }

        sub = trpcClient.codex.chat.subscribe(
          {
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            runId,
            prompt,
            cwd: this.config.cwd,
            ...(this.config.projectPath
              ? { projectPath: this.config.projectPath }
              : {}),
            model: selectedModel,
            mode: currentMode,
            ...(sessionId ? { sessionId } : {}),
            ...(forceNewSession ? { forceNewSession: true } : {}),
            ...(images.length > 0 ? { images } : {}),
            ...(codexApiKey
              ? {
                  authConfig: {
                    apiKey: codexApiKey,
                  },
                }
              : {}),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              chunkCount++
              lastChunkType = chunk.type
              lastChunkAt = Date.now()

              if (chunk.type === "session-init") {
                appStore.set(sessionInfoAtom, {
                  tools: chunk.tools || [],
                  mcpServers: chunk.mcpServers || [],
                  plugins: chunk.plugins || [],
                  skills: chunk.skills || [],
                })
              }

              if (chunk.type === "auth-error") {
                forceFreshSessionSubChats.add(this.config.subChatId)

                void (async () => {
                  const credentials = await resolveCodexCredentialsForAuthError()
                  const shouldAutoRetryOnce = credentials.hasAny && !forceNewSession

                  appStore.set(pendingAuthRetryMessageAtom, {
                    subChatId: this.config.subChatId,
                    provider: "codex",
                    prompt,
                    ...(images.length > 0 && { images }),
                    readyToRetry: shouldAutoRetryOnce,
                  })

                  if (!credentials.hasAny) {
                    appStore.set(codexLoginModalOpenAtom, true)
                  } else if (!shouldAutoRetryOnce) {
                    toast.error("Codex authentication failed", {
                      description: credentials.hasApiKey
                        ? "Saved Codex API key was rejected. Update it in Settings."
                        : "Saved Codex subscription auth failed. Reconnect subscription in Settings.",
                    })
                  }
                })()

                void trpcClient.codex.cleanup
                  .mutate({ subChatId: this.config.subChatId })
                  .catch(() => {
                    // No-op
                  })

                // Force stream status reset so retry can start once auth succeeds.
                controller.error(new Error("Codex authentication required"))
                return
              }

              if (chunk.type === "error") {
                toast.error("Codex error", {
                  description: chunk.errorText || "An unexpected Codex error occurred.",
                })
              }

              try {
                if (!streamCancelled) {
                  const normalizedChunk = normalizeCodexStreamChunk(chunk) as UIMessageChunk
                  controller.enqueue(normalizedChunk)
                }
              } catch (e) {
                if (!streamCancelled) {
                  streamCancelled = true
                  console.warn(`[SD] R:CONSUMER_CANCEL(codex) sub=${subId} type=${chunk.type} n=${chunkCount} - unsubscribing`)
                  clearInterval(staleTimer)
                  safeUnsubscribe()
                }
              }

              if (chunk.type === "finish") {
                clearInterval(staleTimer)
                const elapsed = ((Date.now() - streamStartedAt) / 1000).toFixed(1)
                console.log(`[SD] R:FINISH(codex) sub=${subId} n=${chunkCount} t=${elapsed}s`)
                try {
                  controller.close()
                } catch {
                  // Stream already closed
                }
              }
            },
            onError: (error: Error) => {
              clearInterval(staleTimer)
              console.log(`[SD] R:ERROR(codex) sub=${subId} n=${chunkCount} last=${lastChunkType} err=${error.message}`)
              toast.error("Codex request failed", {
                description: error.message,
              })
              controller.error(error)
              safeUnsubscribe()
            },
            onComplete: () => {
              clearInterval(staleTimer)
              const elapsed = ((Date.now() - streamStartedAt) / 1000).toFixed(1)
              console.log(`[SD] R:COMPLETE(codex) sub=${subId} n=${chunkCount} last=${lastChunkType} t=${elapsed}s`)
              try {
                controller.close()
              } catch {
                // Stream already closed
              }
              safeUnsubscribe()
            },
          },
        )
        activeSub = sub

        options.abortSignal?.addEventListener("abort", () => {
          // Start server-side cancellation first so the router still has
          // active run ownership when processing cancel(runId).
          const cancelPromise = trpcClient.codex.cancel
            .mutate({ subChatId: this.config.subChatId, runId })
            .catch(() => {
              // No-op
            })

          // Keep stop UX immediate in the client.
          try {
            controller.close()
          } catch {
            // Stream already closed
          }

          // Keep subscription alive briefly so server-side onFinish can persist
          // interrupted response state before cleanup unsubscribe runs.
          void (async () => {
            try {
              await cancelPromise
            } finally {
              clearForcedUnsubscribeTimer()
              forcedUnsubscribeTimer = setTimeout(() => {
                safeUnsubscribe()
              }, 10000)
            }
          })()
        })
      },
      cancel(reason) {
        console.warn(`[SD] R:STREAM_CANCEL(codex) sub=${subId} reason=${reason}`)
        if (activeStaleTimer) clearInterval(activeStaleTimer)
        activeSub?.unsubscribe()
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }

  cleanup(): void {
    void trpcClient.codex.cleanup
      .mutate({ subChatId: this.config.subChatId })
      .catch(() => {
        // No-op
      })
  }

  private extractText(message: UIMessage | undefined): string {
    if (!message) return ""

    if (!message.parts) return ""

    const textParts: string[] = []
    const fileContents: string[] = []

    for (const part of message.parts) {
      if (part.type === "text" && (part as any).text) {
        textParts.push((part as any).text)
      } else if ((part as any).type === "file-content") {
        const filePart = part as any
        const fileName =
          filePart.filePath?.split("/").pop() || filePart.filePath || "file"
        fileContents.push(`\n--- ${fileName} ---\n${filePart.content}`)
      }
    }

    return textParts.join("\n") + fileContents.join("")
  }

  private extractImages(message: UIMessage | undefined): ImageAttachment[] {
    if (!message?.parts) return []

    const images: ImageAttachment[] = []

    for (const part of message.parts) {
      if (part.type === "data-image" && (part as any).data) {
        const data = (part as any).data
        if (data.base64Data && data.mediaType) {
          images.push({
            base64Data: data.base64Data,
            mediaType: data.mediaType,
            filename: data.filename,
          })
        }
      }
    }

    return images
  }
}
