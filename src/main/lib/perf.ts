const PERF_DEBUG_ENABLED = process.env.ONECODE_DEBUG_PERF === "true"

export function makePerfLogger(scope: string): (label: string) => void {
  const start = Date.now()
  let last = start

  return (label: string) => {
    if (!PERF_DEBUG_ENABLED) return
    const now = Date.now()
    console.log(`[perf:${scope}] +${now - last}ms (${now - start}ms total) ${label}`)
    last = now
  }
}
