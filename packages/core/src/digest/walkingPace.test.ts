import { describe, expect, it } from 'vitest'
import { WALKING_PACE } from '../constants'
import type { Activity } from '../types'
import { digestActivity } from './digestActivity'
import { parseDigest, serializeDigest } from './serialize'
import { summaryOf } from './summary'

/** An outdoor run of `n` seconds at a steady `speed`, with `edit` applied to it. */
function runAt(speed: number, n = 1800, edit: (a: Activity) => void = () => {}): Activity {
  const distance = new Float64Array(n).map((_, i) => i * speed)
  const activity: Activity = {
    id: 'walk',
    name: 'Morning',
    sport: 'run',
    startMs: Date.UTC(2020, 5, 1, 7),
    n,
    speed: new Float64Array(n).fill(speed),
    distance,
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(120),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
  edit(activity)
  return activity
}

/** 1.3 m/s is 20:36 a mile: a walk. */
const WALK = 1.3

describe('a run at walking pace', () => {
  it('is marked when it is slower than 15:00 a mile, and nothing says it ran', () => {
    expect(digestActivity(runAt(WALK)).walkingPace).toBe(true)
  })

  it('is not marked at or faster than 15:00 a mile', () => {
    expect(digestActivity(runAt(WALKING_PACE.maxMovingSpeedMs + 0.01)).walkingPace).toBeUndefined()
    expect(digestActivity(runAt(3)).walkingPace).toBeUndefined()
  })

  it('is not marked for a slow trail run that jogs a tenth of the time, but is for a walk with a GPS burst', () => {
    const trail = runAt(WALK, 1800, (a) => {
      a.speed.fill(3, 600, 800)
    })
    expect(digestActivity(trail).walkingPace).toBeUndefined()
    const burst = runAt(WALK, 1800, (a) => {
      a.speed.fill(5, 600, 660)
    })
    expect(digestActivity(burst).walkingPace).toBe(true)
  })

  /** Speed and cadence for the samples from..to, in place. */
  const segment = (a: Activity, from: number, to: number, speed: number, steps: number) => {
    a.speed.fill(speed, from, to)
    a.cadence ??= new Float32Array(a.n)
    a.cadence.fill(steps, from, to)
  }

  it('keeps a run whose cadence is a runner’s, and marks a walk whose cadence is a walker’s', () => {
    const cadence = (steps: number) => (a: Activity) => segment(a, 0, a.n, WALK, steps)
    expect(digestActivity(runAt(WALK, 1800, cadence(165))).walkingPace).toBeUndefined()
    expect(digestActivity(runAt(WALK, 1800, cadence(108))).walkingPace).toBe(true)
  })

  it('keeps a run/walk session with a quarter of it jogged at 165 steps a minute, the rest walked at 115', () => {
    const session = runAt(WALK, 1800, (a) => {
      segment(a, 0, 1800, 1.2, 115)
      for (let start = 0; start < 1800; start += 240) segment(a, start, start + 60, 2.6, 165)
    })
    // The median cadence over the whole session is a walker's, but it jogged 25% of the time.
    expect(digestActivity(session).walkingPace).toBeUndefined()
  })

  it('keeps a hilly ultra whose median cadence is low because it hikes the climbs', () => {
    const ultra = runAt(WALK, 3600, (a) => {
      segment(a, 0, 3600, 1.2, 98)
      segment(a, 600, 1200, 3, 160)
    })
    expect(digestActivity(ultra).walkingPace).toBeUndefined()
  })

  it('keeps a run whose faster seconds have a runner’s cadence even when too few are fast enough to jog', () => {
    const shuffle = runAt(WALK, 1800, (a) => {
      segment(a, 0, 1800, 1.2, 105)
      segment(a, 600, 750, 2.0, 160)
    })
    expect(digestActivity(shuffle).walkingPace).toBeUndefined()
  })

  it('marks a 2 h hike with a 90 s jog at 150 steps a minute, too few fast seconds to say it ran', () => {
    const hike = runAt(WALK, 7200, (a) => {
      segment(a, 0, 7200, 1.2, 105)
      segment(a, 3000, 3090, 2.0, 150)
    })
    // 90 s is over the 60 sample floor, but under 5% of the moving time.
    expect(digestActivity(hike).walkingPace).toBe(true)
  })

  it('marks a walk with a short GPS burst and a walker’s cadence', () => {
    const burst = runAt(WALK, 1800, (a) => {
      segment(a, 0, 1800, WALK, 108)
      segment(a, 600, 660, 5, 108)
    })
    expect(digestActivity(burst).walkingPace).toBe(true)
  })

  it('does not read a cadence of unknown unit as steps', () => {
    const unknown = runAt(WALK, 1800, (a) => {
      a.cadence = new Float32Array(a.n).fill(165)
      a.cadenceUnit = 'unknown'
    })
    expect(digestActivity(unknown).walkingPace).toBe(true)
  })

  it('is judged on moving time, so a long stop does not make a run slow', () => {
    const stopped = runAt(3, 3600, (a) => {
      a.paused.fill(1, 600, 3000)
      a.speed.fill(0, 600, 3000)
      const distance = a.distance
      for (let i = 600; i < a.n; i++) distance[i] = distance[600]! + (i > 3000 ? (i - 3000) * 3 : 0)
    })
    expect(digestActivity(stopped).walkingPace).toBeUndefined()
  })

  it('is not judged when it is too short to tell, has no distance, or is not a run', () => {
    expect(digestActivity(runAt(WALK, WALKING_PACE.minMovingS - 1)).walkingPace).toBeUndefined()
    const noDistance = runAt(WALK, 1800, (a) => a.distance.fill(0))
    expect(digestActivity(noDistance).walkingPace).toBeUndefined()
    const ride = runAt(WALK, 1800, (a) => {
      a.sport = 'ride'
    })
    expect(digestActivity(ride).walkingPace).toBeUndefined()
  })

  it('survives the digest’s round trip and reaches the library summary', () => {
    const digest = digestActivity(runAt(WALK))
    expect(parseDigest(serializeDigest(digest)).walkingPace).toBe(true)
    expect(summaryOf(digest).walkingPace).toBe(true)
    const other = digestActivity(runAt(3))
    expect('walkingPace' in parseDigest(serializeDigest(other))).toBe(false)
    expect('walkingPace' in summaryOf(other)).toBe(false)
  })
})
