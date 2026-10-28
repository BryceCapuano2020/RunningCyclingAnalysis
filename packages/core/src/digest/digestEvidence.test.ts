import { describe, expect, it } from 'vitest'
import { digestActivity } from './digestActivity'
import { parseDigest, serializeDigest } from './serialize'
import { syntheticActivity } from './test/syntheticActivity'

const N = 9000
const total = (counts: number[] | undefined) => (counts ?? []).reduce((a, b) => a + b, 0)

describe('digest evidence', () => {
  const run = digestActivity(syntheticActivity({ n: N, sport: 'run' }))
  const ride = digestActivity(
    syntheticActivity({ n: N, sport: 'ride', power: new Float64Array(N).fill(220) }),
  )
  const estimated = digestActivity(syntheticActivity({ n: N, sport: 'ride' }))

  it('keeps the moving seconds of heart rate and speed for a run', () => {
    expect(Object.keys(run.distributions!).sort()).toEqual(['heartRate', 'speed'])
    expect(total(run.distributions!.heartRate?.counts)).toBe(run.movingS)
    expect(total(run.distributions!.speed?.counts)).toBe(run.movingS)
  })

  it('keeps measured power for a ride with a power meter, as 5 W bins', () => {
    expect(ride.distributions!.power).toEqual({ offset: 44, counts: [N] })
    expect(ride.distributions!.speed).toBeUndefined()
  })

  it('keeps no power distribution, durability or drift for a ride without a power meter', () => {
    expect(estimated.powerSource).toBe('virtual')
    expect(Object.keys(estimated.distributions!)).toEqual(['heartRate'])
    expect(estimated.durability).toEqual([])
    expect(estimated.drift).toBeNull()
  })

  it('scores durability in the unit of the main curve', () => {
    expect(ride.durability).toHaveLength(6)
    for (const p of ride.durability!) expect(p.value).toBe(220)
    const fresh = run.curve.find((p) => p.durationS === 1200)!
    const late = run.durability!.find((p) => p.afterS === 7200 && p.durationS === 1200)!
    // A constant run: the late 20 minutes cost the same as the best 20 minutes.
    expect(late.value).toBeCloseTo(fresh.value, 9)
    expect(run.durability!.some((p) => p.afterS === 7200 && p.durationS === 300)).toBe(true)
  })

  it('has no durability for an activity that does not move for an hour', () => {
    const short = digestActivity(syntheticActivity({ n: 3000, sport: 'run' }))
    expect(short.durability).toEqual([])
    expect(short.drift).toBeNull()
  })

  it('reports no drift for a steady effort that held its heart rate', () => {
    expect(run.drift!.firstRatio).toBeCloseTo(run.drift!.secondRatio, 12)
    expect(run.drift!.durationS).toBe(N - 600 - ((N - 600) % 60))
    expect(ride.drift!.firstRatio).toBeCloseTo(220 / 150, 12)
  })

  it('reports the drift of a steady ride whose heart rate rose', () => {
    const heartRate = Float64Array.from({ length: N }, (_, i) => (i < (N + 600) / 2 ? 140 : 154))
    const drifting = digestActivity(
      syntheticActivity({ n: N, sport: 'ride', power: new Float64Array(N).fill(220), heartRate }),
    )
    expect(drifting.drift!.secondRatio / drifting.drift!.firstRatio).toBeCloseTo(140 / 154, 12)
  })

  it('has no drift without a heart-rate stream', () => {
    const noHr = digestActivity(syntheticActivity({ n: N, sport: 'run', noHeartRate: true }))
    expect(noHr.drift).toBeNull()
    expect(noHr.distributions!.heartRate).toBeUndefined()
  })

  it('round-trips through the serialised form', () => {
    for (const digest of [run, ride, estimated]) {
      expect(parseDigest(serializeDigest(digest))).toEqual(digest)
    }
  })

  it('stays small: the evidence of a two-and-a-half hour activity is under 2 kB', () => {
    const { distributions, durability, drift } = ride
    expect(JSON.stringify({ distributions, durability, drift }).length).toBeLessThan(2000)
  })
})
