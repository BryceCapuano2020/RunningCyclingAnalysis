import { FITNESS } from '../params'

/**
 * The parameters as they stood before D2 (main at 40b3a4be): no closing rule, no confirming week, no check against the
 * year before, no seasonal term, and the plain 1% model-error floor. The sims run both, so that a budget can say how far
 * the change moved it and fail if it moves back.
 */
export const LEGACY = {
  monitor: {
    minRecentWeeks: 1,
    confirmShare: Number.NEGATIVE_INFINITY,
    yoyShare: Number.POSITIVE_INFINITY,
    floorGain: 0,
  },
  episode: {
    closeWeeks: Number.POSITIVE_INFINITY,
    closeRecoveringWeeks: Number.POSITIVE_INFINITY,
  },
  season: { minYears: Number.POSITIVE_INFINITY },
} as const

type Overrides = { [S in keyof typeof FITNESS]?: Partial<Record<string, number>> }

/** Runs `fn` with some parameters changed, and puts them back (the sims are single-threaded within a file). */
export function withParams<T>(overrides: Overrides, fn: () => T): T {
  const table = FITNESS as unknown as Record<string, Record<string, number>>
  const saved: [string, string, number][] = []
  for (const [section, values] of Object.entries(overrides)) {
    for (const [key, value] of Object.entries(values as Record<string, number>)) {
      saved.push([section, key, table[section]![key]!])
      table[section]![key] = value
    }
  }
  try {
    return fn()
  } finally {
    for (const [section, key, value] of saved) table[section]![key] = value
  }
}
