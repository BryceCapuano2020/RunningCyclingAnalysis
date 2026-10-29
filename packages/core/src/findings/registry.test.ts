import { describe, expect, it } from 'vitest'
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
})
