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

  it('splits a bin that straddles an edge by the share of its width each side', () => {
    // Threshold 201 W: the first edge is 0.55 * 201 = 110.55 W, inside the bin 110 to 115 W.
    const zones = zonesFor('power', 201)
    const seconds = secondsByZone(zones, 'power', { offset: 22, counts: [100] })
    expect(seconds[0]).toBeCloseTo(11, 9)
    expect(seconds[1]).toBeCloseTo(89, 9)
  })

  it('splits one bin over three zones when the zones are narrower than the bin', () => {
    // Zones 100 to 102 and 102 to 103 inside a bin of 100 to 105 W.
    const zones = [
      { level: 1, name: 'a', low: 0, high: 102 },
      { level: 2, name: 'b', low: 102, high: 103 },
      { level: 3, name: 'c', low: 103, high: null },
    ]
    const seconds = secondsByZone(zones, 'power', { offset: 20, counts: [50] })
    expect(seconds[0]).toBeCloseTo(20, 9)
    expect(seconds[1]).toBeCloseTo(10, 9)
    expect(seconds[2]).toBeCloseTo(20, 9)
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

  it('has no data for a digest from before distributions were kept', () => {
    expect(activityTimeInZones({ sport: 'run' }, [heartRateSet])).toEqual({
      heartRate: { kind: 'noData' },
      pace: { kind: 'noData' },
    })
  })

  it('leaves a set-aside heart rate out, whatever the zones', () => {
    const time = activityTimeInZones(
      { sport: 'ride', distributions: { heartRate: distribution } },
      [heartRateSet],
      true,
    )
    expect(time.heartRate).toEqual({ kind: 'noData' })
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
