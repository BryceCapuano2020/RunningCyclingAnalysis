import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST } from '../constants'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity, type Spec } from '../digest/test/syntheticActivity'
import { runCost } from '../metabolic'
import { analyze } from '../pipeline'
import type { Activity } from '../types'

const constant = (n: number, value: number) => new Float64Array(n).fill(value)

/** A run at a steady speed, in m/s, for n seconds. Distance is the running sum of speed. */
function run(n: number, speed: number, extra: Partial<Spec> = {}): Activity {
  return syntheticActivity({ n, speed: constant(n, speed), ...extra })
}

/** The splits of a run. Fails the test, rather than returning undefined, when there are none. */
function splitsOf(activity: Activity) {
  const splits = digestActivity(activity).splits
  if (!splits) throw new Error('expected splits on a run')
  return splits
}

/** The seconds the resampler marks unrecorded for a record gap: those strictly inside it. */
function unrecordedInside(n: number, gapFrom: number, gapTo: number): Uint8Array {
  const mask = new Uint8Array(n)
  mask.fill(1, gapFrom + 1, gapTo)
  return mask
}

/**
 * A run whose gap sits inside a kilometre, as a GPX or timer-less FIT writes one. Speed is zero and
 * paused for 50 s, the distance is held through it, and then steps by the 200 m the runner covered
 * meanwhile. Both boundaries of the kilometre that holds the gap lie clear of it.
 */
function runWithContainedGap(): Activity {
  const n = 800
  const speed = constant(n, 4)
  speed.fill(0, 400, 450)
  const paused = new Uint8Array(n)
  paused.fill(1, 400, 450)
  const distance = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    if (i < 400) distance[i] = 4 * i
    else if (i < 450) distance[i] = 1596
    else distance[i] = 1800 + 4 * (i - 450)
  }
  const activity = syntheticActivity({ n, speed, altitude: constant(n, 100) })
  return { ...activity, distance, paused, unrecorded: unrecordedInside(n, 399, 450) }
}

/**
 * A 600 s GPX-style gap, which the resampler marks as unrecorded: speed is zero and paused, the
 * distance is held through it, and then it steps by the 1800 m the runner covered. The seconds
 * from 100 to 699 are the gap, so the boundaries at 699.39 s and 699.95 s fall inside it.
 */
function runWithGap(): Activity {
  const n = 1100
  const speed = constant(n, 3)
  speed.fill(0, 100, 700)
  const paused = new Uint8Array(n)
  paused.fill(1, 100, 700)
  const distance = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    if (i < 100) distance[i] = 3 * i
    else if (i < 700) distance[i] = 297
    else distance[i] = 297 + 1800 + 3 * (i - 700)
  }
  const activity = syntheticActivity({ n, speed, altitude: constant(n, 100) })
  return { ...activity, distance, paused, unrecorded: unrecordedInside(n, 99, 700) }
}

/**
 * The same step with the speed recorded through it and no unrecorded mask, so the only sign of
 * trouble is the implied speed of the split that crosses the step.
 */
function runWithStep(): Activity {
  const n = 1100
  const speed = constant(n, 3)
  const distance = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    if (i < 100) distance[i] = 3 * i
    else if (i < 700) distance[i] = 297
    else distance[i] = 297 + 1800 + 3 * (i - 700)
  }
  return { ...syntheticActivity({ n, speed }), distance }
}

/**
 * A run at `speed` with a timer pause over the seconds [from, to): the speed is zero, the timer is
 * paused, and the distance is held through the pause and carried on from where it stood, with no step
 * into the first timed sample.
 */
function pausedRun(n: number, speed: number, from: number, to: number): Activity {
  const v = constant(n, speed)
  v.fill(0, from, to)
  const paused = new Uint8Array(n)
  paused.fill(1, from, to)
  const distance = Float64Array.from(
    { length: n },
    (_, i) => speed * (i - Math.max(0, Math.min(i, to) - from)),
  )
  return { ...syntheticActivity({ n, speed: v, paused }), distance }
}

describe('run splits: which splits exist', () => {
  it('splits at every whole kilometre and mile, and keeps a partial remainder', () => {
    // 1 m/s for 3000 s covers 2999 m: two whole kilometres and 999 m.
    const { km, mile } = splitsOf(run(3000, 1))
    expect(km.map((s) => s.distanceM)).toEqual([1000, 1000, 999])
    expect(mile).toHaveLength(2)
    expect(mile[0]!.distanceM).toBeCloseTo(1609.344, 6)
    // The partial split is stored to 0.01 m, so it is within half a centimetre of the exact length.
    expect(mile[1]!.distanceM).toBeCloseTo(2999 - 1609.344, 2)
  })

  it('keeps a remainder of exactly 100 m and drops one of 99 m', () => {
    // n samples at 1 m/s cover n - 1 metres.
    expect(splitsOf(run(1100, 1)).km.map((s) => s.distanceM)).toEqual([1000])
    expect(splitsOf(run(1101, 1)).km.map((s) => s.distanceM)).toEqual([1000, 100])
  })

  it('has no partial split when the run ends exactly on a whole kilometre', () => {
    expect(splitsOf(run(3001, 1)).km.map((s) => s.distanceM)).toEqual([1000, 1000, 1000])
  })

  it('has no splits for a run shorter than 100 m', () => {
    expect(splitsOf(run(50, 1))).toEqual({ km: [], mile: [] })
  })

  it('measures the run by its largest distance, so a dip at the end does not shorten it', () => {
    const activity = run(3000, 1)
    // The last sample reads 2950 m, but the run reached 2998 m before it.
    activity.distance[2999] = 2950
    expect(splitsOf(activity).km.map((s) => s.distanceM)).toEqual([1000, 1000, 998])
  })

  it('keeps exactly 500 whole kilometres', () => {
    expect(splitsOf(run(100_001, 5)).km).toHaveLength(500)
  })

  it('has no kilometre splits past 500, counting the partial split, but keeps the miles', () => {
    // 500.5 km is 500 whole kilometres and a partial one: 501 splits, which is over the limit.
    const { km, mile } = splitsOf(run(100_101, 5))
    expect(km).toEqual([])
    expect(mile).toHaveLength(311)
  })

  it('has no splits in either unit for a 1000 km run', () => {
    expect(splitsOf(run(200_001, 5))).toEqual({ km: [], mile: [] })
  })
})

describe('run splits: moving time', () => {
  it('gives equal splits at a constant pace, and the partial remainder its own time', () => {
    // 4 m/s for 1000 s covers 3996 m, so the partial remainder is 996 m.
    const { km } = splitsOf(run(1000, 4))
    expect(km.map((s) => s.seconds)).toEqual([250, 250, 250, 249])
    expect(km[3]!.distanceM).toBe(996)
  })

  it('interpolates boundaries that fall between samples, and rounds to hundredths of a second', () => {
    // 3 m/s covers 1000 m in 333.333 s, so the second boundary is at 666.667 s.
    const { km } = splitsOf(run(1000, 3))
    expect(km.map((s) => s.seconds)).toEqual([333.33, 333.33, 332.33])
  })

  it('counts time spent stopped in the split it falls in', () => {
    // Stopped from 400 s to 450 s, inside the second kilometre.
    const speed = constant(1000, 4)
    speed.fill(0, 400, 450)
    const { km } = splitsOf(run(1000, 4, { speed }))
    expect(km[0]!.seconds).toBe(250)
    expect(km[1]!.seconds).toBe(300)
  })

  it('leaves time paused out of the split, with the same grade-adjusted time', () => {
    const { km } = splitsOf(pausedRun(1000, 4, 400, 450))
    expect(km[1]!.seconds).toBe(250)
    expect(km[1]!.gradeAdjustedSeconds).toBeCloseTo(250, 2)
  })

  it('counts the second of running that a resumed file holds in the step into its first timed sample', () => {
    // The synthetic distance steps by the speed into each sample, so the step into the first timed
    // sample after the pause is a second of running, and that second is run, not rested.
    const speed = constant(1000, 4)
    speed.fill(0, 400, 450)
    const paused = new Uint8Array(1000)
    paused.fill(1, 400, 450)
    const { km } = splitsOf(run(1000, 4, { speed, paused }))
    expect(km[1]!.seconds).toBe(251)
  })
})

describe('run splits: a timer pause in the recording', () => {
  it('counts a split whose timer pause spans where a boundary would fall over its moving seconds', () => {
    // At 4 m/s the first kilometre would end at 250 s. A 10 s timer pause from 245 s to 254 s holds
    // the distance at 976 m, so the kilometre is reached at 260 s. The pause is recorded and has no
    // unrecorded mask, so the split is known, and its 10 s pause is not in its time.
    const { km } = splitsOf(pausedRun(1100, 4, 245, 255))
    expect(km[0]!.seconds).toBe(250)
    expect(km[1]!.seconds).toBe(250)
  })
})

describe('run splits: unknown time', () => {
  it('makes a split unknown when a boundary falls inside a recording gap, not a near-zero time', () => {
    // The 600 s gap holds the boundaries at 699.39 s and 699.95 s, so three splits are unknown.
    const { km } = splitsOf(runWithGap())
    expect(km.map((s) => s.seconds)).toEqual([null, null, null, 98])
    expect(km[3]!.gradeAdjustedSeconds).not.toBeNull()
  })

  it("keeps the time of a split that holds a gap, and takes the gap at the split's own effort", () => {
    // The kilometre from 250 s to 500 s holds the gap, but its boundaries are clear of it, so its
    // time is right. The gap's 50 s are at the steady pace of the rest, so the flat time is too.
    const { km } = splitsOf(runWithContainedGap())
    expect(km.map((s) => s.seconds)).toEqual([250, 250, 250, 49])
    expect(km[1]!.gradeAdjustedSeconds).toBeCloseTo(250, 2)
  })

  it('makes a split unknown when its implied speed is above the run limit', () => {
    // Speed is recorded through the gap, but the distance steps: the split across the step is
    // 0.56 s for 1000 m, which is no run at all.
    const { km } = splitsOf(runWithStep())
    expect(km[1]!.seconds).toBeNull()
    expect(km[1]!.gradeAdjustedSeconds).toBeNull()
    expect(km[0]!.seconds).not.toBeNull()
  })

  it('rounds seconds to 0.01 s, elevation to 0.1 m and heart rate to 0.1 bpm', () => {
    const heartRate = Float64Array.from({ length: 1000 }, (_, i) => 100 + 0.05 * i)
    const altitude = Float64Array.from({ length: 1000 }, (_, i) => 100 + 0.0123 * i)
    const { km } = splitsOf(run(1000, 3, { heartRate, altitude }))
    for (const split of km) {
      expect(Math.round((split.seconds ?? 0) * 100) / 100).toBe(split.seconds)
      expect(Math.round((split.elevationGainM ?? 0) * 10) / 10).toBe(split.elevationGainM)
      expect(Math.round((split.avgHeartRate ?? 0) * 10) / 10).toBe(split.avgHeartRate)
    }
  })
})

describe('run splits: grade-adjusted time', () => {
  it('equals the wall-clock time at a constant pace on the flat', () => {
    const { km } = splitsOf(run(1000, 4))
    for (const split of km) {
      expect(split.gradeAdjustedSeconds).toBeCloseTo(split.seconds ?? NaN, 2)
    }
  })

  it('equals the wall-clock time when the stopped time is in the split', () => {
    // Stopped time costs the resting rate, so a flat split's flat time is still its wall-clock time.
    const speed = constant(1000, 4)
    speed.fill(0, 400, 450)
    const { km } = splitsOf(run(1000, 4, { speed }))
    expect(km[1]!.gradeAdjustedSeconds).toBeCloseTo(300, 2)
  })

  it('is below the wall-clock time on an uphill split, by the flat-to-uphill cost ratio', () => {
    const { km } = splitsOf(run(1000, 4, { grade: 0.05 }))
    const expected = (250 * FLAT_RUN_COST) / runCost(0.05)
    expect(km[0]!.gradeAdjustedSeconds!).toBeLessThan(km[0]!.seconds!)
    // The smoothed grade is not exactly 5% at the start of the run, so allow a fraction of a percent.
    expect(Math.abs(km[0]!.gradeAdjustedSeconds! - expected) / expected).toBeLessThan(0.01)
  })

  it('is above the wall-clock time on a downhill split', () => {
    const { km } = splitsOf(run(1000, 4, { grade: -0.05 }))
    expect(km[0]!.gradeAdjustedSeconds!).toBeGreaterThan(km[0]!.seconds!)
  })

  it('is null for every split when the run has no altitude, so no grade is known', () => {
    const { km } = splitsOf(run(1000, 4, { noAltitude: true }))
    expect(km.map((s) => s.gradeAdjustedSeconds)).toEqual([null, null, null, null])
  })
})

describe('run splits: elevation and heart rate', () => {
  it('gives the climb of each kilometre, with the same smoothing as the activity', () => {
    // 5% over 1000 m is 50 m of climb. The 2 m hysteresis can leave at most one step uncounted.
    const { km } = splitsOf(run(1000, 4, { grade: 0.05 }))
    expect(km[0]!.elevationGainM!).toBeGreaterThan(47)
    expect(km[0]!.elevationGainM!).toBeLessThanOrEqual(50.5)
  })

  it('adds up the climbs of the splits to the activity elevation gain, in both units', () => {
    const altitude = Float64Array.from({ length: 3000 }, (_, i) => 100 + 30 * Math.sin(i / 30))
    const activity = run(3000, 1, { altitude })
    const digest = digestActivity(activity)
    const { km, mile } = splitsOf(activity)
    // Stored climbs are rounded to 0.1 m, so the splits add up to the rounded total exactly.
    const sum = (splits: { elevationGainM: number | null }[]) =>
      splits.reduce((total, split) => total + (split.elevationGainM ?? 0), 0)
    const stored = Math.round(digest.elevationGainM * 10) / 10
    expect(sum(km)).toBeCloseTo(stored, 9)
    expect(sum(mile)).toBeCloseTo(stored, 9)
    expect(Math.abs(sum(km) - digest.elevationGainM)).toBeLessThanOrEqual(0.05)
  })

  it('adds up the climbs at a fractional speed, where boundaries fall between samples', () => {
    // At 1 m/s every boundary is a whole second, so only a fractional speed splits a sample.
    const altitude = Float64Array.from({ length: 3000 }, (_, i) => 100 + 30 * Math.sin(i / 30))
    const activity = run(3000, 3.1, { altitude })
    const digest = digestActivity(activity)
    const { km, mile } = splitsOf(activity)
    const sum = (splits: { elevationGainM: number | null }[]) =>
      splits.reduce((total, split) => total + (split.elevationGainM ?? 0), 0)
    const stored = Math.round(digest.elevationGainM * 10) / 10
    expect(sum(km)).toBeCloseTo(stored, 9)
    expect(sum(mile)).toBeCloseTo(stored, 9)
  })

  it('gives no elevation gain when the run has no altitude', () => {
    const { km } = splitsOf(run(1000, 4, { noAltitude: true }))
    expect(km.map((s) => s.elevationGainM)).toEqual([null, null, null, null])
  })

  it('keeps the elevation of a split whose grade-adjusted time is unknown', () => {
    const { km } = splitsOf(runWithGap())
    expect(km[1]!.gradeAdjustedSeconds).toBeNull()
    expect(km[1]!.elevationGainM).toBe(0)
  })

  it('averages heart rate over the samples in each split', () => {
    // Samples 250 to 499 are 180 bpm, which is the second kilometre.
    const heartRate = constant(1000, 120)
    heartRate.fill(180, 250, 500)
    const { km } = splitsOf(run(1000, 4, { heartRate }))
    expect(km.map((s) => s.avgHeartRate)).toEqual([120, 180, 120, 120])
  })

  it('weights heart rate by the time each sample covers, at a boundary between samples', () => {
    // A steady ramp, so no sample is a spike. The first kilometre ends at 333.333 s, inside sample 333.
    const heartRate = Float64Array.from({ length: 1000 }, (_, i) => 100 + 0.05 * i)
    const { km } = splitsOf(run(1000, 3, { heartRate }))
    const end = 1000 / 3
    let weighted = 0
    for (let i = 0; i <= Math.floor(end); i++) {
      const covered = Math.min(i + 1, end) - i
      weighted += covered * heartRate[i]!
    }
    expect(km[0]!.avgHeartRate).toBe(Math.round((weighted / end) * 10) / 10)
  })

  it('rounds the partial split distance to 0.01 m, at a fractional speed', () => {
    // 3.1 m/s for 1099 s covers 3406.9 m, so the partial remainder is 406.9 m.
    const { km } = splitsOf(run(1100, 3.1))
    expect(km[3]!.distanceM).toBe(406.9)
  })

  it('gives a null heart rate when the run has none', () => {
    const { km } = splitsOf(run(1000, 4, { noHeartRate: true }))
    expect(km.map((s) => s.avgHeartRate)).toEqual([null, null, null, null])
  })
})

describe('run splits: the rest of the digest', () => {
  it('is absent on a ride', () => {
    expect(digestActivity(run(1000, 8, { sport: 'ride' }))).not.toHaveProperty('splits')
  })

  it('keeps every value finite and non-negative, and nulls only where time or grade are unknown', () => {
    const { km, mile } = splitsOf(run(3000, 3, { grade: 0.04 }))
    for (const split of [...km, ...mile]) {
      expect(Number.isFinite(split.distanceM) && split.distanceM >= 0).toBe(true)
      for (const value of [split.seconds, split.gradeAdjustedSeconds, split.elevationGainM]) {
        expect(value === null || (Number.isFinite(value) && value >= 0)).toBe(true)
      }
      expect(split.avgHeartRate).not.toBeNull()
    }
  })

  it('keeps splits off the activity summary, so a summary stays small', () => {
    const [summary] = analyze([run(2500, 4)], { massKg: 70, bikeMassKg: 8 }).activities
    expect(summary).not.toHaveProperty('splits')
  })
})

/**
 * Four 400 m reps at 5 m/s, each followed by a 300 s rest the device did not record, with the
 * distance held through it. The unit boundaries fall inside the reps, so no split touches a gap.
 */
function repsWithRests(restStepM = 0): Activity {
  const reps = 4
  const repS = 80
  const restS = 300
  const n = reps * (repS + restS) - restS
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const unrecorded = new Uint8Array(n)
  let metres = 0
  for (let rep = 0; rep < reps; rep++) {
    const start = rep * (repS + restS)
    for (let k = 0; k < repS; k++) {
      speed[start + k] = 5
      distance[start + k] = metres
      metres += 5
    }
    for (let k = repS; k < repS + restS && start + k < n; k++) {
      distance[start + k] = metres
      unrecorded[start + k] = 1
    }
    metres += restStepM
  }
  const activity = syntheticActivity({ n, speed, altitude: constant(n, 100) })
  return { ...activity, distance, unrecorded }
}

describe('run splits: an interval file with long rests', () => {
  it('reads each split over the time the device was timing, not the rests between reps', () => {
    // 1595 m of reps and 900 s of rest. The first kilometre holds two and a half reps: 200 s at 5 m/s.
    const { km } = splitsOf(repsWithRests())
    expect(km[0]!.seconds).toBeCloseTo(200, 0)
    expect(km[1]!.seconds).toBeCloseTo(119, 0)
  })

  it('puts the pace and the flat pace on the same time', () => {
    const { km } = splitsOf(repsWithRests())
    for (const split of km) {
      expect(split.gradeAdjustedSeconds).toBeCloseTo(split.seconds!, 0)
    }
  })

  it('takes the metres a walk gained in a rest out of the pace, as well as its seconds', () => {
    // 60 m walked across each 300 s rest is 0.2 m/s. The kilometre holds two rests, so 120 m of it
    // were walked in no timed seconds: read over its 176 timed seconds the run would be 5.7 m/s.
    // The reps were run at 5 m/s, which is 200 s for the kilometre.
    const { km } = splitsOf(repsWithRests(60))
    // The step into each resumed sample is the 60 m walked, so a second of running at 5 m/s is taken
    // off it, and its second off the rest: the kilometre reads exactly as run.
    expect(km[0]!.seconds).toBeCloseTo(200, 1)
    expect(km[0]!.gradeAdjustedSeconds).toBeCloseTo(200, 1)
  })

  it('keeps the rest in the time of a gap the runner moved through', () => {
    // 300 m covered across each 300 s gap is 1 m/s, a recovery walk. The first kilometre holds the first
    // gap whole: its 80 s rep, the 300 s gap, and the 60 s that finish the kilometre.
    const { km } = splitsOf(repsWithRests(300))
    expect(km[0]!.seconds).toBeCloseTo(440, 0)
  })
})
