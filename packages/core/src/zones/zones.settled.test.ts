import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { judgeHeartRate } from '../digest/setAside'
import { FIRST_MONDAY_MS, weeklyRuns } from '../digest/test/runLibrary'
import type { AthleteSettings } from '../types'
import { missingThresholdZones, zoneEstimatesOf, zonesAt } from './zones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const AT = FIRST_MONDAY_MS + 25 * 7 * DAY_MS
const NOW = AT + 400 * DAY_MS

describe('the zones of a library whose own threshold is refused', () => {
  const judged = judgeHeartRate(
    weeklyRuns(0, 30, () => 1),
    SETTINGS,
  )
  const paceSets = (judgement: typeof judged) =>
    zonesAt(AT, SETTINGS, zoneEstimatesOf(judgement, NOW)).filter(
      (set) => set.sport === 'run' && set.measure === 'pace',
    )

  it('are cut from a window while the library has a fit', () => {
    expect(judged.fit.run).not.toBeNull()
    expect(paceSets(judged)).toHaveLength(1)
  })

  it('are not cut from a window once the library fit is refused, and the page says what would give them', () => {
    const refused = { ...judged, fit: { run: null, ride: null } }
    expect(refused.thresholdTimeline.run.some((step) => step.fit !== null)).toBe(true)
    expect(paceSets(refused)).toHaveLength(0)
    expect(missingThresholdZones(AT, SETTINGS, zoneEstimatesOf(refused, NOW))).toEqual([
      { sport: 'run', measure: 'pace', outgrown: false },
    ])
  })
})
