import { PRIORS } from '@rca/core/constants'
import { HOUR_S } from '@rca/core/threshold'
import { ageGradeForEffort } from '@rca/core/grade'
import { describe, expect, it } from 'vitest'
import {
  flatWkg,
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from './components/fixtures'
import { levelTarget, levelledNative, nativeAtGrade } from './levelTarget'

const ATHLETE = { age: 37, sex: 'male', massKg: 75, calibration: makeResult().hr } as const

describe('the run solver', () => {
  // The rounded target in levelTarget.test.ts only has to grade at least the whole percent, which a solver
  // far coarser than designed still satisfies. This holds the solver to its own precision.
  it('finds the run speed that grades at the target to within a hundred-thousandth', () => {
    let worst = 0
    for (let whole = 50; whole <= 80; whole++) {
      const speed = nativeAtGrade('run', whole / 100, HOUR_S, ATHLETE)!
      const grade = ageGradeForEffort(speed, HOUR_S, ATHLETE.age, ATHLETE.sex)!
      worst = Math.max(worst, Math.abs(grade - whole / 100))
    }
    expect(worst).toBeLessThan(1e-5)
  })
})

describe('levelTarget for a run that is already at the levelled pace', () => {
  // The run twin of "names no line when the ride already shows the levelled watts".
  const graded = (grade: number) =>
    ({
      kind: 'graded',
      age: 37,
      grade: { centre: { grade, level: 'Local' }, range: null },
    }) as const
  const grades = { run: graded(0.5), ride: graded(0.67) }
  const result = makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'ride-1', sport: 'ride' }),
    ],
    runThreshold: makeRunThreshold(flatWkg(3.0)),
    rideThreshold: makeRideThreshold(320 / (PRIORS.grossEfficiency.mean * 75)),
  })
  const input = {
    result,
    grades,
    sex: 'male' as const,
    massKg: 75,
    units: 'metric' as const,
    calibration: result.hr,
    lean: 'ride' as const,
  }

  it('names a target for a slower run, and none once the run shows the levelled pace', () => {
    expect(levelTarget(input)).not.toBeNull()
    const speed = levelledNative('run', nativeAtGrade('run', 0.67, HOUR_S, ATHLETE)!, 'metric', {
      wholePercent: 67,
      durationS: HOUR_S,
      athlete: ATHLETE,
    })
    const level = makeResult({
      ...result,
      runThreshold: makeRunThreshold(flatWkg(speed)),
    })
    expect(levelTarget({ ...input, result: level })).toBeNull()
  })
})
