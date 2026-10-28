import { describe, expect, it } from 'vitest'
import { smoothGrade, travelledDistance } from './grade'

/** Altitude and cumulative distance for a constant-slope route with one sample every stepM metres. */
function route(n: number, stepM: number, slope: number) {
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    distance[i] = i * stepM
    altitude[i] = slope * i * stepM
  }
  return { altitude, distance }
}

describe('smoothGrade', () => {
  it('returns NaN when every altitude is NaN', () => {
    const altitude = new Float64Array(10).fill(NaN)
    const { distance } = route(10, 3, 0.05)
    expect(Array.from(smoothGrade(altitude, distance))).toEqual(new Array<number>(10).fill(NaN))
  })

  it('returns an empty array for empty input', () => {
    expect(smoothGrade(new Float64Array(0), new Float64Array(0)).length).toBe(0)
  })

  it('is zero on flat ground', () => {
    const altitude = new Float64Array(100).fill(250)
    const { distance } = route(100, 3, 0)
    expect(Array.from(smoothGrade(altitude, distance))).toEqual(new Array<number>(100).fill(0))
  })

  it('reproduces a constant 5% climb away from the ends', () => {
    const { altitude, distance } = route(100, 3, 0.05)
    const grade = smoothGrade(altitude, distance)
    for (let i = 30; i <= 69; i++) {
      expect(grade[i]).toBeCloseTo(0.05, 9)
    }
  })

  it('measures a clipped window at the ends of the route', () => {
    // A clipped window is asymmetric: samples 0..15 average to 7.5 m of climb and
    // 0..30 to 15 m, so the first gradient is 1.125 m over 45 m = 0.025.
    const { altitude, distance } = route(40, 3, 0.05)
    const grade = smoothGrade(altitude, distance)
    expect(grade[0]).toBeCloseTo(0.025, 9)
    expect(grade[39]).toBeCloseTo(0.025, 9)
  })

  it('clamps grade to plus or minus 0.35', () => {
    const { altitude, distance } = route(100, 3, 0.5)
    expect(smoothGrade(altitude, distance)[50]).toBe(0.35)
    const descent = altitude.map((a) => -a)
    expect(smoothGrade(descent, distance)[50]).toBe(-0.35)
  })

  it('measures a distance span of exactly 5 m rather than treating it as too short', () => {
    // Sample 15 spans samples 0 to 30. Only the end sample carries distance, so that span is 5 m.
    const altitude = new Float64Array(31).fill(100)
    const distance = new Float64Array(31)
    distance[30] = 5
    expect(smoothGrade(altitude, distance)[15]).toBe(0)
  })

  it('gives NaN, not flat ground, where the distance span is under 5 m', () => {
    // 0.1 m per sample makes every 30-sample span 3 m long.
    const { altitude, distance } = route(100, 0.1, 0.5)
    expect(Array.from(smoothGrade(altitude, distance))).toEqual(new Array<number>(100).fill(NaN))
  })

  it('gives NaN where the distance is NaN at a span end', () => {
    const { altitude, distance } = route(100, 3, 0.05)
    distance[50] = NaN
    const grade = smoothGrade(altitude, distance)
    expect(grade[35]).toBeNaN()
    expect(grade[65]).toBeNaN()
    // The span for sample 34 runs from 19 to 49 and does not touch the NaN.
    expect(grade[34]).toBeCloseTo(0.05, 9)
  })

  it('gives NaN where the smoothed altitude is NaN', () => {
    const { altitude, distance } = route(100, 3, 0.05)
    altitude.fill(NaN, 0, 60)
    const grade = smoothGrade(altitude, distance)
    // Smoothed altitude at 25 and 35 averages only NaN samples.
    expect(grade[10]).toBeNaN()
    expect(grade[50]).toBeNaN()
  })
})

describe('travelledDistance', () => {
  it('integrates speed by the trapezoid rule, one second per sample', () => {
    const d = travelledDistance(Float64Array.from([2, 4, 4, 0]))
    expect(Array.from(d)).toEqual([0, 3, 7, 9])
  })

  it('spreads the recorded distance across a stretch of unknown speed, or adds nothing without it', () => {
    const speed = Float64Array.from([2, NaN, NaN, 2, 2])
    // A recording gap: the distance holds, then catches up when the records resume.
    const recorded = Float64Array.from([0, 0, 0, 9, 11])
    expect(Array.from(travelledDistance(speed, recorded))).toEqual([0, 3, 6, 9, 11])
    expect(Array.from(travelledDistance(speed))).toEqual([0, 0, 0, 0, 2])
  })

  it('takes the recorded gain for a first second of unknown speed', () => {
    const d = travelledDistance(Float64Array.from([NaN, 2, 2]), Float64Array.from([0, 3, 5]))
    expect(Array.from(d)).toEqual([0, 3, 5])
  })

  it('makes grade times speed the climb rate the altitude records, whatever distance was recorded', () => {
    // 120 s of stairs: the speed stream reads 2 m/s while altitude rises 0.25 m/s.
    const n = 120
    const speed = new Float64Array(n).fill(2)
    const altitude = Float64Array.from({ length: n }, (_, i) => 100 + 0.25 * i)
    const grade = smoothGrade(altitude, travelledDistance(speed))
    for (let i = 30; i < n - 30; i++) expect(grade[i]! * speed[i]!).toBeCloseTo(0.25, 9)
    // Over a recorded distance of half that, the same speed claims twice the climb.
    const recorded = Float64Array.from({ length: n }, (_, i) => i)
    expect(smoothGrade(altitude, recorded)[60]! * speed[60]!).toBeCloseTo(0.5, 9)
  })
})
