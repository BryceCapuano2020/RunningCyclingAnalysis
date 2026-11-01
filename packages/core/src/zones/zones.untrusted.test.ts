import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { judgeHeartRate } from '../digest/setAside'
import { weeklyRuns } from '../digest/test/runLibrary'
import type { AthleteSettings } from '../types'
import { estimatesOf } from './test/estimates'
import { missingThresholdZones } from './missingZones'
import { zoneEstimatesOf, zonesAt } from './zones'
import type { ZoneEstimates } from './zones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const AT = new Date(2025, 0, 15, 12).getTime()
const FIGURES = {
  runCp: null,
  rideCp: null,
  runMaxHeartRate: 190,
  rideMaxHeartRate: null,
  runObservedMaxHeartRate: 190,
  rideObservedMaxHeartRate: null,
}

const heartRateSets = (estimates: ZoneEstimates, settings = SETTINGS) =>
  zonesAt(AT, settings, estimates).filter((set) => set.measure === 'heartRate')

describe('heart-rate zones when no effort reached near the maximum', () => {
  const trusted = estimatesOf(FIGURES)
  const withReading = (reading: 'low' | 'habitual' | 'high'): ZoneEstimates => ({
    ...trusted,
    untrustedMax: { run: reading },
  })

  it('cuts zones from a maximum that can be one', () => {
    expect(heartRateSets(trusted).map((set) => set.sport)).toEqual(['run'])
  })

  it('cuts them from the highest heart rate on file where no effort reached near a maximum, and marks it', () => {
    for (const reading of ['low', 'habitual'] as const) {
      const sets = heartRateSets(withReading(reading))
      expect(sets).toHaveLength(1)
      expect(sets[0]).toMatchObject({ source: 'estimated', reference: 190, fromHighest: true })
    }
    expect(heartRateSets(trusted)[0]!.fromHighest).toBe(false)
  })

  it('has none missing for want of a maximum', () => {
    expect(missingThresholdZones(AT, SETTINGS, withReading('habitual'))).toEqual([])
    expect(missingThresholdZones(AT, SETTINGS, trusted)).toEqual([])
  })

  it('keeps the zones of a maximum far over the age, which the page asks about instead', () => {
    expect(heartRateSets(withReading('high'))).toHaveLength(1)
    expect(missingThresholdZones(AT, SETTINGS, withReading('high'))).toEqual([])
  })

  it('lets a maximum the athlete entered win, whatever the activities read', () => {
    const entered: Measurement = {
      kind: 'maxHeartRate',
      sport: 'run',
      value: 185,
      from: '2024-01-01',
    }
    const settings = { ...SETTINGS, measurements: [entered] }
    const sets = heartRateSets(withReading('habitual'), settings)
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({ source: 'entered', reference: 185, fromHighest: false })
    expect(missingThresholdZones(AT, settings, withReading('habitual'))).toEqual([])
  })

  it('adds the field only when a sport has one, so a library that reads trusted keeps its estimates as they were', () => {
    const judged = judgeHeartRate(
      weeklyRuns(0, 30, () => 1),
      SETTINGS,
    )
    expect(Object.keys(zoneEstimatesOf(judged, AT))).not.toContain('untrustedMax')
    const habitual = {
      ...judged,
      effortReference: {
        ...judged.effortReference,
        reading: { run: 'habitual' as const, ride: null },
      },
    }
    expect(zoneEstimatesOf(habitual, AT).untrustedMax).toEqual({ run: 'habitual' })
  })
})
