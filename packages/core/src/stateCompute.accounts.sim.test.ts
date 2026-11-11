import { afterEach, describe, expect, it, vi } from 'vitest'
import { UTC_ZONE, setViewerZone } from './calendar'
import { accountsFor, inputFor, solo, type Account } from './test/accountKit'
import { snapshotCorpus } from './test/snapshotCorpus'
import type { ActivityDigest } from './types'
import { fixedZone } from './test/zones'

const withOverReadingMeter = (d: ActivityDigest): ActivityDigest =>
  Object.assign({}, d, { curve: d.curve.map((p) => Object.assign({}, p, { value: p.value * 4 })) })

/** The sample season, one ride of it with power no rider holds, so the kept-power choice moves figures. */
const season = snapshotCorpus()[1]!
const over = season.digests.find((d) => d.sport === 'ride' && d.powerSource === 'measured')!
const library = {
  ...season,
  digests: season.digests.map((d) => (d === over ? withOverReadingMeter(d) : d)),
}
const [base] = accountsFor([over.id]) as [Account]

afterEach(() => void setViewerZone(UTC_ZONE))

describe('a snapshot moves with each input it reads, as a fresh isolate gives, on shared digests', () => {
  it('for every setting, the zone and the period', async () => {
    const variants: Account[] = [
      { ...base, settings: { ...base.settings, massKg: 66 } },
      { ...base, settings: { ...base.settings, bikeMassKg: 12 } },
      { ...base, settings: { ...base.settings, birthYear: 1960 } },
      { ...base, settings: { ...base.settings, sex: 'male' } },
      { ...base, settings: { ...base.settings, keepPower: [] } },
      { ...base, settings: { ...base.settings, measurements: [] } },
      { ...base, settings: { ...base.settings, massAssumed: true } },
      { ...base, choice: 'all' },
      { ...base, choice: 'default' },
      { ...base, zone: fixedZone(-3) },
    ]
    vi.resetModules()
    const { computeSnapshot } = await import('./stateCompute')
    computeSnapshot(inputFor(library, base))
    for (const [i, variant] of variants.entries()) {
      expect(computeSnapshot(inputFor(library, variant)), `variant ${i}`).toStrictEqual(
        await solo(library, variant),
      )
    }
  })
})
