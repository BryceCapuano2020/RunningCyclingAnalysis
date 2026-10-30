import { cpSpread } from '@rca/core/cp'
import { describe, expect, it } from 'vitest'
import { PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import { makeResult } from './components/fixtures'
import { thresholdLine } from './thresholdLine'
import { thresholdRange } from './thresholdRange'

const uneven = (cp: number) => ({
  fit: { cp, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
  leftOutS: [900, 1200],
  floor: 3.2,
})

describe('thresholdLine', () => {
  it('is a run’s critical power as the flat speed the curve is drawn in, with its range as a band', () => {
    const result = makeResult()
    const line = thresholdLine(result, 'run', 70, 'metric')
    expect(line?.value).toBeCloseTo(metabolicToFlatSpeed(4.0), 9)
    // The fixture's standard error is 0.05; the band adds the model error floor (cpSpread).
    const half = cpSpread({ cp: 4.0, cpSe: 0.05 })
    expect(half).toBeGreaterThan(0.05)
    expect(line?.low).toBeCloseTo(metabolicToFlatSpeed(4.0 - half), 9)
    expect(line?.high).toBeCloseTo(metabolicToFlatSpeed(4.0 + half), 9)
    expect(line?.detail).toBe(thresholdRange(result, 'run', 70, 'metric'))
  })

  it('is a ride’s critical power in watts at the body mass, as the threshold figure reads it', () => {
    const line = thresholdLine(makeResult(), 'ride', 75, 'metric')
    expect(line?.value).toBeCloseTo(metabolicToRidePower(3.0, 75, PRIORS.grossEfficiency.mean), 9)
    expect(line?.low).toBeLessThan(line?.value ?? 0)
    expect(line?.high).toBeGreaterThan(line?.value ?? 0)
  })

  it('is null without a fit, and for a run with only a floor', () => {
    expect(thresholdLine(makeResult({ runCp: null }), 'run', 70, 'metric')).toBeNull()
    expect(thresholdLine(makeResult({ rideCp: null }), 'ride', 75, 'metric')).toBeNull()
  })

  it('gives only the range’s words, and no band, with an uneven fit, whose range is not round the line', () => {
    const line = thresholdLine(makeResult({ runCpUneven: uneven(4.2) }), 'run', 70, 'metric')
    expect(line?.low).toBeUndefined()
    expect(line?.high).toBeUndefined()
    expect(line?.detail).toBe('Range 21:49 to 23:23 /km')
  })

  it('has no band or words where the range is below resting metabolic rate and is not shown', () => {
    const loose = { cp: RESTING_W_PER_KG, wPrime: 20, cpSe: 0.2, r2: 0.9, nPoints: 6 }
    const line = thresholdLine(makeResult({ runCp: loose }), 'run', 70, 'metric')
    expect(line?.detail).toBeUndefined()
    expect(line?.low).toBeUndefined()
  })
})
