import { describe, expect, it } from 'vitest'
import { fadeLede, hardLaps, repFadeOf, REP_FADE, similarLengths } from './intervalFade'
import { repsTrace } from './workbenchFixtures'
import type { Stretch } from './workbenchFixtures'

/** Six 5 min reps at 3.7 m/s falling to 3.55 by rep 6, a 5 min jog between each, after a warm-up. */
function workout(options: { recoveries?: boolean; speeds?: number[] } = {}) {
  const { recoveries = true, speeds = [3.7, 3.68, 3.64, 3.6, 3.57, 3.55] } = options
  const stretches: Stretch[] = [{ seconds: 600, speed: 2.6, heartRate: 120 }]
  const laps: [number, number][] = [[0, 600]]
  let at = 600
  speeds.forEach((speed, i) => {
    stretches.push({ seconds: 300, speed, heartRate: 150 + i * 2 })
    laps.push([at, at + 300])
    at += 300
    if (recoveries) {
      stretches.push({ seconds: 300, speed: 2.2, heartRate: 135 })
      laps.push([at, at + 300])
      at += 300
    }
  })
  return repsTrace('run', stretches, laps)
}

describe('similarLengths', () => {
  it('takes the largest set of lengths within 20% of its middle, in order', () => {
    const lengths = [600, 300, 310, 290, 305, 1200]
    expect(similarLengths(lengths, () => 0)).toEqual([1, 2, 3, 4])
  })

  it('leaves out a length more than 20% from the middle one', () => {
    expect(similarLengths([300, 300, 300, 361], () => 0)).toEqual([0, 1, 2])
    expect(similarLengths([300, 300, 300, 359], () => 0)).toEqual([0, 1, 2, 3])
  })

  it('breaks a tie for the set with the higher score, so reps win over their recoveries', () => {
    const lengths = [100, 300, 100, 300, 100, 300]
    const score = (i: number) => (i % 2 === 0 ? 1 : 5)
    expect(similarLengths(lengths, score)).toEqual([1, 3, 5])
  })

  it('finds nothing in nothing', () => {
    expect(similarLengths([], () => 0)).toEqual([])
  })
})

describe('hardLaps', () => {
  const outputs = [3.7, 2.2, 3.6, 2.2, 3.5]
  it('keeps the laps above a split of 15% or more, in order', () => {
    expect(hardLaps([0, 1, 2, 3, 4], (i) => outputs[i]!)).toEqual([0, 2, 4])
  })

  it('keeps every lap when none splits from the rest', () => {
    expect(hardLaps([0, 2, 4], (i) => outputs[i]!)).toEqual([0, 2, 4])
    expect(REP_FADE.splitGap).toBe(0.15)
  })
})

describe('fadeLede', () => {
  it('names the rep that differs most from rep 1, as slower', () => {
    expect(fadeLede('speed', [3.7, 3.65, 3.6, 3.55, 3.5, 3.55])).toBe(
      'Rep 5 was 5% slower than rep 1.',
    )
  })

  it('names a faster rep as faster', () => {
    expect(fadeLede('speed', [3.5, 3.55, 3.7])).toBe('Rep 3 was 6% faster than rep 1.')
  })

  it('says power as more or less power', () => {
    expect(fadeLede('power', [300, 295, 288])).toBe('Rep 3 averaged 4% less power than rep 1.')
    expect(fadeLede('power', [300, 320, 310])).toBe('Rep 2 averaged 7% more power than rep 1.')
  })

  it('says the reps stayed within the whole percent of their widest gap when it is 2% or less', () => {
    expect(fadeLede('speed', [3.7, 3.68, 3.65])).toBe('Your reps stayed within 1%.')
    expect(fadeLede('speed', [3.7, 3.64, 3.63])).toBe('Your reps stayed within 2%.')
    expect(fadeLede('speed', [3.7, 3.7, 3.7])).toBe('Your reps stayed within 1%.')
    expect(fadeLede('speed', [3.7, 3.62, 3.6])).toBe('Rep 3 was 3% slower than rep 1.')
  })
})

describe('repFadeOf', () => {
  it('finds the hard laps among warm-up and recoveries, and says how the last compared with the first', () => {
    const fade = repFadeOf(workout())!
    expect(fade.reps.map((r) => [r.number, r.lapNumber])).toEqual([
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
      [5, 10],
      [6, 12],
    ])
    expect(fade.recorded).toBe(true)
    expect(fade.metric).toBe('speed')
    expect(fade.lede).toBe('Rep 6 was 4% slower than rep 1.')
    expect(fade.reps[0]!.bounds).toEqual({ startS: 600, endS: 900 })
    expect(fade.reps[0]!.heartRate).toBe(150)
    expect(fade.reps[0]!.output).toBeCloseTo(3.7, 5)
  })

  it('says the reps stayed level when they did', () => {
    const fade = repFadeOf(workout({ speeds: [3.7, 3.69, 3.7, 3.71, 3.7, 3.69] }))!
    expect(fade.lede).toBe('Your reps stayed within 1%.')
  })

  it('has no reps in fewer than 3 laps of one length', () => {
    expect(repFadeOf(workout({ speeds: [3.7, 3.6] }))).toBeNull()
  })

  it('has no reps in laps of different lengths', () => {
    const trace = repsTrace(
      'run',
      [
        { seconds: 300, speed: 3.5 },
        { seconds: 600, speed: 3.5 },
        { seconds: 900, speed: 3.5 },
        { seconds: 1200, speed: 3.5 },
      ],
      [
        [0, 300],
        [300, 900],
        [900, 1800],
        [1800, 3000],
      ],
    )
    expect(repFadeOf(trace)).toBeNull()
  })

  it('treats laps that run straight into each other as splits, not reps', () => {
    const trace = repsTrace(
      'run',
      [3.5, 3.4, 3.3, 3.2].map((speed) => ({ seconds: 300, speed })),
      [
        [0, 300],
        [300, 600],
        [600, 900],
        [900, 1200],
      ],
    )
    expect(repFadeOf(trace)).toBeNull()
  })

  it('reads a ride by its power, and a ride without power by its speed', () => {
    const ride = repsTrace(
      'ride',
      [
        { seconds: 300, power: 150, speed: 7 },
        { seconds: 240, power: 300, speed: 9 },
        { seconds: 240, power: 100, speed: 5 },
        { seconds: 240, power: 292, speed: 9 },
        { seconds: 240, power: 100, speed: 5 },
        { seconds: 240, power: 280, speed: 9 },
      ],
      [
        [300, 540],
        [780, 1020],
        [1260, 1500],
      ],
    )
    const fade = repFadeOf(ride)!
    expect(fade.metric).toBe('power')
    expect(fade.lede).toBe('Rep 3 averaged 7% less power than rep 1.')
    const speedOnly = repsTrace(
      'ride',
      [
        { seconds: 240, speed: 9 },
        { seconds: 60, speed: 4 },
        { seconds: 240, speed: 8.7 },
        { seconds: 60, speed: 4 },
        { seconds: 240, speed: 8.2 },
      ],
      [
        [0, 240],
        [300, 540],
        [600, 840],
      ],
    )
    const slower = repFadeOf(speedOnly)!
    expect(slower.metric).toBe('speed')
    expect(slower.lede).toBe('Rep 3 was 9% slower than rep 1.')
  })

  it('uses intervals found in the readings when the device recorded no laps', () => {
    const stretches: Stretch[] = [{ seconds: 120, power: 100, heartRate: 110 }]
    for (const power of [300, 296, 288, 280]) {
      stretches.push(
        { seconds: 150, power, heartRate: 160 },
        { seconds: 120, power: 100, heartRate: 130 },
      )
    }
    const fade = repFadeOf(repsTrace('ride', stretches))!
    expect(fade.recorded).toBe(false)
    expect(fade.reps).toHaveLength(4)
    expect(fade.lede).toMatch(/^Rep 4 averaged [5-7]% less power than rep 1\.$/)
  })

  it('leaves out a lap with no reading of the measure, and has no heart rate for one without', () => {
    const rep = (speed: number | undefined, heartRate?: number) => [
      { seconds: 300, speed, heartRate },
      { seconds: 60, speed: 2 },
    ]
    const trace = repsTrace(
      'run',
      [rep(3.7, 150), rep(undefined), rep(3.6), rep(3.5), rep(3.45)].flat(),
      [0, 1, 2, 3, 4].map((i) => [i * 360, i * 360 + 300] as const),
    )
    const fade = repFadeOf(trace)!
    expect(fade.reps.map((r) => r.lapNumber)).toEqual([1, 3, 4, 5])
    expect(fade.reps.map((r) => r.heartRate)).toEqual([150, null, null, null])
  })
})
