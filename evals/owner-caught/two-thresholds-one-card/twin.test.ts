import { describe, expect, it } from 'vitest'
import { gradeAtSpeed } from '@rca/core/grade'
import { equivalentRunSpeed } from '@rca/core/pipeline'
import { formatPaceValue } from '@rca/core/units'
import { threshold } from '../../../apps/web/src/ui/records'
import { standingOf } from '../../../apps/web/src/ui/standing'
import { thresholdLine } from '../../../apps/web/src/ui/thresholdLine'
import { END_MS, PROFILE, SETTINGS, flat, library, resultOf, seconds, sessionOf } from '../support'

const UNITS = 'metric'
const MASS = SETTINGS.massKg
const HOUR_S = 3600
const KM = 1000

/** The same athlete throughout, so a period's threshold and the half year the zones are cut from are one figure. */
const session = sessionOf(
  library({ years: 3, everyDays: 14, scale: { run: flat(1), ride: flat(1) } }),
)
const zoneReference = (sport: 'run' | 'ride', measure: 'pace' | 'power') =>
  session.zonesAt(END_MS, SETTINGS).find((zone) => zone.sport === sport && zone.measure === measure)
    ?.reference

describe.each(['default', 'all'] as const)('the thresholds over %s', (choice) => {
  const result = resultOf(session, choice)
  const standing = standingOf(result, PROFILE, { massKg: MASS, units: UNITS })

  it('prints one run threshold on the card, the curve line, the zones and the grade basis', () => {
    const card = seconds(threshold(result, 'run', MASS, UNITS)!.number)
    // Whole seconds are what the card prints, so each surface agrees to the second.
    const line = thresholdLine(result, 'run', MASS, UNITS)!.value
    expect(Math.abs(KM / line - card)).toBeLessThanOrEqual(1)
    const zones = zoneReference('run', 'pace')!
    expect(Math.abs(KM / zones - card)).toBeLessThanOrEqual(1)
    // The grade is the grade of the printed pace, as an hour, at the age it was set.
    const grade = standing.grades.run
    if (grade.kind !== 'graded') throw new Error('the run is graded')
    const who = { age: grade.age, sex: PROFILE.sex }
    const ofCard = gradeAtSpeed(KM / card, HOUR_S, who)!.grade
    expect(Math.abs(grade.grade.centre.grade - ofCard)).toBeLessThan(0.005)
  })

  it('prints one ride threshold on the card, the curve line, the zones, the grade basis and the ride as a run', () => {
    const watts = Number(threshold(result, 'ride', MASS, UNITS)!.number)
    expect(Math.abs(thresholdLine(result, 'ride', MASS, UNITS)!.value - watts)).toBeLessThanOrEqual(
      0.5,
    )
    expect(Math.abs(zoneReference('ride', 'power')! - watts)).toBeLessThanOrEqual(1)
    // The ride as a run is the run the printed watts are worth, to the second of pace.
    const asRun = standing.rideAsRun!.p50
    const ofWatts = equivalentRunSpeed(watts, MASS, PROFILE.sex).p50
    const printed = (speed: number) => seconds(formatPaceValue(speed, UNITS))
    expect(Math.abs(printed(asRun) - printed(ofWatts))).toBeLessThanOrEqual(2)
    // And the ride's grade is the grade of that run, as an hour.
    const grade = standing.grades.ride
    if (grade.kind !== 'graded') throw new Error('the ride is graded')
    const ofRun = gradeAtSpeed(ofWatts, HOUR_S, { age: grade.age, sex: PROFILE.sex })!.grade
    expect(Math.abs(grade.grade.centre.grade - ofRun)).toBeLessThan(0.005)
  })
})
