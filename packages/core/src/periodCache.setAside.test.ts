import { describe, expect, it } from 'vitest'
import { digestActivity } from './digest'
import { PeriodCache } from './periodCache'
import { sampleDataset } from './synthetic'
import type { AthleteSettings } from './types'

const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
const period = digests.slice(0, 6)
const outside = digests[10]!.id

describe('PeriodCache.analysis and the heart rates set aside', () => {
  it('redoes the analysis when the set-aside among the period’s own activities changes', () => {
    const cache = new PeriodCache()
    const first = cache.analysis(period, settings, [])
    const named = period[0]!.id
    const second = cache.analysis(period, settings, [named])
    expect(second).not.toBe(first)
    expect(second.heartRateSetAside).toEqual([named])
    // And back: the earlier analysis is still kept, so the way back is free.
    expect(cache.analysis(period, settings, [])).toBe(first)
  })

  it('keeps the analysis when the set-aside changes only outside the period', () => {
    const cache = new PeriodCache()
    const first = cache.analysis(period, settings, [])
    expect(cache.analysis(period, settings, [outside])).toBe(first)
    expect(first.heartRateSetAside).toEqual([])
  })

  it('names only its own activities from a library-wide list, whatever the order of the list', () => {
    const cache = new PeriodCache()
    const [a, b] = [period[0]!.id, period[1]!.id]
    const first = cache.analysis(period, settings, [outside, b, a])
    expect(first.heartRateSetAside).toEqual([a, b].sort())
    expect(cache.analysis(period, settings, [a, b, outside])).toBe(first)
  })
})
