import { describe, expect, it } from 'vitest'
import { PRIORS } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import { makeResult, makeRideThreshold, makeRunThreshold } from './components/fixtures'
import { thresholdLine } from './thresholdLine'
import { thresholdRange } from './thresholdRange'

const uneven = (cp: number) => ({
  fit: { cp, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
  leftOutS: [900, 1200],
  floor: 3.2,
})

describe('thresholdLine', () => {
  it('is a run’s estimate as the flat speed the curve is drawn in, with its 10th to 90th percentile as the band', () => {
    const runThreshold = makeRunThreshold(16, { low: 14.9, high: 16.4 })
    const result = makeResult({ runThreshold })
    const line = thresholdLine(result, 'run', 70, 'metric')
    expect(line?.value).toBeCloseTo(metabolicToFlatSpeed(16), 9)
    expect(line?.low).toBeCloseTo(metabolicToFlatSpeed(14.9), 9)
    expect(line?.high).toBeCloseTo(metabolicToFlatSpeed(16.4), 9)
    expect(line?.detail).toBe('Range 4:17 to 4:45 /km')
    expect(line?.detail).toBe(thresholdRange(result, 'run', 70, 'metric'))
    expect(line?.estimated).toBe(false)
  })

  it('reads a run’s line from its estimate, not from its critical-power fit', () => {
    // The fit says 4.0 W/kg, which is 23:23 /km; the line is drawn where the estimate says.
    const line = thresholdLine(
      makeResult({ runThreshold: makeRunThreshold(16) }),
      'run',
      70,
      'metric',
    )
    expect(line?.value).toBeCloseTo(metabolicToFlatSpeed(16), 9)
    expect(line?.value).not.toBeCloseTo(metabolicToFlatSpeed(4.0), 3)
  })

  it('is a ride’s critical power in watts at the body mass, as the threshold figure reads it', () => {
    const line = thresholdLine(makeResult(), 'ride', 75, 'metric')
    expect(line?.value).toBeCloseTo(metabolicToRidePower(3.0, 75, PRIORS.grossEfficiency.mean), 9)
    expect(line?.low).toBeLessThan(line?.value ?? 0)
    expect(line?.high).toBeGreaterThan(line?.value ?? 0)
  })

  it('is a ride’s estimate with its 10th to 90th percentile as the band, whatever its critical-power fit says', () => {
    const rideThreshold = makeRideThreshold(15.5, { low: 14.9, high: 16.4 })
    const result = makeResult({
      rideCp: { cp: 9.9, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 6 },
      rideThreshold,
    })
    const line = thresholdLine(result, 'ride', 75, 'metric')
    const watts = (wkg: number) => metabolicToRidePower(wkg, 75, PRIORS.grossEfficiency.mean)
    expect(line?.value).toBeCloseTo(watts(15.5), 9)
    expect(line?.low).toBeCloseTo(watts(14.9), 9)
    expect(line?.high).toBeCloseTo(watts(16.4), 9)
    expect(line?.detail).toBe('Range 240 to 264 W')
    expect(line?.estimated).toBe(false)
  })

  it('names a ride’s line as an estimate where its strongest effort has estimated watts', () => {
    const base = makeRideThreshold(15.5)
    const estimated = {
      ...base,
      efforts: { ...base.efforts, strongest: { ...base.efforts.strongest, estimated: true } },
    }
    expect(
      thresholdLine(makeResult({ rideThreshold: estimated }), 'ride', 75, 'metric')?.estimated,
    ).toBe(true)
  })

  it('is null without an estimate, whatever fit the sport holds', () => {
    const fitOnly = makeResult({ runThreshold: null, rideThreshold: null })
    expect(fitOnly.runCp).not.toBeNull()
    expect(thresholdLine(fitOnly, 'run', 70, 'metric')).toBeNull()
    expect(thresholdLine(fitOnly, 'ride', 75, 'metric')).toBeNull()
  })

  it('leaves a run’s uneven fit out: the band and the words are the estimate’s', () => {
    const line = thresholdLine(makeResult({ runCpUneven: uneven(4.2) }), 'run', 70, 'metric')
    // The default estimate is 4.0 W/kg with its range 5% either side, not a run up to the uneven fit's 4.2.
    expect(line?.low).toBeCloseTo(metabolicToFlatSpeed(4.0 * 0.95), 9)
    expect(line?.high).toBeCloseTo(metabolicToFlatSpeed(4.0 * 1.05), 9)
    expect(line?.detail).toBe('Range 21:49 to 25:12 /km')
  })
})
