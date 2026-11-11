import { describe, expect, it, vi } from 'vitest'
import { snapshotCorpus } from '../test/snapshotCorpus'
import type { ActivityDigest, AthleteSettings } from '../types'
import { lookBackOf } from './compute'

const withOverReadingMeter = (d: ActivityDigest): ActivityDigest =>
  Object.assign({}, d, { curve: d.curve.map((p) => Object.assign({}, p, { value: p.value * 4 })) })

/** The library's rides, one of them with power no rider holds (a meter that over-reads). */
function withImplausibleRide(): { digests: ActivityDigest[]; id: string } {
  const season = snapshotCorpus()[1]!.digests
  const ride = season.find((d) => d.sport === 'ride' && d.powerSource === 'measured')!
  return { digests: season.map((d) => (d === ride ? withOverReadingMeter(d) : d)), id: ride.id }
}

const base: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const answer = (digests: ActivityDigest[], settings: AthleteSettings) =>
  JSON.stringify(lookBackOf(digests, settings, new Set(), null))

describe('the look-back remembers an answer only for the inputs it read', () => {
  it.each<[string, (id: string) => AthleteSettings]>([
    ['kept power', (id) => ({ ...base, keepPower: [id] })],
    [
      'a dated weight',
      () => ({ ...base, measurements: [{ kind: 'massKg', from: '2000-01-01', value: 52 }] }),
    ],
    ['an unknown weight', () => ({ ...base, massAssumed: true })],
  ])('%s', async (_name, otherOf) => {
    const { digests, id } = withImplausibleRide()
    const settings = otherOf(id)
    const alone = async (given: AthleteSettings) => {
      vi.resetModules()
      const fresh = await import('./compute')
      return JSON.stringify(fresh.lookBackOf(digests, given, new Set(), null))
    }
    const [soloBase, soloOther] = [await alone(base), await alone(settings)]
    // The settings must matter, or the check below proves nothing.
    expect(soloOther).not.toBe(soloBase)
    // One module, the same digests, one account after the other.
    expect(answer(digests, base)).toBe(soloBase)
    expect(answer(digests, settings)).toBe(soloOther)
  })
})
