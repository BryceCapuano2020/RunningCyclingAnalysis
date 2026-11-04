import { describe, expect, it } from 'vitest'
import { PRIORS } from '@rca/core/constants'
import { HOUR_S } from '@rca/core/threshold'
import { gradeCeiling } from '@rca/core/grade'
import {
  flatWkg,
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from './components/fixtures'
import type { GradeOutcome } from './grades'
import { levelTargetText } from './levelTarget'

const result = makeResult({
  activities: [
    makeActivity({ id: 'run-1', sport: 'run' }),
    makeActivity({ id: 'ride-1', sport: 'ride' }),
  ],
  runThreshold: makeRunThreshold(flatWkg(3.9)),
  rideThreshold: makeRideThreshold(230 / (PRIORS.grossEfficiency.mean * 75)),
})

const graded = (grade: number): GradeOutcome => ({
  kind: 'graded',
  age: 37,
  grade: { centre: { grade, level: 'World' }, range: null },
})

const input = (run: number, ride: number) => ({
  lean: 'run' as const,
  result,
  grades: { run: graded(run), ride: graded(ride) },
  sex: 'male' as const,
  massKg: 75,
  units: 'metric' as const,
  calibration: result.hr,
})

describe('the level target above the top of the scale', () => {
  it('is still given just under 100%', () => {
    expect(levelTargetText(input(0.97, 0.6))).toMatch(/^To match it on the bike: \d+ W threshold/)
  })

  it('is hidden when the target would be above 100%', () => {
    expect(levelTargetText(input(1.05, 0.6))).toBeNull()
    expect(
      levelTargetText({
        ...input(1.05, 0.6),
        lean: 'ride',
        grades: { run: graded(0.6), ride: graded(1.05) },
      }),
    ).toBeNull()
  })

  it('is hidden at the ceiling for a ride, which the page would itself flag, but not for a run', () => {
    const ceiling = gradeCeiling(HOUR_S, 37, 'male')!
    expect(ceiling).toBe(1)
    expect(levelTargetText(input(ceiling, 0.6))).toBeNull()
    const toRun = { ...input(0.6, ceiling), lean: 'ride' as const }
    expect(levelTargetText(toRun)).toMatch(/^To match it on the run: \d+:\d\d \/km threshold/)
  })
})
