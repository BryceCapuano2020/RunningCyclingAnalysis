import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { assessQuality } from '../quality'
import { traceQualityOf } from '../digest/traceQuality'
import type { Activity } from '../types'
import { activityTraceOf, parseActivityTrace } from '../workbench/trace'
import type { ZoneMeasure } from './schemes'
import { secondsByZone } from './timeInZones'
import { DISTRIBUTION_OF } from './timeInZones'
import { traceTimeInZones } from './traceZones'
import { zonesFor } from './zones'

const N = 200

/** A steady heart rate that rises through the zones, with a spike at second 100 that the assessment flags. */
function spikedRun(): Activity {
  const heartRate = Float64Array.from({ length: N }, (_, i) => 130 + Math.floor(i / 5))
  heartRate[100] = 235
  return syntheticActivity({ n: N, sport: 'run', heartRate })
}

function spikedRide(): Activity {
  const power = Float64Array.from({ length: N }, (_, i) => 150 + (i % 40) * 5)
  power[100] = 2600
  return syntheticActivity({ n: N, sport: 'ride', power })
}

/** The seconds the sport page's digest puts in each zone, and the activity page's whole-activity ones. */
function bothWays(activity: Activity, measure: ZoneMeasure, reference: number) {
  const zones = zonesFor(measure, reference)
  const distribution = digestActivity(activity).distributions?.[DISTRIBUTION_OF[measure]]
  const fromDigest = secondsByZone(zones, measure, distribution!)
  const quality = traceQualityOf(activity)
  const masked = traceTimeInZones(activityTraceOf(activity, quality), measure, zones, 0, N)
  const unmasked = traceTimeInZones(activityTraceOf(activity), measure, zones, 0, N)
  return { fromDigest, masked, unmasked }
}

describe('the activity page and the sport page count the same seconds in zones', () => {
  it('leaves a flagged heart-rate spike and its margin out of both', () => {
    const activity = spikedRun()
    expect(assessQuality(activity, []).flags.map((f) => f.kind)).toContain('hr-spike')
    const { fromDigest, masked, unmasked } = bothWays(activity, 'heartRate', 200)
    expect(masked.seconds).toEqual(fromDigest)
    expect(unmasked.total).toBe(N)
    expect(masked.total).toBeLessThan(N - 5)
  })

  it('leaves a flagged power spike out of both', () => {
    const activity = spikedRide()
    expect(assessQuality(activity, []).flags.map((f) => f.kind)).toContain('power-spike')
    const { fromDigest, masked, unmasked } = bothWays(activity, 'power', 200)
    expect(masked.seconds).toEqual(fromDigest)
    expect(masked.total).toBeLessThan(unmasked.total)
  })

  it('matches on a trace without flags, and on one built without the assessment', () => {
    const calm = syntheticActivity({
      n: N,
      heartRate: Float64Array.from({ length: N }, (_, i) => 120 + Math.floor(i / 3)),
    })
    const { fromDigest, masked, unmasked } = bothWays(calm, 'heartRate', 200)
    expect(masked.seconds).toEqual(fromDigest)
    expect(unmasked).toEqual(masked)
    expect(activityTraceOf(calm, assessQuality(calm, [])).unusable).toBeUndefined()
  })

  it('survives validation, and is dropped from a trace whose mask is malformed', () => {
    const trace = activityTraceOf(spikedRun(), assessQuality(spikedRun(), []))
    expect(trace.unusable?.heartRate?.[100]).toBe(1)
    expect(parseActivityTrace(trace)?.unusable?.heartRate).toEqual(trace.unusable?.heartRate)
    expect(parseActivityTrace({ ...trace, unusable: { heartRate: new Uint8Array(3) } })).toBeNull()
    expect(parseActivityTrace({ ...trace, unusable: { cadence: new Uint8Array(N) } })).toBeNull()
  })

  it("takes the digest's own masks for an activity it digested, the same as assessing it fresh", () => {
    for (const activity of [spikedRun(), spikedRide()]) {
      const fresh = assessQuality(activity, [])
      expect(traceQualityOf(activity).validHeartRate).toEqual(fresh.validHeartRate)
      digestActivity(activity)
      const remembered = traceQualityOf(activity)
      expect(remembered).not.toBe(fresh)
      for (const key of ['validMotion', 'validPower', 'validHeartRate'] as const) {
        expect(remembered[key]).toEqual(fresh[key])
      }
    }
  })

  it('takes out what revision 7 takes out, for an activity read back that was never digested: a lone power spike, a cadence lock', () => {
    const ride = syntheticActivity({
      n: N,
      sport: 'ride',
      power: Float64Array.from({ length: N }, () => 200),
    })
    ride.power[100] = 1500
    // Fresh, as an original read back would be: no digest has been made of this object.
    const fresh = traceQualityOf(ride)
    expect(fresh.validPower.slice(99, 102)).toEqual(new Uint8Array(3))
    expect(fresh.validPower[50]).toBe(1)
    const { fromDigest, masked } = bothWays(ride, 'power', 200)
    expect(masked.seconds).toEqual(fromDigest)
    expect(masked.total).toBe(N - 3)
  })

  it('counts pace the way the digest does over a stretch where speed and distance disagree', () => {
    const activity = syntheticActivity({ n: N, sport: 'run', speed: new Float64Array(N).fill(4) })
    // From second 60 to 160 the distance advances at 1.5 m/s while the speed says 4, so the digest lowers it.
    for (let i = 1; i < N; i++) {
      activity.distance[i] = activity.distance[i - 1]! + (i > 60 && i <= 160 ? 1.5 : 4)
    }
    // Before any digest the same lowering is found afresh.
    const fresh = traceQualityOf(activity)
    expect(Math.min(...fresh.agreedSpeed!)).toBeLessThan(2)
    expect(activityTraceOf(activity, fresh).zoneSpeed).toBeDefined()
    const { fromDigest, masked, unmasked } = bothWays(activity, 'pace', 3.5)
    expect(masked.seconds).toEqual(fromDigest)
    // From the recorded speed alone the lowered seconds would be counted in a zone they were not in.
    expect(unmasked.seconds).not.toEqual(fromDigest)
  })

  it('has no lowered speed for an activity whose speed and distance agree, or a ride with a power meter', () => {
    expect(traceQualityOf(spikedRun()).agreedSpeed).toBeUndefined()
    const ride = spikedRide()
    for (let i = 1; i < N; i++)
      ride.distance[i] = ride.distance[i - 1]! + (i > 60 && i <= 160 ? 1 : 4)
    expect(traceQualityOf(ride).agreedSpeed).toBeUndefined()
  })
})
