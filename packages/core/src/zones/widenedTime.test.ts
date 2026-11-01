import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import type { ActivityDigest, AthleteSettings } from '../types'
import { periodTimeInZones } from './periodTime'
import { ZoneTimeCache } from './timeCache'
import { widenedTimeInZones } from './widenedTime'
import type { ZoneReach } from './widenedTime'
import { noon, zoneDigest } from './test/zoneDigests'

const max: Measurement = { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2020-01-01' }
const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9, measurements: [max] }
const NONE = new Set<string>()

/** A run with 25 minutes at one heart rate, on a date. */
const run = (id: string, year: number, month: number, day: number): ActivityDigest =>
  zoneDigest({ id, sport: 'run', startMs: noon(year, month, day), heartRate: [150, 1500] })

/** The period: 12 weeks ending on 30 June 2026. */
const PERIOD = { endMs: noon(2026, 6, 30), days: 84 }

function widen(library: ActivityDigest[], period: ZoneReach['period'] = PERIOD) {
  const selected = library.filter((d) => d.startMs > noon(2026, 4, 6))
  const current = periodTimeInZones(selected, settings, null, NONE)
  return widenedTimeInZones(current, { library, period }, settings, null, NONE)
}

describe('widenedTimeInZones', () => {
  it('leaves a sport the period describes as it is', () => {
    const library = [run('a', 2026, 5, 1), run('b', 2026, 5, 8), run('c', 2026, 5, 15)]
    expect(widen(library)).toEqual({})
  })

  it('widens a thin period to the 12 months ending with it', () => {
    const library = [
      run('old', 2025, 3, 1),
      run('a', 2025, 8, 1),
      run('b', 2025, 11, 1),
      run('c', 2026, 2, 1),
      run('d', 2026, 5, 1),
    ]
    const found = widen(library).run!
    expect(found.window).toBe('year')
    const row = found.rows.find((r) => r.measure === 'heartRate')!
    // The four runs since 1 July 2025; the one before that is out.
    expect([row.counted, row.totalSeconds]).toEqual([4, 6000])
  })

  it('widens to all time when 12 months is thin too', () => {
    const library = [
      run('a', 2023, 5, 1),
      run('b', 2024, 5, 1),
      run('c', 2025, 1, 1),
      run('d', 2026, 5, 1),
    ]
    const found = widen(library).run!
    expect(found.window).toBe('all')
    expect(found.rows.find((r) => r.measure === 'heartRate')!.counted).toBe(4)
  })

  it('shows all time for whatever it holds when even that is thin', () => {
    const found = widen([run('a', 2024, 5, 1), run('b', 2026, 5, 1)]).run!
    expect(found.window).toBe('all')
    expect(found.rows.find((r) => r.measure === 'heartRate')!.counted).toBe(2)
  })

  it('says nothing for a sport the library holds nothing counted for, or for all time', () => {
    expect(widen([zoneDigest({ id: 'bare', sport: 'run', startMs: noon(2026, 5, 1) })])).toEqual({})
    const library = [run('a', 2024, 5, 1), run('b', 2026, 5, 1)]
    expect(widen(library, { endMs: PERIOD.endMs, days: null })).toEqual({})
  })
})

describe('ZoneTimeCache with a reach', () => {
  const library = [run('a', 2025, 8, 1), run('b', 2025, 11, 1), run('c', 2026, 2, 1)]
  const selected = [run('d', 2026, 5, 1)]

  it('carries the widening, and leaves the key out when nothing was widened', () => {
    const cache = new ZoneTimeCache()
    const thin = cache.get(selected, [], settings, null, [], { library, period: PERIOD })
    expect(thin.widened?.run?.window).toBe('year')
    const plain = cache.get(selected, [], settings, null, [])
    expect('widened' in plain).toBe(false)
    const enough = [run('x', 2026, 5, 1), run('y', 2026, 5, 8), run('z', 2026, 5, 15)]
    const described = cache.get(enough, [], settings, null, [], { library: enough, period: PERIOD })
    expect('widened' in described).toBe(false)
  })

  it('keeps a result while the library and period are the same, and makes another when they change', () => {
    const cache = new ZoneTimeCache()
    const aside: string[] = []
    const first = cache.get(selected, [], settings, null, aside, { library, period: PERIOD })
    expect(cache.get(selected, [], settings, null, aside, { library, period: PERIOD })).toBe(first)
    const wider = { library: [...library, run('e', 2026, 1, 1)], period: PERIOD }
    expect(cache.get(selected, [], settings, null, aside, wider)).not.toBe(first)
  })
})
