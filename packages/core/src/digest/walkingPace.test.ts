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

  it('is told by cadence when the file has it: a runner’s cadence is a run, a walker’s a walk', () => {
    const cadence = (steps: number) => (a: Activity) => {
      a.cadence = new Float32Array(a.n).fill(steps)
    }
    expect(digestActivity(runAt(WALK, 1800, cadence(165))).walkingPace).toBeUndefined()
    // A walker with a jog is still a walker when the cadence says so.
    const walker = (a: Activity) => {
      cadence(108)(a)
      a.speed.fill(3, 600, 800)
    }
    expect(digestActivity(runAt(WALK, 1800, walker)).walkingPace).toBe(true)
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
