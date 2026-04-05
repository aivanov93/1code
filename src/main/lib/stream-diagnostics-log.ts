import log from "electron-log"

export type StreamDiagnosticLevel = "info" | "warn" | "error"

export function writeStreamDiagnostic(
  level: StreamDiagnosticLevel,
  message: string,
): void {
  if (level === "warn") {
    log.warn(message)
    return
  }
  if (level === "error") {
    log.error(message)
    return
  }
  log.info(message)
}

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
  writeStreamDiagnostic(level, message)
}
