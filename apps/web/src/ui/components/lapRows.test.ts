import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { hasRecordedLaps, lapCellsOf } from './lapRows'

/**
 * A run at 5 m/s for 80 s, then a 100 s gap the device did not time with the distance held through it,
 * then 5 m/s again to 300 s. The distance steps by `stepM` where the gap ends, at second 180.
 */
function gappedRun(stepM: number): ActivityTrace {
  const n = 300
  const distance = new Float64Array(n)
  const paused = new Uint8Array(n)
  const unrecorded = new Uint8Array(n)
  const speed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (i < 80) distance[i] = 5 * i
    else if (i < 180) distance[i] = 400
    else distance[i] = 400 + stepM + 5 * (i - 180)
    if (i >= 80 && i < 180) paused[i] = 1
    if (i > 80 && i < 180) unrecorded[i] = 1
    speed[i] = i >= 80 && i < 180 ? 0 : 5
  }
  return {
    version: 1,
    activityId: 'gapped',
    sport: 'run',
    durationS: n,
    distance,
    paused,
    unrecorded,
    streams: { speed },
    laps: [
      { startS: 0, endS: 190 },
      { startS: 190, endS: 300 },
    ],
  }
}

describe('lapCellsOf: a lap that holds a gap the device did not time', () => {
  it('leaves out a gap the runner stood through, so it does not slow the pace', () => {
    // 450 m in 190 s, of which the 100 s gap is a rest: 90 s of running at 5 m/s.
    const [first] = lapCellsOf(gappedRun(0), 'metric')
    expect(first!.pace).toBe('3:20 /km')
    expect(first!.lap).toEqual({ time: '1:30', distance: '0.45 km' })
  })

  it('keeps a gap the distance stepped across, so it does not make the pace faster than run', () => {
    // 300 m across the gap is 3 m/s, a jog: 750 m in the full 190 s is 3.95 m/s. Over the 90 s the
    // device timed it would read 8.3 m/s, which nobody ran.
    const [first] = lapCellsOf(gappedRun(300), 'metric')
    expect(first!.pace).toBe('4:13 /km')
    expect(first!.lap?.time).toBe('3:10')
  })

  it('has no distance, and so no pace, for a lap that starts inside the gap', () => {
    const trace = {
      ...gappedRun(0),
      laps: [
        { startS: 100, endS: 300 },
        { startS: 0, endS: 100 },
      ],
    }
    const [inside] = lapCellsOf(trace, 'metric')
    expect(inside!.pace).toBeNull()
    expect(inside!.lap?.distance).toBeNull()
  })
})

describe('lapCellsOf: the metres a walk gained in a rest', () => {
  it('takes them out of the pace as well as their seconds', () => {
    // 50 m across the 100 s gap is 0.5 m/s, a walk, less the second of running the step into the resume
    // holds: 45 m over 99 s of rest. The lap's 500 m less those 45, over its 91 timed seconds, is the
    // 5 m/s it was run at. Read whole it would be 500 m over 91 s, 5.5 m/s.
    const [first] = lapCellsOf(gappedRun(50), 'metric')
    expect(first!.pace).toBe('3:20 /km')
  })
})

/**
 * A run at a steady `speed`, with the seconds in each `gap` not recorded and the distance held through
 * it and stepped by `stepM` where the gap ends, and the laps given. The first lap starts at second 0.
 */
function steadyRun(
  speed: number,
  lapEnds: number[],
  gaps: { from: number; to: number; stepM: number }[] = [],
  jump?: { at: number; m: number },
): ActivityTrace {
  const n = lapEnds[lapEnds.length - 1]!
  const distance = new Float64Array(n)
  const unrecorded = new Uint8Array(n)
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + speed
  for (const { from, to, stepM } of gaps) {
    for (let i = from; i < to; i++) {
      distance[i] = distance[from - 1]!
      unrecorded[i] = 1
    }
    for (let i = to; i < n; i++) distance[i] = distance[i]! + stepM - speed * (to - from)
  }
  if (jump) for (let i = jump.at; i < n; i++) distance[i] = distance[i]! + jump.m
  return {
    version: 1,
    activityId: 'steady',
    sport: 'run',
    durationS: n,
    distance,
    paused: new Uint8Array(n),
    unrecorded,
    streams: { speed: new Float32Array(n).fill(speed) },
    laps: lapEnds.map((endS, i) => ({ startS: i === 0 ? 0 : lapEnds[i - 1]!, endS })),
  }
}

describe('hasRecordedLaps', () => {
  it("does not offer a watch's automatic laps of a kilometre, which repeat the splits", () => {
    // 5 m/s: 200 s is 1000 m. Four whole laps and a remainder.
    expect(hasRecordedLaps(steadyRun(5, [200, 400, 600, 800, 900]))).toBe(false)
  })

  it('does not offer automatic laps of a mile', () => {
    // 1609.344 m at 6.4 m/s is about 251.5 s.
    expect(hasRecordedLaps(steadyRun(6.4, [252, 503, 755, 1006, 1100]))).toBe(false)
  })

  it('offers equal laps of any other length, such as 400 m or 5 km', () => {
    expect(hasRecordedLaps(steadyRun(5, [80, 160, 240, 320, 400]))).toBe(true)
    expect(hasRecordedLaps(steadyRun(5, [1000, 2000, 2500]))).toBe(true)
  })

  it('offers laps of uneven length', () => {
    expect(hasRecordedLaps(steadyRun(5, [200, 300, 500, 700]))).toBe(true)
  })

  it('does not offer one lap, or none', () => {
    expect(hasRecordedLaps(steadyRun(5, [300]))).toBe(false)
    expect(hasRecordedLaps(null)).toBe(false)
  })

  it('keeps an automatic-lap run from being offered laps by one long lap after a stepped gap', () => {
    // The third lap holds a gap with 100 m stepped across it, so it reads 1100 m. The rest are 1000 m.
    const run = steadyRun(5, [200, 400, 600, 800, 900], [{ from: 480, to: 500, stepM: 200 }])
    const [, , third] = lapCellsOf(run, 'metric')
    expect(third!.lap?.distance).toBe('1.1 km')
    expect(hasRecordedLaps(run)).toBe(false)
  })

  it('offers laps when a long lap holds no gap to explain it', () => {
    expect(hasRecordedLaps(steadyRun(5, [200, 400, 620, 820, 920]))).toBe(true)
  })
})

describe('lapCellsOf: a lap that cannot have been run', () => {
  it('has no pace for a lap that spans a GPS jump, and does not mark it Fastest', () => {
    // 3 m/s, then a 700 m jump at second 100. The lap from 50 to 110 reads 880 m in 60 s, 14.7 m/s.
    const run = steadyRun(3, [50, 110, 170, 230], [], { at: 100, m: 700 })
    const cells = lapCellsOf(run, 'metric')
    expect(cells[1]!.pace).toBeNull()
    expect(cells[1]!.fastest).toBe(false)
    expect(cells[1]!.barPercent).toBeNull()
    expect(cells[2]!.pace).toBe('5:33 /km')
  })

  it('has no pace and no time for a lap timed for a few seconds', () => {
    const run = steadyRun(3, [50, 53, 110, 170])
    const [, short, , last] = lapCellsOf(run, 'metric')
    expect(short!.pace).toBeNull()
    expect(short!.lap?.time).toBe('Under 5 s')
    expect(short!.fastest).toBe(false)
    expect(last!.pace).toBe('5:33 /km')
  })

  it('reads the last lap to the second before the end, which has no closing sample', () => {
    const run = steadyRun(3, [60, 120])
    const [, last] = lapCellsOf(run, 'metric')
    expect(last!.lap?.time).toBe('0:59')
    expect(last!.pace).toBe('5:33 /km')
  })
})

describe('lapCellsOf: heart rate', () => {
  it('leaves out dropouts and spikes, as the splits do', () => {
    const run = steadyRun(3, [60, 120])
    const hr = new Float32Array(120).fill(150)
    hr.fill(0, 10, 30)
    hr.fill(250, 40, 50)
    hr[55] = Number.NaN
    const [first, second] = lapCellsOf(
      { ...run, streams: { ...run.streams, heartRate: hr } },
      'metric',
    )
    expect(first!.heartRate).toBe('150 bpm')
    expect(second!.heartRate).toBe('150 bpm')
  })
})
