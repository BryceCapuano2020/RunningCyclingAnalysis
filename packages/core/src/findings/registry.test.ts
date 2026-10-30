import { describe, expect, it } from 'vitest'
import { FINDINGS } from './constants'
import { DETECTORS } from './detectors'
import { registryOf } from './registry'
import { stubDetector } from './test/stubs'

describe('registryOf', () => {
  it('lists each detector under the sports it says it is for, in order', () => {
    const a = stubDetector('a', { sports: ['run'] })
    const b = stubDetector('b', { sports: ['run', 'ride'] })
    const c = stubDetector('c', { sports: ['ride'] })
    const registry = registryOf([a, b, c])
    expect(registry.run.map((d) => d.id)).toEqual(['a', 'b'])
    expect(registry.ride.map((d) => d.id)).toEqual(['b', 'c'])
  })

  it('refuses two detectors with one id, since the id names their findings', () => {
    expect(() => registryOf([stubDetector('a'), stubDetector('a')])).toThrow(/called a/)
  })

  it('refuses detectors whose false-alarm shares add to more than the family budget', () => {
    const half = FINDINGS.familyBudgetPerYear / 2
    expect(() =>
      registryOf([
        stubDetector('a', { alarmBudget: half }),
        stubDetector('b', { alarmBudget: half }),
      ]),
    ).not.toThrow()
    expect(() =>
      registryOf([
        stubDetector('a', { alarmBudget: half }),
        stubDetector('b', { alarmBudget: half }),
        stubDetector('c', { alarmBudget: 0.01 }),
      ]),
    ).toThrow(/over the family budget/)
  })

  it('has the app’s own detectors within the family budget, each with a share', () => {
    const shares = DETECTORS.map((detector) => detector.alarmBudget)
    expect(shares.every((share) => share > 0)).toBe(true)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeLessThanOrEqual(
      FINDINGS.familyBudgetPerYear,
    )
  })
})
