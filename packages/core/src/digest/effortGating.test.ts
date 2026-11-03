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
const SHORT: UnevenFit = { fit: { ...FIT, cp: 4.2 }, leftOutS: [900, 1200], floor: 3.4 }
const NOT_HARD: EffortGate = {
  ...NO_EFFORT_GATE,
  verdict: 'notHard',
  unchecked: null,
  floor: { durationS: 1800, value: 3.5 },
}

describe('gatedThreshold', () => {
  it('withholds a fit whose best 20 minutes was not hard, and says why', () => {
    expect(gatedThreshold(NOT_HARD, PASSED, null, null)).toEqual({
      fit: null,
      refusal: 'effort',
      uneven: null,
    })
  })

  it('keeps a fit refused for its shape under its first reason', () => {
    expect(gatedThreshold(NOT_HARD, REFUSED, null, null).refusal).toBe('shape')
  })

  it('runs the range up to the short fit, with or without an uneven fit', () => {
    expect(gatedThreshold(NOT_HARD, REFUSED, UNEVEN, SHORT).uneven).toBe(SHORT)
    expect(gatedThreshold(NOT_HARD, REFUSED, null, SHORT).uneven).toBe(SHORT)
    expect(gatedThreshold(NOT_HARD, PASSED, null, SHORT)).toEqual({
      fit: null,
      refusal: 'effort',
      uneven: SHORT,
    })
  })

  it('has no second fit when the short one is refused, whatever the uneven fit says', () => {
    expect(gatedThreshold(NOT_HARD, REFUSED, UNEVEN, null).uneven).toBeNull()
  })

  it('drops a short fit that does not clear the floor by 2%', () => {
    const near = { ...SHORT, fit: { ...SHORT.fit, cp: 3.5 * 1.019 } }
    const clear = { ...SHORT, fit: { ...SHORT.fit, cp: 3.5 * 1.021 } }
    expect(gatedThreshold(NOT_HARD, REFUSED, null, near).uneven).toBeNull()
    expect(gatedThreshold(NOT_HARD, REFUSED, null, clear).uneven).toBe(clear)
  })

  it('withholds nothing when it cannot judge', () => {
    expect(gatedThreshold(NO_EFFORT_GATE, PASSED, UNEVEN, SHORT)).toEqual({
      fit: FIT,
      refusal: null,
      uneven: UNEVEN,
    })
  })
})
