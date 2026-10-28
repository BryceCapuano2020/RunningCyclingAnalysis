import { describe, expect, it } from 'vitest'
import { runCost } from '@rca/core/metabolic'
import { fadeLede, hardLaps, repFadeOf, REP_FADE, similarLengths } from './intervalFade'
import { repsTrace } from './workbenchFixtures'
import type { Stretch } from './workbenchFixtures'

const OUTDOOR = { indoor: false }
const INDOOR = { indoor: true }

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
  const alone = (values: number[]) =>
    hardLaps(
      values.map((_, i) => i),
      (i) => values[i]!,
    )

  it('keeps the laps above a split of 15% or more that alternate with the easy ones', () => {
    expect(hardLaps([0, 1, 2, 3, 4], (i) => outputs[i]!)).toEqual([0, 2, 4])
  })

  it('leaves out the recovery that follows the last rep, and a warm-up before the first', () => {
    expect(alone([3.7, 2.2, 3.6, 2.2, 3.5, 2.2])).toEqual([0, 2, 4])
    expect(alone([2.6, 3.7, 2.2, 3.6, 2.2, 3.5])).toEqual([1, 3, 5])
  })

  it('keeps a last rep that fell to the pace of the recoveries, since it sits where a rep does', () => {
    expect(alone([3.7, 2.2, 3.6, 2.2, 3.5, 2.2, 2.74, 2.2])).toEqual([0, 2, 4, 6])
  })

  it('keeps a slow last or lone rep when nothing alternates with the hard laps', () => {
    expect(alone([5, 5, 5, 4.2])).toEqual([0, 1, 2, 3])
    expect(alone([5, 5, 4.2, 5])).toEqual([0, 1, 2, 3])
    expect(alone([4.2, 5, 5, 5])).toEqual([0, 1, 2, 3])
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
    expect(fadeLede('flatSpeed', [3.5, 3.55, 3.7])).toBe('Rep 3 was 6% faster than rep 1.')
  })

  it('says power as more or less power', () => {
    expect(fadeLede('power', [300, 295, 288])).toBe('Rep 3 averaged 4% less power than rep 1.')
    expect(fadeLede('power', [300, 320, 310])).toBe('Rep 2 averaged 7% more power than rep 1.')
  })

  it('says the reps stayed within the next whole percent above their widest gap, when it is 2% or less', () => {
    expect(fadeLede('speed', [3.7, 3.68, 3.65])).toBe('Your reps stayed within 2%.')
    expect(fadeLede('speed', [3.7, 3.64, 3.63])).toBe('Your reps stayed within 2%.')
    expect(fadeLede('speed', [3.7, 3.7, 3.7])).toBe('Your reps stayed within 1%.')
    expect(fadeLede('speed', [100, 99.4, 100.3])).toBe('Your reps stayed within 1%.')
  })

  it('does not call a gap over 2% within 2%, even when it rounds to 2%', () => {
    expect(fadeLede('speed', [100, 97.6])).toBe('Rep 2 was 2% slower than rep 1.')
    expect(fadeLede('speed', [3.7, 3.62, 3.6])).toBe('Rep 3 was 3% slower than rep 1.')
  })
})

describe('repFadeOf', () => {
  it('finds the hard laps among warm-up and recoveries, and says how the last compared with the first', () => {
    const fade = repFadeOf(workout(), OUTDOOR)!
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

  it('keeps a last rep that collapsed, between the recoveries, and says how far it fell', () => {
    const fade = repFadeOf(workout({ speeds: [3.7, 3.68, 3.64, 3.6, 3.57, 2.74] }), OUTDOOR)!
    expect(fade.reps).toHaveLength(6)
    expect(fade.lede).toBe('Rep 6 was 26% slower than rep 1.')
  })

  it('keeps a last rep that collapsed when the rests between reps are not laps', () => {
    const rep = (speed: number) => [
      { seconds: 300, speed },
      { seconds: 60, speed: 2 },
    ]
    const trace = repsTrace(
      'run',
      [5, 5, 5, 4.2].flatMap(rep),
      [0, 1, 2, 3].map((i) => [i * 360, i * 360 + 300] as const),
    )
    const fade = repFadeOf(trace, OUTDOOR)!
    expect(fade.reps).toHaveLength(4)
    expect(fade.lede).toBe('Rep 4 was 16% slower than rep 1.')
  })

  it('says the reps stayed level when they did', () => {
    const fade = repFadeOf(workout({ speeds: [3.7, 3.69, 3.7, 3.71, 3.7, 3.69] }), OUTDOOR)!
    expect(fade.lede).toBe('Your reps stayed within 1%.')
  })

  it('has no reps in fewer than 3 laps of one length', () => {
    expect(repFadeOf(workout({ speeds: [3.7, 3.6] }), OUTDOOR)).toBeNull()
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
    expect(repFadeOf(trace, OUTDOOR)).toBeNull()
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
    expect(repFadeOf(trace, OUTDOOR)).toBeNull()
  })

  it('reads a ride by its power when every rep has it', () => {
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
    const fade = repFadeOf(ride, OUTDOOR)!
    expect(fade.metric).toBe('power')
    expect(fade.lede).toBe('Rep 3 averaged 7% less power than rep 1.')
  })

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

  it('reads a trainer ride without power by its speed, and gives a road ride without power no table', () => {
    const slower = repFadeOf(speedOnly, INDOOR)!
    expect(slower.metric).toBe('speed')
    expect(slower.lede).toBe('Rep 3 was 9% slower than rep 1.')
    expect(repFadeOf(speedOnly, OUTDOOR)).toBeNull()
  })

  it('does not read a ride by speed when one rep has no power, nor drop that rep', () => {
    const ride = repsTrace(
      'ride',
      [
        { seconds: 240, power: 300, speed: 9 },
        { seconds: 60, power: 100, speed: 4 },
        { seconds: 240, power: 290, speed: 9 },
        { seconds: 60, power: 100, speed: 4 },
        { seconds: 240, speed: 9 },
      ],
      [
        [0, 240],
        [300, 540],
        [600, 840],
      ],
    )
    expect(repFadeOf(ride, OUTDOOR)).toBeNull()
    const trainer = repFadeOf(ride, INDOOR)!
    expect(trainer.metric).toBe('speed')
    expect(trainer.reps).toHaveLength(3)
  })

  it('uses intervals found in the readings when the device recorded no laps', () => {
    const stretches: Stretch[] = [{ seconds: 120, power: 100, heartRate: 110 }]
    for (const power of [300, 296, 288, 280]) {
      stretches.push(
        { seconds: 150, power, heartRate: 160 },
        { seconds: 120, power: 100, heartRate: 130 },
      )
    }
    const fade = repFadeOf(repsTrace('ride', stretches), OUTDOOR)!
    expect(fade.recorded).toBe(false)
    expect(fade.reps).toHaveLength(4)
    expect(fade.lede).toMatch(/^Rep 4 averaged [5-7]% less power than rep 1\.$/)
  })

  it('has no table when a lap of the set has no reading, rather than dropping it', () => {
    const rep = (speed: number | undefined, heartRate?: number) => [
      { seconds: 300, speed, heartRate },
      { seconds: 60, speed: 2 },
    ]
    const trace = repsTrace(
      'run',
      [rep(3.7, 150), rep(undefined), rep(3.6), rep(3.5), rep(3.45)].flat(),
      [0, 1, 2, 3, 4].map((i) => [i * 360, i * 360 + 300] as const),
    )
    expect(repFadeOf(trace, OUTDOOR)).toBeNull()
  })

  describe('a run on hills', () => {
    const FLAT_SPEED = 3.5
    const GRADE = 0.04
    // The speed that costs as much on the grade as 3.5 m/s does on the flat.
    const hillSpeed = (FLAT_SPEED * runCost(0)) / runCost(GRADE)
    const rep = (hill: boolean): Stretch[] => [
      hill
        ? { seconds: 600, speed: hillSpeed, climb: GRADE * hillSpeed, heartRate: 160 }
        : { seconds: 600, speed: FLAT_SPEED, climb: 0, heartRate: 160 },
      { seconds: 120, speed: 2, climb: 0 },
    ]
    const stretches = [false, true, false, false].flatMap(rep)
    const laps = [0, 1, 2, 3].map((i) => [i * 720, i * 720 + 600] as const)

    it('reads each rep as a flat pace, so the hilly one does not pass for a fade', () => {
      const fade = repFadeOf(repsTrace('run', stretches, laps), OUTDOOR)!
      expect(fade.metric).toBe('flatSpeed')
      expect(fade.lede).toMatch(/^Your reps stayed within [1-4]%\.$/)
    })

    it('reads the pace as recorded when the run has no altitude', () => {
      const flat = stretches.map(({ climb: _climb, ...rest }) => rest)
      const fade = repFadeOf(repsTrace('run', flat, laps), OUTDOOR)!
      expect(fade.metric).toBe('speed')
      expect(fade.lede).toMatch(/^Rep 2 was \d+% slower than rep 1\.$/)
    })
  })
})
