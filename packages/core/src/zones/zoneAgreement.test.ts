import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { assessQuality } from '../quality'
import type { Activity } from '../types'
import { activityTraceOf } from '../workbench/trace'
import type { ZoneMeasure } from './schemes'
import { activityTimeInZones } from './timeInZones'
import { traceTimeInZones } from './traceZones'
import { zonesFor } from './zones'
import type { ZoneSet } from './zones'

/** The seconds in each zone of the whole activity by the period view's way (the digest) and the activity page's (the trace). */
function bothWays(activity: Activity, measure: ZoneMeasure, reference: number) {
  const set: ZoneSet = {
    sport: activity.sport,
    measure,
    source: 'entered',
    reference,
    estimatedFrom: [],
    citation: '',
    zones: zonesFor(measure, reference),
  }
  const digest = digestActivity(activity)
  const counted = activityTimeInZones(digest, [set])[measure]
  const trace = activityTraceOf(activity, assessQuality(activity, []))
  const exact = traceTimeInZones(trace, measure, set.zones, 0, activity.n)
  return { digest: counted?.kind === 'counted' ? counted.seconds : null, trace: exact.seconds }
}

describe('time in zones, the digest and the trace', () => {
  it('puts an hour at one belt speed in the zone of that speed', () => {
    // Threshold 3.5 m/s: the edge between Tempo and Sub-threshold is about 3.30 m/s.
    for (const speed of [3.2, 3.29, 3.3, 3.31, 3.333, 3.4, 3.5]) {
      const activity = syntheticActivity({
        n: 3600,
        indoor: true,
        speed: new Float64Array(3600).fill(speed),
      })
      const { digest, trace } = bothWays(activity, 'pace', 3.5)
      expect(digest).toEqual(trace)
    }
  })

  it('agrees second for second over speeds that cross every edge', () => {
    const n = 3000
    const speed = Float64Array.from({ length: n }, (_, i) => 1.5 + ((i * 37) % 350) / 100)
    for (const reference of [2.9, 3.5, 4.1]) {
      const run = syntheticActivity({ n, speed })
      const { digest, trace } = bothWays(run, 'pace', reference)
      expect(digest).toEqual(trace)
    }
  })
})
