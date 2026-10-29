import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { detectIntervals } from './intervals'
import type { ActivityTrace } from './types'

/**
 * The shapes of sessions and of ordinary runs that interval detection has to get right, as a table with the
 * number of intervals each must give. Rows marked `limit` are known limits, kept at what they give today so a
 * change shows: a speed-only detector cannot tell a hill or a rolling road from a repeat, or a foot hill repeat
 * from its recoveries (the work is always the faster level), and an effort that touches the start or the end of
 * the recording is dropped.
 */
type Stretch = [seconds: number, level: number]

function make(stretches: Stretch[], sport: 'run' | 'ride' = 'run', noise = 0.04): ActivityTrace {
  const random = mulberry32(7)
  const levels = stretches.flatMap(([seconds, level]) => new Array<number>(seconds).fill(level))
  const n = levels.length
  const values = Float32Array.from(levels, (level) => level * (1 + (random() - 0.5) * 2 * noise))
  return {
    version: 1,
    activityId: 'shape',
    sport,
    durationS: n,
    distance: new Float64Array(n),
    paused: new Uint8Array(n),
    unrecorded: new Uint8Array(n),
    streams: sport === 'run' ? { speed: values } : { power: values },
    laps: [],
  }
}

const min = (minutes: number) => minutes * 60
const WARM: Stretch[] = [[min(10), 2.7]]
const COOL: Stretch[] = [[min(8), 2.6]]
const reps = (work: number, workSpeed: number, rest: number, restSpeed: number, k: number) =>
  Array.from({ length: k }, (): Stretch[] => [
    [work, workSpeed],
    [rest, restSpeed],
  ]).flat()
const sequence = (works: number[], workSpeed: number, rest: number, restSpeed: number) =>
  works.flatMap((work): Stretch[] => [
    [work, workSpeed],
    [rest, restSpeed],
  ])
const cycles = (k: number, ...stretches: Stretch[]) =>
  Array.from({ length: k }, () => stretches).flat()

interface Shape {
  name: string
  trace: ActivityTrace
  count: number
  limit?: boolean
}

const shapes: Shape[] = [
  // Varying lengths: main finds all of these, and so does the split.
  {
    name: 'pyramid 1-2-3-4-3-2-1 min, 90 s jog',
    count: 7,
    trace: make([...WARM, ...sequence([60, 120, 180, 240, 180, 120, 60], 4.0, 90, 2.3), ...COOL]),
  },
  {
    name: 'pyramid 2-4-6-4-2 min, 2 min jog',
    count: 5,
    trace: make([...WARM, ...sequence([120, 240, 360, 240, 120], 3.9, 120, 2.3), ...COOL]),
  },
  {
    name: 'ladder 400-800-1200-800-400 m, 90 s jog',
    count: 5,
    trace: make([...WARM, ...sequence([100, 200, 300, 200, 100], 4.2, 90, 2.3), ...COOL]),
  },
  {
    name: 'ladder 1 to 5 min, 1 min rest',
    count: 5,
    trace: make([...WARM, ...sequence([60, 120, 180, 240, 300], 4.0, 60, 2.3), ...COOL]),
  },
  {
    name: 'descending 5-4-3-2-1 min, 90 s',
    count: 5,
    trace: make([...WARM, ...sequence([300, 240, 180, 120, 60], 4.0, 90, 2.3), ...COOL]),
  },
  {
    name: '3 x (2 min hard, 1 min easy) then 3 x (1 min, 1 min)',
    count: 6,
    trace: make([...WARM, ...reps(120, 4, 60, 2.3, 3), ...reps(60, 4.2, 60, 2.3, 3), ...COOL]),
  },
  {
    name: 'fartlek of random 45 to 150 s surges at a moderate contrast',
    count: 0,
    limit: true,
    trace: make([
      ...WARM,
      [min(4), 2.7],
      [75, 4],
      [min(3), 2.7],
      [150, 4],
      [min(2), 2.7],
      [45, 4.2],
      [min(4), 2.7],
      [100, 4],
      [min(3), 2.7],
      ...COOL,
    ]),
  },
  {
    name: 'fartlek surges far above easy running',
    count: 3,
    trace: make([
      [600, 2.5],
      [60, 5.2],
      [240, 2.5],
      [150, 5.2],
      [300, 2.5],
      [90, 5.2],
      [400, 2.5],
    ]),
  },
  // Cruise, short reps, long rests.
  {
    name: 'cruise 3 x 10 min at +12%, 2 min jog',
    count: 3,
    trace: make([...WARM, ...reps(min(10), 3.2, 120, 2.6, 3), ...COOL]),
  },
  {
    name: 'cruise 3 x 10 min at +8%',
    count: 0,
    limit: true,
    trace: make([...WARM, ...reps(min(10), 3.05, 120, 2.7, 3), ...COOL]),
  },
  {
    name: '400s: 12 x (90 s fast, 60 s jog)',
    count: 12,
    trace: make([...WARM, ...reps(90, 4.4, 60, 2.2, 12), ...COOL]),
  },
  {
    name: '400s: 12 x (80 s fast, 55 s jog)',
    count: 12,
    trace: make([...WARM, ...reps(80, 4.6, 55, 2.0, 12), ...COOL]),
  },
  {
    name: 'track: 6 x 800 m, a 6 min rest, then 6 x 400 m',
    count: 12,
    trace: make([
      ...WARM,
      ...reps(190, 4.2, 120, 2.4, 6),
      [min(6), 1.5],
      ...reps(90, 4.6, 60, 2.2, 6),
      ...COOL,
    ]),
  },
  {
    name: 'track: 4 x 1 km, an 8 min rest, 4 x 200 m',
    count: 8,
    trace: make([
      ...WARM,
      ...reps(240, 4.2, 120, 2.4, 4),
      [min(8), 1.5],
      ...reps(40, 5, 60, 2.2, 4),
      ...COOL,
    ]),
  },
  {
    name: 'track: 3 x 1600 m, a 12 min rest, 4 x 200 m',
    count: 7,
    trace: make([
      ...WARM,
      ...reps(420, 4.0, 180, 2.0, 3),
      [min(12), 1.5],
      ...reps(40, 5, 70, 2.0, 4),
      ...COOL,
    ]),
  },
  {
    name: 'strides: 6 x 20 s at the end of an easy run, then a walk',
    count: 5,
    limit: true,
    trace: make([[min(30), 2.8], ...reps(20, 4.8, 60, 1.5, 6), [min(5), 2.6]]),
  },
  {
    name: 'workout with no warm-up: the first rep touches the start',
    count: 5,
    limit: true,
    trace: make([...reps(120, 4, 90, 2.3, 6), ...COOL]),
  },
  {
    name: 'workout with no cool-down: the last rep touches the end',
    count: 6,
    trace: make([...WARM, ...reps(120, 4, 90, 2.3, 6)]),
  },
  {
    name: 'two efforts of 20 min at 250 W (a large gap)',
    count: 2,
    trace: make(
      [
        [min(20), 130],
        [min(20), 250],
        [min(10), 120],
        [min(20), 250],
        [min(15), 110],
      ],
      'ride',
      0.06,
    ),
  },
  {
    name: 'two efforts of 20 min at 200 W',
    count: 2,
    trace: make(
      [
        [min(20), 130],
        [min(20), 200],
        [min(10), 120],
        [min(20), 200],
        [min(15), 110],
      ],
      'ride',
      0.06,
    ),
  },
  {
    name: 'two efforts of 5 min at 5.0 over 2.0 m/s',
    count: 2,
    trace: make([
      [min(10), 2.0],
      [min(5), 5.0],
      [min(3), 2.0],
      [min(5), 5.0],
      [min(8), 2.0],
    ]),
  },
  {
    name: 'long run: easy, then the last 3 x 1 mile at marathon pace',
    count: 3,
    trace: make([[min(80), 2.8], ...reps(min(7), 3.4, 120, 2.8, 3), [min(10), 2.7]]),
  },
  // Runs that are not sessions.
  {
    name: 'treadmill: two steps of 1 km/h',
    count: 0,
    trace: make(
      [
        [min(10), 2.5],
        [min(10), 3.0],
        [min(10), 2.5],
        [min(10), 3.0],
      ],
      'run',
      0.005,
    ),
  },
  {
    name: 'treadmill: 1 km/h every 5 min up and down',
    count: 0,
    trace: make(
      [
        [min(5), 2.5],
        [min(5), 2.8],
        [min(5), 3.1],
        [min(5), 2.8],
        [min(5), 2.5],
      ],
      'run',
      0.003,
    ),
  },
  { name: 'treadmill: steady', count: 0, trace: make([[min(40), 2.78]], 'run', 0.003) },
  { name: 'city run: 12 stops of 25 s', count: 0, trace: make(cycles(12, [150, 3.0], [25, 0.1])) },
  {
    name: 'city run: stops of 40 s every 3 min',
    count: 0,
    trace: make(cycles(10, [140, 3.0], [40, 0.1])),
  },
  {
    name: 'city run: 20 s at 1.5 m/s every 2 min',
    count: 0,
    trace: make(cycles(12, [100, 3.0], [20, 1.5])),
  },
  {
    name: 'city run: 30 s of no reading every 4 min',
    count: 0,
    trace: make(cycles(8, [210, 3.0], [30, 0.2])),
  },
  {
    name: 'trail: 6 hike breaks of 3 min in a run',
    count: 0,
    trace: make([[min(10), 2.8], ...cycles(6, [min(8), 2.8], [min(3), 1.2])]),
  },
  {
    name: 'trail: hike breaks of 90 s every 6 min',
    count: 0,
    trace: make(cycles(8, [270, 2.8], [90, 1.2])),
  },
  {
    name: 'run/walk: 3 min of jogging, 1 min of walking',
    count: 0,
    trace: make(cycles(8, [180, 1.6], [60, 1.0])),
  },
  {
    name: 'rolling 4 min cycle of +-8%',
    count: 0,
    trace: make(cycles(10, [120, 3.15], [120, 2.85])),
  },
  // Known limits.
  {
    name: 'limit: trail climbs of 4 min at 2.0 among 6 min at 3.2',
    count: 4,
    limit: true,
    trace: make(cycles(5, [240, 2.0], [360, 3.2])),
  },
  {
    name: 'limit: five hills of 2 min at 2.2 on a road run at 3.0',
    count: 4,
    limit: true,
    trace: make([[min(8), 3.0], ...cycles(5, [120, 2.2], [min(4), 3.0])]),
  },
  {
    name: 'limit: rolling 4 min cycle of +-15%, the same shape as 2 min / 2 min repeats',
    count: 9,
    limit: true,
    trace: make(cycles(10, [120, 3.3], [120, 2.7])),
  },
  {
    name: 'limit: foot hill repeats, 150 s up then 240 s of jog down: the work is the faster level',
    count: 5,
    limit: true,
    trace: make([...WARM, ...reps(150, 2.0, 240, 3.0, 5), [min(5), 2.8]]),
  },
  {
    name: 'limit: foot hill repeats of 90 s up and 90 s down',
    count: 8,
    limit: true,
    trace: make([...WARM, ...reps(90, 1.8, 90, 3.2, 8), [min(5), 2.8]]),
  },
]

describe('interval shapes', () => {
  it.each(shapes.map((shape) => [shape.name, shape] as const))('%s', (_name, shape) => {
    expect(detectIntervals(shape.trace)).toHaveLength(shape.count)
  })

  it('finds 2 efforts at every power of work from 180 to 400 W, and 3 of 3', () => {
    for (const [efforts, minutes] of [
      [2, 20],
      [2, 10],
      [2, 5],
      [2, 3],
      [3, 20],
      [3, 5],
    ] as const) {
      for (const work of [180, 200, 220, 240, 260, 300, 350, 400]) {
        const stretches: Stretch[] = [[min(15), 120]]
        for (let i = 0; i < efforts; i++) stretches.push([min(minutes), work], [min(8), 110])
        stretches.push([min(10), 110])
        expect(detectIntervals(make(stretches, 'ride', 0.05))).toHaveLength(efforts)
      }
    }
  })
})
