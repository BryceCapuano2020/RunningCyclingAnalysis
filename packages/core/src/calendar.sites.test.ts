import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants'
import { fitnessTrend } from './digest/trend'
import { plantedLibrary } from './test/plantedLibrary'
import type { ActivityDigest } from './types'

/**
 * The sites that cut a library into weeks. Each is given an activity whose local day is not its UTC day, and must
 * put it in the week of its local day; with every shift 0 each must give exactly the figures of UTC weeks.
 */
const library = plantedLibrary({
  seed: 4,
  weeks: 20,
  perWeek: 4,
  noise: 0.02,
  sports: ['run', 'ride'],
  effects: [],
})
const SETTINGS = { massKg: 70, bikeMassKg: 9 }

/** Sunday 15 March 2026 20:00 UTC: Monday 16 March in any zone from +4 h. */
const SUNDAY_EVENING = Date.UTC(2026, 2, 15, 20)
const SUNDAY_END = Date.UTC(2026, 2, 16) - 1

const withShift = (digest: ActivityDigest, localDayShift: -1 | 0 | 1): ActivityDigest => ({
  ...digest,
  localDayShift,
})
const allShifted = (shift: -1 | 0 | 1) => library.digests.map((d) => withShift(d, shift))

describe('with every shift 0, the figures are those of UTC weeks', () => {
  it('for the weekly trend', () => {
    const utc = fitnessTrend(library.digests, SETTINGS)
    expect(fitnessTrend(allShifted(0), SETTINGS).map((p) => p.endMs)).toEqual(
      utc.map((p) => p.endMs),
    )
  })
})

describe('an activity whose local day is the next', () => {
  it('ends the weekly trend a week later', () => {
    const last = library.digests.at(-1)!
    const sundayEnd = SUNDAY_END + 10 * 7 * DAY_MS
    const lateRun = (shift: -1 | 0 | 1): ActivityDigest[] => [
      ...library.digests.slice(0, -1),
      { ...last, startMs: SUNDAY_EVENING + 10 * 7 * DAY_MS, localDayShift: shift },
    ]
    expect(fitnessTrend(lateRun(0), SETTINGS).at(-1)!.endMs).toBe(sundayEnd)
    expect(fitnessTrend(lateRun(1), SETTINGS).at(-1)!.endMs).toBe(sundayEnd + 7 * DAY_MS)
  })
})
