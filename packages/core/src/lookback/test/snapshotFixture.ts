import { DAY_MS } from '../../constants'
import type { Sport } from '../../types'
import { encodeSeconds } from '../snapshot'
import type { CheckInSnapshot, SnapshotBest } from '../snapshot'

/** Synthetic dates and values only. */
export const NOW = Date.UTC(2026, 5, 1, 9, 30)
export const second = (ms: number) => Math.round(ms / 1000)

/** A snapshot whose workouts start at the given times (ms), per sport; every other part is empty unless given. */
export function snap(
  starts: Partial<Record<Sport, number[]>>,
  rest: Partial<CheckInSnapshot> = {},
): CheckInSnapshot {
  const seconds = (s: Sport) => [...new Set((starts[s] ?? []).map(second))].sort((a, b) => a - b)
  const asOfMs = Math.max(0, ...Object.values(starts).flat())
  return {
    v: 1,
    revision: 7,
    atMs: NOW,
    asOfMs,
    keys: { run: encodeSeconds(seconds('run')), ride: encodeSeconds(seconds('ride')) },
    counts: { run: seconds('run').length, ride: seconds('ride').length },
    bests: { run: [], ride: [] },
    fitness: { run: null, ride: null },
    episodes: { run: [], ride: [] },
    ...rest,
  }
}

/** Days before NOW, as a start time. */
export const ago = (days: number) => NOW - days * DAY_MS

/** A run best at 20 minutes of the given speed (m/s), set by the workout starting at `startMs`. */
export const runBest = (value: number, startMs: number, durationS = 1200): SnapshotBest => ({
  effort: { kind: 'duration', durationS },
  unit: 'm/s',
  value,
  atMs: startMs,
  key: `run-${second(startMs)}`,
})
