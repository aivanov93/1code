import { execFileSync } from "node:child_process"
import { accessSync, constants, existsSync } from "node:fs"
import path from "node:path"

type ResolveCliExecutableOptions = {
  command: string
  label: string
  env?: Record<string, string>
  overrideEnvKeys?: string[]
  missingMessage: string
}

function mergeExecutionEnv(
  env?: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {}

  for (const source of [process.env, env]) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "string") merged[key] = value
    }
  }

  return merged
}

function resolveCommandOnPath(
  command: string,
  env: Record<string, string>,
  options: Pick<ResolveCliExecutableOptions, "label" | "missingMessage">,
): string {
  const lookupCommand = process.platform === "win32" ? "where" : "which"

  try {
    const stdout = execFileSync(lookupCommand, [command], {
      encoding: "utf8",
      env,
    })
    const resolvedPath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)

    if (resolvedPath) return resolvedPath
  } catch {
    // Fall through to the shared error below.
  }

  throw new Error(`[${options.label}] ${options.missingMessage}`)
}

function ensureExecutablePath(candidate: string, label: string): string {
  if (!path.isAbsolute(candidate)) {
    throw new Error(
      `[${label}] Executable override must be an absolute path: ${candidate}`,
    )
  }
  if (!existsSync(candidate)) {
    throw new Error(`[${label}] Executable override does not exist: ${candidate}`)
  }
  if (process.platform !== "win32") {
    accessSync(candidate, constants.X_OK)
  }
  return candidate
}

export function resolveCliExecutable(
  options: ResolveCliExecutableOptions,
): string {
  const env = mergeExecutionEnv(options.env)
  const overrideKey = options.overrideEnvKeys?.find((key) => env[key]?.trim())
  const overrideValue = overrideKey ? env[overrideKey]!.trim() : null

  const resolvedPath = overrideValue
    ? overrideValue.includes("/") || overrideValue.includes("\\")
      ? ensureExecutablePath(overrideValue, options.label)
      : resolveCommandOnPath(overrideValue, env, options)
    : resolveCommandOnPath(options.command, env, options)

  console.log(
    `[${options.label}] Using executable: ${resolvedPath}${overrideKey ? ` (${overrideKey})` : " (PATH)"}`,
  )
  return resolvedPath
}
