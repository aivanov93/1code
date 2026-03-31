// Simple fractional indexing for manual ordering.
// Generates a string that sorts between two given strings lexicographically.
// Uses base-62 (0-9, A-Z, a-z) for compact keys.

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const BASE = CHARS.length

/** Generate a key that sorts between `a` and `b`. Both can be empty. */
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a === null && b === null) return "a0"
  if (a === null) return midpoint("", b!)
  if (b === null) return increment(a)
  if (a >= b) throw new Error(`Invalid order: "${a}" >= "${b}"`)
  return midpoint(a, b)
}

function midpoint(a: string, b: string): string {
  // Pad shorter string with min char for comparison
  const maxLen = Math.max(a.length, b.length)
  const padA = a.padEnd(maxLen, CHARS[0]!)
  const padB = b.padEnd(maxLen, CHARS[0]!)

  // Find first differing position
  let i = 0
  while (i < maxLen && padA[i] === padB[i]) i++

  const aIdx = i < a.length ? CHARS.indexOf(a[i]!) : 0
  const bIdx = i < b.length ? CHARS.indexOf(b[i]!) : BASE

  if (bIdx - aIdx > 1) {
    // Room between the two chars at position i
    const mid = Math.floor((aIdx + bIdx) / 2)
    return padA.slice(0, i) + CHARS[mid]
  }

  // No room, append a middle char after position i
  return a + CHARS[Math.floor(BASE / 2)]
}

function increment(a: string): string {
  const lastIdx = CHARS.indexOf(a[a.length - 1]!)
  if (lastIdx < BASE - 1) {
    return a.slice(0, -1) + CHARS[lastIdx + 1]
  }
  // Last char is max, append middle
  return a + CHARS[Math.floor(BASE / 2)]
}

/** Generate N keys evenly spaced after `start` (or from beginning if null). */
export function generateNKeys(n: number, start: string | null = null): string[] {
  const keys: string[] = []
  let prev = start
  for (let i = 0; i < n; i++) {
    prev = generateKeyBetween(prev, null)
    keys.push(prev)
  }
  return keys
}
