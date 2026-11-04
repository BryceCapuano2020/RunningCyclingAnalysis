import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { judgeHeartRate } from '../digest/setAside'
import { FIRST_MONDAY_MS, weeklyRuns } from '../digest/test/runLibrary'
import type { AthleteSettings } from '../types'
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
  /** The same library with no window holding a fit, as when its efforts are too few for any. */
  const noWindowFits = {
    ...judged,
    thresholdTimeline: {
      ...judged.thresholdTimeline,
      run: judged.thresholdTimeline.run.map((step) => ({ ...step, fit: null, lastFit: -1 })),
    },
  }

  it('are cut from a window while the library has a fit', () => {
    expect(judged.fit.run).not.toBeNull()
    expect(paceSets(judged)).toHaveLength(1)
  })

  it('are cut from the window all the same once the library fit is refused: it blanks no window', () => {
    const refused = { ...judged, fit: { run: null, ride: null } }
    expect(refused.thresholdTimeline.run.some((step) => step.fit !== null)).toBe(true)
    const [set] = paceSets(refused)
    expect(set).toMatchObject({ source: 'estimated', asOfMs: null })
    expect(set!.reference).toBe(paceSets(judged)[0]!.reference)
    expect(missingThresholdZones(AT, SETTINGS, zoneEstimatesOf(refused, NOW))).toEqual([])
  })

  it('have none where no window has a fit, however many efforts the library holds: a best is no threshold', () => {
    expect(judged.thresholdTimeline.run.length).toBeGreaterThan(0)
    expect(paceSets(noWindowFits)).toHaveLength(0)
    expect(missingThresholdZones(AT, SETTINGS, zoneEstimatesOf(noWindowFits, NOW))).toEqual([
      { sport: 'run', measure: 'pace' },
    ])
  })
})
