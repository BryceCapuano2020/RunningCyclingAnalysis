import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Activity } from '../types'

/*
 * Shared by the corpus tests. Node-only: the corpus is read from disk (see tsconfig.corpus.json).
 */

/** Reads files from one corpus directory, given as a URL relative to the test file. */
export function corpusReader(dir: URL): {
  bytes: (name: string) => Uint8Array
  text: (name: string) => string
} {
  const path = (name: string): string => fileURLToPath(new URL(name, dir))
  return {
    bytes: (name) => new Uint8Array(readFileSync(path(name))),
    text: (name) => readFileSync(path(name), 'utf8'),
  }
}

/** Whether an activity is well formed: at least a minute, and a finite, non-decreasing distance. */
export function isSaneActivity(a: Activity): boolean {
  if (a.n < 60 || a.distance.length !== a.n) return false
  for (let i = 0; i < a.n; i++) {
    if (!Number.isFinite(a.distance[i]!)) return false
    if (i > 0 && a.distance[i]! < a.distance[i - 1]!) return false
  }
  return true
}

/** A small deterministic generator, so byte mutations are the same on every run. */
export function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x80000000
  }
}

/** The file cut at five fixed shares, then twelve seeded copies with four bytes changed. */
export function mutations(bytes: Uint8Array, seed: number): Uint8Array[] {
  const out: Uint8Array[] = []
  for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    out.push(bytes.slice(0, Math.floor(bytes.length * fraction)))
  }
  const random = lcg(seed)
  for (let k = 0; k < 12; k++) {
    const copy = bytes.slice()
    for (let f = 0; f < 4; f++) {
      copy[Math.floor(random() * copy.length)] = Math.floor(random() * 256)
    }
    out.push(copy)
  }
  return out
}
