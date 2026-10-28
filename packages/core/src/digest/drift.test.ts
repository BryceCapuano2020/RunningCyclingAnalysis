import { describe, expect, it } from 'vitest'
import { DRIFT } from '../constants'
import { steadyDrift } from './drift'
import type { DriftInput } from './drift'

const N = 7200

/** An effort of N moving seconds at the given output and heart rate for each second. */
function effort(
  output: (i: number) => number,
  heartRate: (i: number) => number,
  override: Partial<DriftInput> = {},
): DriftInput {
  return {
    sport: 'ride',
    output: Float64Array.from({ length: N }, (_, i) => output(i)),
    validOutput: new Uint8Array(N).fill(1),
    heartRate: Float64Array.from({ length: N }, (_, i) => heartRate(i)),
    validHeartRate: new Uint8Array(N).fill(1),
    moving: new Uint8Array(N).fill(1),
    ...override,
  }
}

describe('steadyDrift', () => {
  it('compares the two halves of the moving time after the warm-up', () => {
    // Halves of [600, 7200) are [600, 3900) and [3900, 7200).
    const drift = steadyDrift(
      effort(
        () => 200,
        (i) => (i < 3900 ? 140 : 150),
      ),
    )
    expect(drift).toEqual({ firstRatio: 200 / 140, secondRatio: 200 / 150, durationS: 6600 })
  })

  it('leaves the warm-up out, however different it was', () => {
    const drift = steadyDrift(
      effort(
        (i) => (i < 600 ? 50 : 200),
        (i) => (i < 600 ? 90 : 140),
      ),
    )
    expect(drift?.firstRatio).toBeCloseTo(200 / 140, 12)
  })

  it('is null for an activity with under an hour of moving time', () => {
    const input = effort(
      () => 200,
      () => 140,
    )
    input.moving.fill(0, 0, N - DRIFT.minMovingS + 1)
    expect(steadyDrift(input)).toBeNull()
    input.moving.fill(1, 0, 1)
    expect(steadyDrift(input)).not.toBeNull()
  })

  it('counts moving seconds, not elapsed ones, so a pause does not shift the halves', () => {
    const compact = effort(
      () => 200,
      (i) => (i < 3900 ? 140 : 150),
    )
    // The same effort with 600 paused seconds, whose stream holds zeros, inserted after 2,000 s.
    const at = 2000
    const insert = (xs: ArrayLike<number>, filler: number) =>
      Float64Array.from([
        ...Array.from(xs).slice(0, at),
        ...new Array<number>(600).fill(filler),
        ...Array.from(xs).slice(at),
      ])
    const moving = Uint8Array.from([
      ...Array.from(compact.moving).slice(0, at),
      ...new Array<number>(600).fill(0),
      ...Array.from(compact.moving).slice(at),
    ])
    const paused: DriftInput = {
      ...compact,
      output: insert(compact.output, 0),
      heartRate: insert(compact.heartRate, 0),
      validOutput: new Uint8Array(N + 600).fill(1),
      validHeartRate: new Uint8Array(N + 600).fill(1),
      moving,
    }
    expect(steadyDrift(paused)).toEqual(steadyDrift(compact))
  })

  it('is null when the 30 s outputs vary more than the sport allows', () => {
    // Alternating 150 W and 250 W blocks of a minute: a coefficient of variation of 0.25 about 200 W.
    const hard = (i: number) => (Math.floor(i / 60) % 2 === 0 ? 150 : 250)
    expect(steadyDrift(effort(hard, () => 140, { sport: 'ride' }))).not.toBeNull()
    expect(steadyDrift(effort(hard, () => 140, { sport: 'run' }))).toBeNull()
    const harder = (i: number) => (Math.floor(i / 60) % 2 === 0 ? 100 : 300)
    expect(steadyDrift(effort(harder, () => 140, { sport: 'ride' }))).toBeNull()
  })

  it('is null when the second half holds a different output from the first', () => {
    expect(
      steadyDrift(
        effort(
          (i) => (i < 3900 ? 200 : 230),
          () => 140,
        ),
      ),
    ).toBeNull()
    expect(
      steadyDrift(
        effort(
          (i) => (i < 3900 ? 200 : 215),
          () => 140,
        ),
      ),
    ).not.toBeNull()
  })

  it('is null when too few blocks of a half have both streams', () => {
    const input = effort(
      () => 200,
      () => 140,
    )
    // Every third 30 s block of the second half has no valid heart rate.
    for (let b = 130; b < 220; b += 3) input.validHeartRate.fill(0, b * 30, b * 30 + 30)
    expect(steadyDrift(input)).toBeNull()
    const few = effort(
      () => 200,
      () => 140,
    )
    for (let b = 130; b < 220; b += 10) few.validHeartRate.fill(0, b * 30, b * 30 + 30)
    expect(steadyDrift(few)).not.toBeNull()
  })

  it('is null without a positive output', () => {
    expect(
      steadyDrift(
        effort(
          () => 0,
          () => 140,
        ),
      ),
    ).toBeNull()
  })
})
