export type StreamDiagnosticLevel = "info" | "warn" | "error"

export function logStreamDiagnostic(
  level: StreamDiagnosticLevel,
  message: string,
): void {
  if (level === "warn") {
    console.warn(message)
  } else if (level === "error") {
    console.error(message)
  } else {
    console.log(message)
  }

  if (typeof window !== "undefined") {
    window.desktopApi?.appLog?.(level, message)
  }
}
