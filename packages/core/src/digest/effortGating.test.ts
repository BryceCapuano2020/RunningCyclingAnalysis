import { describe, expect, it } from 'vitest'
import type { CriticalPowerOutcome, UnevenFit } from '../cp'
import { NO_EFFORT_GATE } from '../effort'
import type { EffortGate } from '../effort'
import type { CriticalPowerFit } from '../types'
import { gatedThreshold } from './effortGating'

const FIT: CriticalPowerFit = { cp: 3.6, wPrime: 200, cpSe: 0.05, r2: 0.99, nPoints: 6 }
const PASSED: CriticalPowerOutcome = { fit: FIT, refusal: null }
const REFUSED: CriticalPowerOutcome = { fit: null, refusal: 'shape' }
const UNEVEN: UnevenFit = { fit: { ...FIT, cp: 4 }, leftOutS: [900, 1200], floor: 3.4 }
const NOT_HARD: EffortGate = { ...NO_EFFORT_GATE, verdict: 'notHard', unchecked: null }

describe('gatedThreshold', () => {
  it('withholds a fit whose best 20 minutes was not hard, and says why', () => {
    expect(gatedThreshold(NOT_HARD, PASSED, null)).toEqual({
      fit: null,
      refusal: 'effort',
      uneven: null,
    })
  })

  it('keeps a fit refused for its shape under its first reason', () => {
    expect(gatedThreshold(NOT_HARD, REFUSED, null).refusal).toBe('shape')
  })

  it('keeps the uneven fit: it leaves out the 20 minutes the gate judged', () => {
    expect(gatedThreshold(NOT_HARD, REFUSED, UNEVEN).uneven).toBe(UNEVEN)
    expect(gatedThreshold(NOT_HARD, PASSED, UNEVEN)).toEqual({
      fit: null,
      refusal: 'effort',
      uneven: UNEVEN,
    })
  })

  it('withholds nothing when it cannot judge', () => {
    expect(gatedThreshold(NO_EFFORT_GATE, PASSED, UNEVEN)).toEqual({
      fit: FIT,
      refusal: null,
      uneven: UNEVEN,
    })
  })
})
