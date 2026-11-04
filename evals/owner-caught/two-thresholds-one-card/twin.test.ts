import { describe, expect, it } from 'vitest'
import { gradeAtSpeed } from '@rca/core/grade'
import { flatSpeedOfWkg, ridePowerAt } from '@rca/core/display'
import { equivalentRunSpeed } from '@rca/core/pipeline'
import { formatPaceValue } from '@rca/core/units'
import { threshold } from '../../../apps/web/src/ui/records'
import { standingOf } from '../../../apps/web/src/ui/standing'
import { thresholdLine } from '../../../apps/web/src/ui/thresholdLine'
import {
  DAY_MS,
  END_MS,
  PROFILE,
  SETTINGS,
  drift,
  flat,
  library,
  resultOf,
  seconds,
  sessionOf,
} from '../support'

const UNITS = 'metric'
const MASS = SETTINGS.massKg
const HOUR_S = 3600
const KM = 1000
/** Half of a printed unit: a figure printed to the second or the watt is within this of the value it was printed from. */
const HALF_SECOND = 0.5
const HALF_WATT = 0.5
/** Two surfaces that read one value agree to the last digit of a float. */
const SAME = 1e-9

/**
 * An athlete who gains through the years, so the default period, All time and an old effort give three figures: a surface that
 * reads another period's result than the card does shows here.
 */
const YEARS = 3
const gaining = sessionOf(
  library({
    years: YEARS,
    everyDays: 14,
    scale: { run: drift(0.9, 1, YEARS), ride: drift(0.85, 1, YEARS) },
  }),
)
/**
 * The zones are cut from the settled half year ending at the last week, which for a gaining athlete lags the period's figure
 * by design (`settledThresholds`), so they are held to the card for an athlete whose half year and period are one figure.
 */
const steady = sessionOf(
  library({ years: YEARS, everyDays: 14, scale: { run: flat(1), ride: flat(1) } }),
)
const zonesOf = (session: typeof steady, sport: 'run' | 'ride', measure: 'pace' | 'power') =>
  session
    .zonesAt(END_MS, SETTINGS)
    .find((zone) => zone.sport === sport && zone.measure === measure)!
const zoneReference = (sport: 'run' | 'ride', measure: 'pace' | 'power') =>
  steady.zonesAt(END_MS, SETTINGS).find((zone) => zone.sport === sport && zone.measure === measure)
    ?.reference

describe.each(['default', 'all'] as const)('the thresholds over %s', (choice) => {
  const result = resultOf(gaining, choice)
  const standing = standingOf(result, PROFILE, { massKg: MASS, units: UNITS })

  it('prints one run threshold on the card, the curve line and the grade basis', () => {
    const card = seconds(threshold(result, 'run', MASS, UNITS)!.number)
    const speed = flatSpeedOfWkg(result.runThreshold!.value)
    // The card is the value printed to the second, and the curve line and the zones hold the same value.
    expect(Math.abs(KM / speed - card)).toBeLessThanOrEqual(HALF_SECOND)
    expect(thresholdLine(result, 'run', MASS, UNITS)!.value).toBeCloseTo(speed, 9)
    // The grade is the grade of that value, as an hour, at the age it was set.
    const grade = standing.grades.run
    if (grade.kind !== 'graded') throw new Error('the run is graded')
    const ofSpeed = gradeAtSpeed(speed, HOUR_S, { age: grade.age, sex: PROFILE.sex })!.grade
    expect(Math.abs(grade.grade.centre.grade - ofSpeed)).toBeLessThan(SAME)
  })

  it('prints one ride threshold on the card, the curve line, the grade basis and the ride as a run', () => {
    const card = Number(threshold(result, 'ride', MASS, UNITS)!.number)
    const watts = ridePowerAt(result.rideThreshold!.value, MASS).watts
    expect(Math.abs(watts - card)).toBeLessThanOrEqual(HALF_WATT)
    expect(thresholdLine(result, 'ride', MASS, UNITS)!.value).toBeCloseTo(watts, 9)
    // The ride as a run is the run those watts are worth, and prints as the same pace.
    const asRun = standing.rideAsRun!.p50
    const ofWatts = equivalentRunSpeed(watts, MASS, PROFILE.sex).p50
    expect(Math.abs(asRun - ofWatts)).toBeLessThan(SAME)
    expect(formatPaceValue(asRun, UNITS)).toBe(formatPaceValue(ofWatts, UNITS))
    // And the ride's grade is the grade of that run, as an hour.
    const grade = standing.grades.ride
    if (grade.kind !== 'graded') throw new Error('the ride is graded')
    const ofRun = gradeAtSpeed(ofWatts, HOUR_S, { age: grade.age, sex: PROFILE.sex })!.grade
    expect(Math.abs(grade.grade.centre.grade - ofRun)).toBeLessThan(SAME)
  })
})

describe('the zones', () => {
  it.each(['default', 'all'] as const)(
    'are cut from the threshold the card prints, over %s',
    (choice) => {
      const result = resultOf(steady, choice)
      const run = seconds(threshold(result, 'run', MASS, UNITS)!.number)
      const ride = Number(threshold(result, 'ride', MASS, UNITS)!.number)
      expect(Math.abs(KM / zoneReference('run', 'pace')! - run)).toBeLessThanOrEqual(HALF_SECOND)
      expect(Math.abs(zoneReference('ride', 'power')! - ride)).toBeLessThanOrEqual(HALF_WATT)
    },
  )
})

describe('the zones of a gaining athlete', () => {
  const WINDOW_MS = 26 * 7 * DAY_MS
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  it.each(['run', 'ride'] as const)(
    'are the %s threshold over the half year the zone line names',
    (sport) => {
      const measure = { run: 'pace', ride: 'power' }[sport] as 'pace' | 'power'
      const zone = zonesOf(gaining, sport, measure)
      const end = zone.windowEndMs!
      const result = resultOf(gaining, { from: day(end - WINDOW_MS), to: day(end) })
      const card = threshold(result, sport, MASS, UNITS)!.number
      const printed = { run: () => KM / zone.reference, ride: () => zone.reference }[sport]()
      const expected = { run: () => seconds(card), ride: () => Number(card) }[sport]()
      const half = { run: HALF_SECOND, ride: HALF_WATT }[sport]
      expect(Math.abs(printed - expected)).toBeLessThanOrEqual(half)
    },
  )
})
