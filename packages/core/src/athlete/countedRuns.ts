import type { AthleteSettings } from './settings'

/** Whether two settings count the same runs at walking pace. The order of the keys does not matter. */
export function sameCountedRuns(a: AthleteSettings, b: AthleteSettings): boolean {
  const [left, right] = [a.countedRuns ?? [], b.countedRuns ?? []]
  if (left.length !== right.length) return false
  const held = new Set(left)
  return right.every((key) => held.has(key))
}
