import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL, DURATIONS_S, PRIORS, RESTING_W_PER_KG } from '../constants'
import { encodeGpx } from '../gpx/encode'
import { parseGpx } from '../gpx/parse'
import { runCost, runMetabolicPower, smoothGrade, travelledDistance } from '../metabolic'
import { sampleDataset } from '../synthetic'
import type { Activity, DigestCurvePoint } from '../types'
import { digestActivity } from './digestActivity'
import { powerAt, SELECTION_MASS_KG } from './terms'
import { recordedRunCurve, recordedVirtualCurve } from './test/recordedGrade'
import { syntheticActivity } from './test/syntheticActivity'

/** How far a curve may move when the recorded distance agrees with the speed stream. */
const AGREEING_TOLERANCE = 0.005

const valueAt = (curve: DigestCurvePoint[], durationS: number) =>
  curve.find((p) => p.durationS === durationS)!.value

/** Running cost, gross W/kg, at a steady speed and gradient with the prior-mean economy. */
const steadyCost = (speedMs: number, grade: number) =>
  RESTING_W_PER_KG + PRIORS.runEconomyScale.mean * runCost(grade) * speedMs

/** Cumulative distance from per-second metres. */
function cumulative(steps: Float64Array): Float64Array {
  const out = new Float64Array(steps.length)
  for (let i = 1; i < steps.length; i++) out[i] = out[i - 1]! + steps[i]!
  return out
}

/**
 * A 900 s run, flat at 3 m/s but for 120 s of stairs from 600 s. On the stairs the speed stream
 * reads 2 m/s while the recorded distance advances 1 m/s, and altitude rises 0.25 m/s: as on a
 * long flight of steps where a watch's speed and its GPS track disagree.
 */
function stairsRun(): Activity {
  const n = 900
  const onStairs = (i: number) => i >= 600 && i < 720
  const speed = Float64Array.from({ length: n }, (_, i) => (onStairs(i) ? 2 : 3))
  const recordedSteps = Float64Array.from({ length: n }, (_, i) => (onStairs(i) ? 1 : 3))
  let climbed = 0
  const altitude = Float64Array.from({ length: n }, (_, i) => {
    if (onStairs(i)) climbed += 0.25
    return 100 + climbed
  })
  return {
    ...syntheticActivity({ id: 'stairs', n, speed, altitude }),
    distance: cumulative(recordedSteps),
  }
}

/** The same activity with its recorded distance replaced by the running sum of its speed. */
function withAgreeingDistance(a: Activity): Activity {
  return { ...a, distance: cumulative(a.speed) }
}

/** Within a relative tolerance, or both NaN: a duration longer than the activity has no value. */
function expectWithin(actual: number, expected: number, tolerance: number): void {
  if (Number.isNaN(expected)) expect(actual).toBeNaN()
  else expect(Math.abs(actual / expected - 1)).toBeLessThanOrEqual(tolerance)
}

describe('digestActivity: grade follows the speed stream', () => {
  it('credits only the recorded climb when the speed stream reads twice the recorded distance', () => {
    const stairs = stairsRun()
    const d = digestActivity(stairs)
    // Fully on the stairs the grade is the recorded 0.25 m/s rise over the stream's 2 m/s.
    expectWithin(valueAt(d.curve, 60), steadyCost(2, 0.125), 0.001)
    // The grade over recorded distance (0.25) times the stream's speed claimed twice the climb.
    const overRecorded = runMetabolicPower(
      stairs.speed,
      smoothGrade(stairs.altitude, stairs.distance),
      PRIORS.runEconomyScale.mean,
    )
    expect(Math.max(...overRecorded.subarray(630, 690))).toBeCloseTo(steadyCost(2, 0.25), 6)
    expect(valueAt(d.curve, 60)).toBeLessThan(0.75 * steadyCost(2, 0.25))
  })

  it('gives the same curves whatever distance the file recorded', () => {
    const stairs = stairsRun()
    const d = digestActivity(stairs)
    const agreeing = digestActivity(withAgreeingDistance(stairs))
    expect(d.curve).toEqual(agreeing.curve)
    expect(d.hrBlocks).toEqual(agreeing.hrBlocks)
  })

  it('leaves a flat run unchanged when its streams disagree', () => {
    const n = 1200
    const flat = syntheticActivity({ id: 'flat', n, speed: new Float64Array(n).fill(4) })
    const mismatched = { ...flat, distance: cumulative(new Float64Array(n).fill(3)) }
    const d = digestActivity(mismatched)
    expect(d.curve).toEqual(digestActivity(flat).curve)
    for (const p of d.curve.filter((q) => q.durationS <= n)) {
      expect(p.value).toBeCloseTo(steadyCost(4, 0), 9)
    }
  })
})

describe('digestActivity: activities whose distance agrees with their speed', () => {
  const { activities } = sampleDataset()

  it.each(activities.filter((a) => a.sport === 'run').map((a) => [a.id, a] as const))(
    'keeps the run curve of %s within 0.5% of the grade over recorded distance',
    (_id, run) => {
      const reference = recordedRunCurve(run)
      const curve = digestActivity(run).curve
      for (const p of reference)
        expectWithin(valueAt(curve, p.durationS), p.value, AGREEING_TOLERANCE)
    },
  )

  it.each(
    activities.filter((a) => a.sport === 'ride' && !a.hasPower).map((a) => [a.id, a] as const),
  )(
    'keeps the virtual climb power of %s within 0.5% of the grade over recorded distance',
    (_id, ride) => {
      const reference = recordedVirtualCurve(ride)
      const curve = digestActivity(ride).curve
      expect(curve.map((p) => p.terms === null)).toEqual(reference.map(Number.isNaN))
      for (const [k, p] of curve.entries()) {
        if (p.terms === null) continue
        expectWithin(
          powerAt(p.terms, SELECTION_MASS_KG, DEFAULT_BIKE_MODEL),
          reference[k]!,
          AGREEING_TOLERANCE,
        )
      }
    },
  )

  it('keeps a hilly run read from GPX within 0.5% of the grade over its recorded distance', () => {
    const hilly = activities.find((a) => a.sport === 'run')!
    const result = parseGpx(encodeGpx(hilly), 'hilly.gpx')
    if (!result.ok) throw new Error('the encoded GPX did not parse')
    const parsed = result.activities[0]!
    const curve = digestActivity(parsed).curve
    const reference = recordedRunCurve(parsed)
    expect(reference.map((p) => p.durationS)).toEqual([...DURATIONS_S])
    for (const p of reference)
      expectWithin(valueAt(curve, p.durationS), p.value, AGREEING_TOLERANCE)
  })
})

/**
 * A 900 s run up a steady 5% climb at 3 m/s, with a 20 s recording gap from 400 s, where speed is
 * unknown, the distance holds and then catches up, and the altitude is interpolated, as resample
 * writes one; and a single second of speed over the limit, unknown, at 600 s.
 */
function climbWithGaps(): Activity {
  const n = 900
  const climb = syntheticActivity({
    id: 'gaps',
    n,
    speed: new Float64Array(n).fill(3),
    grade: 0.05,
  })
  const speed = Float64Array.from(climb.speed)
  const distance = Float64Array.from(climb.distance)
  const unrecorded = new Uint8Array(n)
  speed.fill(NaN, 400, 420)
  unrecorded.fill(1, 400, 420)
  distance.fill(distance[399]!, 400, 420)
  speed[600] = NaN
  return { ...climb, speed, distance, unrecorded }
}

describe('digestActivity: grade beside seconds of unknown speed', () => {
  it('keeps the climb at its own grade beside a recording gap and a dropped speed', () => {
    const run = climbWithGaps()
    const d = digestActivity(run)
    for (const durationS of [30, 60, 300]) {
      expectWithin(valueAt(d.curve, durationS), steadyCost(3, 0.05), 0.002)
    }
  })

  it('would make the grade beside them steeper if their distance were left out', () => {
    const run = climbWithGaps()
    const without = smoothGrade(run.altitude, travelledDistance(run.speed))
    const withRecorded = smoothGrade(run.altitude, travelledDistance(run.speed, run.distance))
    expect(Math.max(...without.subarray(380, 440))).toBeGreaterThan(0.09)
    for (const i of [390, 399, 410, 425, 590, 610]) expect(withRecorded[i]).toBeCloseTo(0.05, 6)
  })
})
