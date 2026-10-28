import { describe, expect, it } from 'vitest'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { activityTraceOf } from '../workbench/trace'
import { traceTimeInZones } from './traceZones'
import { zonesFor } from './zones'

describe('traceTimeInZones', () => {
  const heartRate = Float64Array.from({ length: 100 }, (_, i) =>
    i < 40 ? 110 : i < 90 ? 150 : 195,
  )
  const trace = activityTraceOf(syntheticActivity({ n: 100, heartRate }))
  // Maximum 200 bpm: zones under 120, 120-139, 140-159, 160-179, 180 and up.
  const zones = zonesFor('heartRate', 200)

  it('counts each recorded second in the zone that holds its reading', () => {
    expect(traceTimeInZones(trace, 'heartRate', zones, 0, 100)).toEqual({
      seconds: [40, 0, 50, 0, 10],
      total: 100,
    })
  })

  it('counts only the seconds of the interval, the end not included', () => {
    expect(traceTimeInZones(trace, 'heartRate', zones, 30, 50).seconds).toEqual([10, 0, 10, 0, 0])
    expect(traceTimeInZones(trace, 'heartRate', zones, 10, 10)).toEqual({
      seconds: [0, 0, 0, 0, 0],
      total: 0,
    })
  })

  it('holds a reading on an edge in the zone the edge opens', () => {
    const edge = activityTraceOf(
      syntheticActivity({ n: 4, heartRate: Float64Array.from([119, 120, 139, 140]) }),
    )
    expect(traceTimeInZones(edge, 'heartRate', zones, 0, 4).seconds).toEqual([1, 2, 1, 0, 0])
  })

  it('skips paused seconds and seconds without a reading', () => {
    const paused = new Uint8Array(100)
    paused.fill(1, 0, 20)
    const hr = heartRate.slice()
    hr.fill(Number.NaN, 90, 100)
    const gappy = activityTraceOf(syntheticActivity({ n: 100, heartRate: hr, paused }))
    expect(traceTimeInZones(gappy, 'heartRate', zones, 0, 100)).toEqual({
      seconds: [20, 0, 50, 0, 0],
      total: 70,
    })
  })

  it('has no time for a measure the trace does not record', () => {
    expect(traceTimeInZones(trace, 'power', zonesFor('power', 250), 0, 100).total).toBe(0)
  })
})
