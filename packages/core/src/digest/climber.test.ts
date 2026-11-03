import { describe, expect, it } from 'vitest'
import { DAY_MS, PRIORS } from '../constants'
import { criticalPowerOutcome, wPrimeFloor } from '../cp'
import { zoneEstimatesOf, zonesAt } from '../zones'
import type { ActivityDigest, AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { judgeHeartRate } from './setAside'
import { syntheticActivity } from './test/syntheticActivity'

/*
 * A synthetic climber: hard 10 minute efforts on climbs, and long rides at tempo whose 20 and 30 minute bests are about 14% under
 * the threshold, held at a heart rate under 90% of the maximum. The old rule held the threshold back for those 20 minutes and
 * showed "at least <best 30 minutes>"; the estimate reads the climbs.
 */

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const THRESHOLD_W = 280
const MAX_HR = 190
const EFFICIENCY = PRIORS.grossEfficiency.mean
/** The threshold in the analysis's unit, gross metabolic W/kg. */
const TRUE_WKG = THRESHOLD_W / (EFFICIENCY * SETTINGS.massKg)
const TEMPO_W = 0.86 * THRESHOLD_W
const FIRST_MS = Date.UTC(2024, 2, 4, 7)

/** Heart rate follows power on a line through 90% of the maximum at the threshold, 0.4 bpm per watt. */
const heartRateAt = (watts: number) => Math.min(MAX_HR, 0.9 * MAX_HR + 0.4 * (watts - THRESHOLD_W))

/** An hour: `hardW` for `hardS` seconds, then 150 W. */
function ride(id: string, day: number, hardW: number, hardS: number): ActivityDigest {
  const n = 3600
  const power = Float64Array.from({ length: n }, (_, i) => (i < hardS ? hardW : 150))
  return digestActivity(
    syntheticActivity({
      id,
      sport: 'ride',
      n,
      startMs: FIRST_MS + day * DAY_MS,
      speed: new Float64Array(n).fill(8),
      heartRate: Float64Array.from(power, heartRateAt),
      power,
    }),
  )
}

// A climb 10 minutes at the 10 minute all-out power (1.091 of the threshold), and a tempo ride of 30 minutes, every few days.
const CLIMB_W = THRESHOLD_W * (1.015 + 0.76 / 10)
const library = Array.from({ length: 12 }, (_, i) =>
  i % 2 === 0 ? ride(`climb-${i}`, i * 3, CLIMB_W, 600) : ride(`tempo-${i}`, i * 3, TEMPO_W, 1800),
)
const REFERENCE = { run: null, ride: MAX_HR }
const GIVEN = {
  heartRateSetAside: new Set<string>(),
  references: {
    referenceHr: REFERENCE,
    observedMaxHr: REFERENCE,
    effortReference: {
      referenceHr: REFERENCE,
      reading: { run: null, ride: 'trusted' },
      source: { run: null, ride: 'data' },
      from: { run: null, ride: null },
    },
  },
} as const

describe('a climber whose 20 and 30 minute bests are tempo', () => {
  const result = combine(library, SETTINGS, GIVEN)
  const best30Wkg = TEMPO_W / (EFFICIENCY * SETTINGS.massKg)

  it('has a best 20 minutes the gate calls not hard, as a label', () => {
    expect(result.effortGate.ride.verdict).toBe('notHard')
    expect(result.effortGate.ride.share).toBeLessThan(0.9)
  })

  it('keeps the critical-power fit the curve chart draws: the gate withholds nothing', () => {
    const outcome = criticalPowerOutcome(result.rideMetabolicCurve, {
      minWPrime: wPrimeFloor('ride', SETTINGS.massKg),
    })
    // Whatever the curve's own rules say, and nothing the gate adds: a refusal is for the curve's shape, never for the effort.
    expect(result.rideCp).toEqual(outcome.fit)
    expect(result.rideCpRefusal).toEqual(outcome.refusal)
  })

  it('has a ride threshold near its true value, not its best 30 minutes', () => {
    const estimate = result.rideThreshold!
    expect(Math.abs(estimate.value / TRUE_WKG - 1)).toBeLessThan(0.05)
    expect(estimate.value).toBeGreaterThan(1.1 * best30Wkg)
    expect(estimate.low).toBeLessThan(estimate.value)
    expect(estimate.high).toBeGreaterThan(estimate.value)
    // The climbs carry it; the tempo rides are not what it is built from.
    expect(estimate.efforts.strongest.activityId).toMatch(/^climb-/)
    expect(estimate.efforts.strongest.durationS).toBe(600)
  })

  it('cuts the ride power zones from the estimate, not from the best 30 minutes', () => {
    const judged = judgeHeartRate(library, SETTINGS)
    const now = FIRST_MS + 12 * 3 * DAY_MS
    const [set] = zonesAt(now, SETTINGS, zoneEstimatesOf(judged, now)).filter(
      (each) => each.sport === 'ride' && each.measure === 'power',
    )
    expect(set).toMatchObject({ source: 'estimated', floorS: null })
    expect(Math.abs(set!.reference / THRESHOLD_W - 1)).toBeLessThan(0.06)
    expect(set!.reference).toBeGreaterThan(1.1 * TEMPO_W)
  })
})
