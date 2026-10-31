import type { ActivityDigest } from './types'

/** Whether two lists hold the same digest objects in the same order. */
export function sameDigests(a: ActivityDigest[], b: ActivityDigest[]): boolean {
  return a.length === b.length && a.every((digest, i) => digest === b[i])
}
