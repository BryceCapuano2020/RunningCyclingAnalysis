import { describe, expect, it } from 'vitest'
import { ridePowerOfWkg, wkgOfFlatSpeed } from '../display'
import type { ThresholdEstimate } from '../threshold'
import { thresholdChange } from './thresholdChange'

/** Only the value is read; the rest of an estimate is not. */
const at = (value: number) => ({ value }) as ThresholdEstimate
const MASS = 70

describe('thresholdChange', () => {
  it('is none when the previous period has no estimate', () => {
    expect(thresholdChange('ride', at(15), null, MASS, 'metric')).toEqual({ kind: 'none' })
    expect(thresholdChange('run', at(15), null, MASS, 'metric')).toEqual({ kind: 'none' })
  })

  it('gives a ride the difference of its two printed watts, positive for more', () => {
    const now = at(15)
    const before = at(14)
    const watts = Math.round(ridePowerOfWkg(15, MASS)) - Math.round(ridePowerOfWkg(14, MASS))
    expect(watts).toBeGreaterThan(0)
    expect(thresholdChange('ride', now, before, MASS, 'metric')).toEqual({
      kind: 'moved',
      shown: watts,
    })
    expect(thresholdChange('ride', before, now, MASS, 'metric')).toEqual({
      kind: 'moved',
      shown: -watts,
    })
  })

  it('gives a run the seconds its pace gained, positive for faster, in the unit shown', () => {
    // 4.0 m/s is 4:10 /km, 4.2 m/s about 3:58 /km: twelve whole seconds faster.
    const slow = at(wkgOfFlatSpeed(4))
    const fast = at(wkgOfFlatSpeed(4.2))
    expect(thresholdChange('run', fast, slow, MASS, 'metric')).toEqual({ kind: 'moved', shown: 12 })
    expect(thresholdChange('run', slow, fast, MASS, 'metric')).toEqual({
      kind: 'moved',
      shown: -12,
    })
    const miles = thresholdChange('run', fast, slow, MASS, 'imperial')
    expect(miles.kind === 'moved' && miles.shown).toBeGreaterThan(12)
  })

  it('is zero when the two print the same', () => {
    expect(thresholdChange('ride', at(15), at(15), MASS, 'metric')).toEqual({
      kind: 'moved',
      shown: 0,
    })
  })
})
