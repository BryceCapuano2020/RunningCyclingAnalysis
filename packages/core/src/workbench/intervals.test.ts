import { describe, expect, it } from 'vitest'
import { detectIntervals } from './intervals'
import type { ActivityTrace } from './types'

type Stretch = [seconds: number, level: number]

/**
 * A trace whose stream holds each level for its seconds, in order, with a little deterministic noise. A run is
 * read by speed (m/s), a ride by power (W); `stream` says which is recorded. NaN is a second with no reading.
 */
function plan(
  sport: 'run' | 'ride',
  stretches: Stretch[],
  stream: 'speed' | 'power' = sport === 'run' ? 'speed' : 'power',
): ActivityTrace {
  const levels = stretches.flatMap(([seconds, level]) => new Array<number>(seconds).fill(level))
  const n = levels.length
  const values = Float32Array.from(levels, (level, i) => level * (1 + (((i * 7) % 5) - 2) * 0.015))
  return {
    version: 1,
    activityId: 'plan',
    sport,
    durationS: n,
    distance: Float64Array.from({ length: n }, (_, i) => i * 3),
    paused: new Uint8Array(n),
    unrecorded: new Uint8Array(n),
    streams: { [stream]: values },
    laps: [],
  }
}

const run = (...stretches: Stretch[]) => plan('run', stretches)
const ride = (...stretches: Stretch[]) => plan('ride', stretches)

/** A session of `k` efforts of `work` seconds at `hard`, each followed by `rest` seconds at `easy`. */
function session(k: number, work: number, rest: number, hard: number, easy: number): Stretch[] {
  const out: Stretch[] = []
  for (let i = 0; i < k; i++) out.push([work, hard], [rest, easy])
  return out
}

const near = (found: number, wanted: number, within = 12) => Math.abs(found - wanted) <= within

/**
 * Where each effort of a session starts and ends, for a session that begins at `from` seconds.
 */
function expectSession(
  found: { startS: number; endS: number }[],
  from: number,
  k: number,
  work: number,
  rest: number,
) {
  expect(found).toHaveLength(k)
  found.forEach((lap, i) => {
    const start = from + i * (work + rest)
    expect(near(lap.startS, start) && near(lap.endS, start + work)).toBe(true)
  })
}

describe('inferred intervals', () => {
  describe('finds repeated efforts', () => {
    it('as editable inferred intervals, placed at the step', () => {
      const found = detectIntervals(run([600, 2.8], ...session(5, 300, 120, 3.5, 2.5), [300, 2.7]))
      expect(found.every((lap) => lap.label === 'Inferred interval')).toBe(true)
      expectSession(found, 600, 5, 300, 120)
    })

    it('when the work is most of the session, as 8 x 4 min with 90 to 180 s of rest', () => {
      for (const rest of [90, 120, 180]) {
        const found = detectIntervals(
          run([600, 2.8], ...session(8, 240, rest, 3.5, 2.2), [300, 2.7]),
        )
        expectSession(found, 600, 8, 240, rest)
      }
    })

    it('as 5 x 5 min with a 2 min jog, and as 4 x 8 min at +15%', () => {
      expectSession(
        detectIntervals(run([600, 2.8], ...session(5, 300, 120, 3.5, 2.3), [300, 2.7])),
        600,
        5,
        300,
        120,
      )
      expectSession(
        detectIntervals(run([600, 2.8], ...session(4, 480, 120, 3.22, 2.5), [300, 2.7])),
        600,
        4,
        480,
        120,
      )
    })

    it('as the work, not the recovery, when work and recovery are half the session each', () => {
      const found = detectIntervals(ride([120, 100], ...session(4, 150, 150, 300, 100)))
      expectSession(found, 120, 4, 150, 150)
    })

    it('on a third level: a warm-up above the jog and below the work', () => {
      const found = detectIntervals(run([900, 2.8], ...session(6, 180, 120, 3.6, 2.0), [300, 2.6]))
      expectSession(found, 900, 6, 180, 120)
    })

    it('in short reps: 10 x 30 s, 10 x 45 s and 8 x 60 s', () => {
      expectSession(
        detectIntervals(run([600, 2.8], ...session(10, 30, 90, 4.2, 2.5), [300, 2.7])),
        600,
        10,
        30,
        90,
      )
      expectSession(
        detectIntervals(run([600, 2.8], ...session(10, 45, 75, 3.9, 2.5), [300, 2.7])),
        600,
        10,
        45,
        75,
      )
      expectSession(
        detectIntervals(run([600, 2.8], ...session(8, 60, 120, 3.8, 2.5), [300, 2.7])),
        600,
        8,
        60,
        120,
      )
    })

    it('on a ride, from power: 12 x 30 s, 8 x 1 min, 6 x 3 min and 2 x 20 min', () => {
      expectSession(
        detectIntervals(ride([600, 150], ...session(12, 30, 30, 300, 110), [300, 130])),
        600,
        12,
        30,
        30,
      )
      expectSession(
        detectIntervals(ride([600, 150], ...session(8, 60, 60, 220, 110), [300, 130])),
        600,
        8,
        60,
        60,
      )
      expectSession(
        detectIntervals(ride([600, 150], ...session(6, 180, 180, 210, 110), [300, 130])),
        600,
        6,
        180,
        180,
      )
      expectSession(
        detectIntervals(ride([600, 150], ...session(2, 1200, 600, 190, 110), [300, 130])),
        600,
        2,
        1200,
        600,
      )
    })

    it('after a walk to the start, or a start with no reading', () => {
      expectSession(
        detectIntervals(run([30, 1.5], ...session(5, 120, 180, 4.5, 3))),
        30,
        5,
        120,
        180,
      )
      expectSession(
        detectIntervals(run([60, Number.NaN], [400, 3], ...session(2, 120, 200, 5, 3), [300, 3])),
        460,
        2,
        120,
        200,
      )
    })

    it('of any length when the levels are far apart, as in a test of 3, 6, 12 and 20 minute efforts', () => {
      const found = detectIntervals(
        ride(
          [900, 120],
          [180, 300],
          [300, 100],
          [360, 280],
          [400, 100],
          [720, 260],
          [500, 100],
          [1200, 250],
          [600, 100],
        ),
      )
      expect(found).toHaveLength(4)
    })

    it('of a fartlek, when the surges are far above the easy running', () => {
      const found = detectIntervals(
        run([600, 2.5], [60, 5.2], [240, 2.5], [150, 5.2], [300, 2.5], [90, 5.2], [400, 2.5]),
      )
      expect(found).toHaveLength(3)
    })

    it('splits an effort at a paused or unrecorded stretch inside it', () => {
      const item = run([600, 2.8], ...session(3, 290, 150, 3.6, 2.4), [300, 2.7])
      for (let i = 745; i < 751; i++) item.paused[i] = 1
      for (let i = 1180; i < 1183; i++) item.unrecorded[i] = 1
      const found = detectIntervals(item)
      expect(found).toHaveLength(5)
      for (const lap of found) {
        for (let i = lap.startS; i < lap.endS; i++) {
          expect(item.paused[i] === 1 || item.unrecorded[i] === 1).toBe(false)
        }
      }
    })
  })

  describe('leaves one sustained change alone', () => {
    // The progressive run, negative split, tempo finish, walk-in and warm-up around a block give a whole-activity
    // interval or an interval at the wrong end on main; the cases marked otherwise are kept as they were.
    it('a steady run (main gives nothing here either)', () => {
      expect(detectIntervals(run([3000, 2.8]))).toEqual([])
    })

    it('a progressive run', () => {
      const steps = Array.from({ length: 10 }, (_, k): Stretch => [300, 2.6 + k * 0.1])
      expect(detectIntervals(run(...steps))).toEqual([])
    })

    it('a negative split', () => {
      expect(detectIntervals(run([1500, 3], [1500, 3.6]))).toEqual([])
    })

    it('a tempo finish after an easy start', () => {
      expect(detectIntervals(run([1800, 2.8], [900, 3.8]))).toEqual([])
      expect(detectIntervals(run([1200, 2.8], [1200, 2.8], [600, 3.8]))).toEqual([])
    })

    it('a warm-up and a cool-down around a block of 20 to 25 minutes', () => {
      for (const block of [1200, 1500]) {
        expect(detectIntervals(run([600, 2.7], [block, 3.7], [300, 2.6]))).toEqual([])
      }
      // A 5k race: a walk to the line, 21 minutes at pace, a walk back.
      expect(detectIntervals(run([600, 1.8], [1260, 3.9], [400, 1.5]))).toEqual([])
    })

    it('a short block between a warm-up and a cool-down', () => {
      expect(detectIntervals(run([900, 2.7], [480, 3.8], [900, 2.6]))).toEqual([])
    })

    it('a tempo block that dips across the threshold for a few seconds', () => {
      const item = run([1800, 2.8], [900, 3.8], [900, 2.8])
      const speed = item.streams.speed!
      for (let i = 2000; i < 2012; i++) speed[i] = 2.8
      expect(detectIntervals(item)).toEqual([])
    })

    it('a tempo block with a stop in it', () => {
      const item = run([1200, 2.8], [900, 3.8], [900, 2.8])
      for (let i = 1700; i < 1760; i++) item.paused[i] = 1
      expect(detectIntervals(item)).toEqual([])
    })

    it('a steady run that starts with a walk', () => {
      expect(detectIntervals(run([30, 1.5], [3000, 3]))).toEqual([])
    })

    it('a steady run that starts with no reading (main gives nothing here either)', () => {
      expect(detectIntervals(run([60, Number.NaN], [3000, 3]))).toEqual([])
    })

    it('a long run with walk breaks, whose running is most of the activity', () => {
      expect(
        detectIntervals(run([2400, 2.8], [90, 1.2], [2400, 2.8], [90, 1.2], [2400, 2.8])),
      ).toEqual([])
    })

    it('stops at traffic lights, which are no pace (main gives nothing here either)', () => {
      const item = run([600, 3], [40, 0.2], [600, 3], [40, 0.2], [600, 3], [40, 0.2], [600, 3])
      expect(detectIntervals(item)).toEqual([])
    })

    it('a run that fades over two hours (main gives nothing here either)', () => {
      const fade = Array.from({ length: 24 }, (_, i): Stretch => [300, 3.2 - i * 0.025])
      expect(detectIntervals(run(...fade))).toEqual([])
    })
  })

  describe('reads the stream that says effort', () => {
    it('suggests nothing for a ride without power, whatever its speed does', () => {
      const item = plan('ride', [[600, 6], ...session(8, 180, 180, 9, 5), [300, 6]], 'speed')
      expect(detectIntervals(item)).toEqual([])
    })

    it('reads a ride by power even when it has speed too', () => {
      const item = ride([600, 150], ...session(6, 180, 180, 210, 110), [300, 130])
      item.streams.speed = Float32Array.from({ length: item.durationS }, () => 8)
      expect(detectIntervals(item)).toHaveLength(6)
    })

    it('reads a run by speed when it has no power', () => {
      expect(
        detectIntervals(run([600, 2.8], ...session(5, 300, 120, 3.5, 2.5), [300, 2.7])),
      ).toHaveLength(5)
    })

    it('suggests nothing from a trace with neither, or too short to read', () => {
      const item = run([240, 3])
      delete item.streams.speed
      expect(detectIntervals(item)).toEqual([])
      expect(detectIntervals(run([30, 3]))).toEqual([])
    })
  })

  describe('leaves out the seconds the quality assessment left out', () => {
    it('does not take flagged dropouts of a power meter for efforts', () => {
      // Three 40 s stretches of 900 W in a steady ride, flagged as spikes.
      const item = ride(
        [900, 180],
        [40, 900],
        [500, 180],
        [40, 900],
        [500, 180],
        [40, 900],
        [900, 180],
      )
      expect(detectIntervals(item)).toHaveLength(3)
      const flagged = new Uint8Array(item.durationS)
      for (const start of [900, 1440, 1980]) flagged.fill(1, start, start + 40)
      item.unusable = { power: flagged }
      expect(detectIntervals(item)).toEqual([])
    })

    it('still finds the real efforts around flagged seconds', () => {
      const item = ride([600, 150], ...session(5, 180, 180, 210, 110), [300, 130])
      const flagged = new Uint8Array(item.durationS)
      for (let i = 1000; i < 1010; i++) {
        item.streams.power![i] = 1500
        flagged[i] = 1
      }
      item.unusable = { power: flagged }
      expect(detectIntervals(item)).toHaveLength(5)
    })
  })
})
