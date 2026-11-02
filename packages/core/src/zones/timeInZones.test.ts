import { describe, expect, it } from 'vitest'
import { DISTRIBUTION_BINS } from '../constants'
import type { DigestDistribution } from '../types'
import { activityTimeInZones, DISTRIBUTION_OF, secondsByZone } from './timeInZones'
import { zonesFor } from './zones'
import type { ZoneSet } from './zones'

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

describe('secondsByZone', () => {
  it('puts a bin wholly inside a zone in that zone', () => {
    // Maximum 200 bpm: zone 1 under 120, zone 2 from 120 to 140. One beat bins: bin 130 is 130-131.
    const zones = zonesFor('heartRate', 200)
    expect(secondsByZone(zones, 'heartRate', { offset: 130, counts: [90] })).toEqual([
      0, 90, 0, 0, 0,
    ])
  })

  it('holds a bin that starts on a zone edge in the zone it opens', () => {
    const zones = zonesFor('heartRate', 200)
    expect(secondsByZone(zones, 'heartRate', { offset: 120, counts: [10] })).toEqual([
      0, 10, 0, 0, 0,
    ])
    // The last bin below the edge stays in the zone below.
    expect(secondsByZone(zones, 'heartRate', { offset: 119, counts: [10] })).toEqual([
      10, 0, 0, 0, 0,
    ])
  })

  it('never splits a power bin, because the power edges are on the 5 W bin grid', () => {
    // Threshold 201 W: the first cut is 0.55 * 201 = 110.55 W, moved to 110 W, the floor of bin 22 (110 to 114 W).
    const zones = zonesFor('power', 201)
    expect(secondsByZone(zones, 'power', { offset: 21, counts: [100, 100] }).slice(0, 2)).toEqual([
      100, 100,
    ])
    for (const reference of [137, 187.5, 201, 250, 267, 311]) {
      for (const zone of zonesFor('power', reference)) {
        expect(zone.low % 5).toBe(0)
        expect(zone.high === null || zone.high % 5 === 0).toBe(true)
      }
    }
  })

  it('holds a power edge in the zone it opens, so a bin starting on it is wholly above', () => {
    // Threshold 200 W: the edge is 110 W exactly, and the bin 110 to 114 W is the zone above's.
    const zones = zonesFor('power', 200)
    expect(secondsByZone(zones, 'power', { offset: 22, counts: [100] }).slice(0, 2)).toEqual([
      0, 100,
    ])
    expect(secondsByZone(zones, 'power', { offset: 21, counts: [100] }).slice(0, 2)).toEqual([
      100, 0,
    ])
  })

  it('never splits a one-beat bin, whatever fraction the edge is', () => {
    // Maximum 219 bpm: the first cut is 0.6 * 219 = 131.4 bpm, so the zone above starts at 132 bpm. 131 bpm is
    // below the cut and 132 bpm above it.
    const zones = zonesFor('heartRate', 219)
    expect(secondsByZone(zones, 'heartRate', { offset: 131, counts: [10, 10] })).toEqual([
      10, 10, 0, 0, 0,
    ])
  })

  it('never splits a speed bin, because the pace edges are on the bin grid', () => {
    // Threshold 4 m/s: the first edge is 4 / 1.29 = 3.1008 m/s, moved to 3.10 m/s, the floor of bin 62.
    const zones = zonesFor('pace', 4)
    expect(secondsByZone(zones, 'pace', { offset: 61, counts: [1000, 1000] })).toEqual([
      1000, 1000, 0, 0, 0,
    ])
    for (const reference of [2.6, 3.17, 4, 4.4, 5.123]) {
      for (const zone of zonesFor('pace', reference)) {
        for (const edge of [zone.low, zone.high]) {
          if (edge === null) continue
          expect(edge / DISTRIBUTION_BINS.speed.width).toBeCloseTo(Math.round(edge / 0.05), 9)
        }
      }
    }
  })

  it('keeps every second whatever the edges: the zones add up to the distribution', () => {
    const counts = Array.from({ length: 60 }, (_, i) => 1 + ((i * 7) % 13))
    for (const reference of [137, 201.3, 250.7, 311]) {
      const seconds = secondsByZone(zonesFor('power', reference), 'power', { offset: 10, counts })
      expect(sum(seconds)).toBeCloseTo(sum(counts), 6)
    }
  })

  it('reads a pace in speed, the lowest zone the slowest', () => {
    // Threshold 4 m/s: zone 1 is under 4 / 1.29 = 3.10 m/s. Bin 40 is 2.00 to 2.05 m/s.
    const zones = zonesFor('pace', 4)
    const seconds = secondsByZone(zones, 'pace', { offset: 40, counts: [60] })
    expect(seconds).toEqual([60, 0, 0, 0, 0])
    const fast = secondsByZone(zones, 'pace', { offset: 100, counts: [60] })
    expect(fast).toEqual([0, 0, 0, 0, 60])
  })

  it('has no time in a distribution without counts', () => {
    expect(
      secondsByZone(zonesFor('heartRate', 190), 'heartRate', { offset: 0, counts: [] }),
    ).toEqual([0, 0, 0, 0, 0])
  })

  it('reads each measure from the distribution of its own bin width', () => {
    expect(DISTRIBUTION_BINS[DISTRIBUTION_OF.pace].width).toBe(0.05)
    expect(DISTRIBUTION_BINS[DISTRIBUTION_OF.power].width).toBe(5)
    expect(DISTRIBUTION_BINS[DISTRIBUTION_OF.heartRate].width).toBe(1)
  })
})

describe('activityTimeInZones', () => {
  const distribution: DigestDistribution = { offset: 150, counts: [30] }
  const heartRateSet: ZoneSet = {
    sport: 'ride',
    measure: 'heartRate',
    source: 'entered',
    reference: 200,
    estimatedFrom: [],
    maxHeartRateFrom: null,
    asOfMs: null,
    floorS: null,
    fromHighest: false,
    citation: '',
    zones: zonesFor('heartRate', 200),
  }

  it('counts a measure with a distribution and zones, and says where the zones came from', () => {
    const time = activityTimeInZones(
      { sport: 'ride', distributions: { heartRate: distribution } },
      [heartRateSet],
    )
    expect(time.heartRate).toEqual({
      kind: 'counted',
      source: 'entered',
      reference: 200,
      seconds: [0, 0, 30, 0, 0],
    })
  })

  it('tells a missing distribution from missing zones', () => {
    const time = activityTimeInZones(
      { sport: 'ride', distributions: { heartRate: distribution } },
      [heartRateSet],
    )
    // No measured power in the digest: no data. Heart rate has data and zones.
    expect(time.power).toEqual({ kind: 'noData' })
    const without = activityTimeInZones(
      { sport: 'ride', distributions: { heartRate: distribution } },
      [],
    )
    expect(without.heartRate).toEqual({ kind: 'noZones' })
  })

  it('tells a heart rate the analysis set aside from one that is missing', () => {
    const time = activityTimeInZones(
      { sport: 'ride', distributions: { heartRate: distribution } },
      [heartRateSet],
      true,
    )
    expect(time.heartRate).toEqual({ kind: 'setAside' })
    expect(activityTimeInZones({ sport: 'ride' }, [heartRateSet], true).heartRate).toEqual({
      kind: 'noData',
    })
  })

  it('has no data for a digest from before distributions were kept', () => {
    expect(activityTimeInZones({ sport: 'run' }, [heartRateSet])).toEqual({
      heartRate: { kind: 'noData' },
      pace: { kind: 'noData' },
    })
  })

  it("takes the zones of the activity's own sport", () => {
    const runSet = { ...heartRateSet, sport: 'run' as const }
    const time = activityTimeInZones(
      { sport: 'ride', distributions: { heartRate: distribution } },
      [runSet],
    )
    expect(time.heartRate).toEqual({ kind: 'noZones' })
  })
})
