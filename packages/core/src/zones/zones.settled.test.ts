import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { judgeHeartRate } from '../digest/setAside'
import { FIRST_MONDAY_MS, weeklyRuns } from '../digest/test/runLibrary'
import type { AthleteSettings } from '../types'
import { weekEndFor } from '../calendar'
import { floorAt } from '../digest/thresholdFloor'
import { missingThresholdZones } from './missingZones'
import { zoneEstimatesOf, zonesAt } from './zones'

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

  it('are cut from the best of the year up to their week, dated, once the library fit is refused', () => {
    const refused = { ...judged, fit: { run: null, ride: null } }
    expect(refused.thresholdTimeline.run.some((step) => step.fit !== null)).toBe(true)
    const [set] = paceSets(refused)
    const floor = floorAt(judged.floor.run, weekEndFor({ startMs: AT }), false)!
    expect(set).toMatchObject({
      source: 'estimated',
      floorS: floor.durationS,
      asOfMs: floor.asOfMs,
    })
    // The runs after that week are not in it: the efforts of the whole library reach further.
    expect(floor.asOfMs).toBeLessThanOrEqual(weekEndFor({ startMs: AT }))
    expect(set!.reference).not.toBe(paceSets(judged)[0]!.reference)
    expect(missingThresholdZones(AT, SETTINGS, zoneEstimatesOf(refused, NOW))).toEqual([])
  })

  it('have none where the library holds no effort of 20 minutes to stand as a floor', () => {
    const refused = { ...judged, fit: { run: null, ride: null }, floor: { run: [], ride: [] } }
    expect(paceSets(refused)).toHaveLength(0)
    expect(missingThresholdZones(AT, SETTINGS, zoneEstimatesOf(refused, NOW))).toEqual([
      { sport: 'run', measure: 'pace', outgrown: false },
    ])
  })
})
