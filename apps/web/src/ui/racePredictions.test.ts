import { METRES_PER_MILE } from '@rca/core/units'
import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { racePredictionsOf } from './racePredictions'

describe('racePredictionsOf', () => {
  // The page tells a runner "Needs a best of a mile or more", so a mile best alone must be enough.
  it('predicts from a run whose only distance best is the mile', () => {
    const result = makeResult({
      activities: [
        makeActivity({
          id: 'mile',
          sport: 'run',
          distanceM: 2000,
          distanceBests: [{ distanceM: METRES_PER_MILE, seconds: 400 }],
        }),
      ],
      runVo2max: null,
    })
    expect(racePredictionsOf('run', result)).not.toBeNull()
  })

  it('does not predict from a best shorter than a mile', () => {
    const result = makeResult({
      activities: [
        makeActivity({
          id: 'short',
          sport: 'run',
          distanceM: 2000,
          distanceBests: [{ distanceM: METRES_PER_MILE - 1, seconds: 400 }],
        }),
      ],
      runVo2max: null,
    })
    expect(racePredictionsOf('run', result)).toBeNull()
  })
})
