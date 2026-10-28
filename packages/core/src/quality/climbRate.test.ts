import { describe, expect, it } from 'vitest'
import { MAX_CLIMB_RATE_MS } from '../constants'
import type { Activity } from '../types'
import { assessQuality, QUALITY_THRESHOLDS } from './assess'

const MARGIN = QUALITY_THRESHOLDS.gradeContaminationMarginS

/** A 600 s run at 3 m/s whose altitude rises at `rateMs` from 240 s for `durationS` seconds. */
function climbingRun(rateMs: number, durationS: number, extra: Partial<Activity> = {}): Activity {
  const n = 600
  const altitude = Float64Array.from({ length: n }, (_, i) => {
    const climbed = Math.min(Math.max(i - 240, 0), durationS)
    return 100 + rateMs * climbed
  })
  return {
    id: 'r',
    name: 'r',
    sport: 'run',
    startMs: 0,
    n,
    speed: new Float64Array(n).fill(3),
    distance: Float64Array.from({ length: n }, (_, i) => 3 * i),
    altitude,
    heartRate: new Float64Array(n).fill(150),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
    ...extra,
  }
}

const masked = (mask: Uint8Array) => mask.reduce((count, v) => count + (v === 0 ? 1 : 0), 0)

/** The first masked sample and one past the last. */
function span(mask: Uint8Array): [number, number] {
  return [mask.indexOf(0), mask.lastIndexOf(0) + 1]
}

describe('assessQuality: implausible climbs', () => {
  it('flags 60 m in 60 s and leaves out the grade and altitude around it', () => {
    const report = assessQuality(climbingRun(1, 60))
    expect(report.flags.map((f) => f.kind)).toEqual(['implausible-climb'])
    const flag = report.flags[0]!
    // The rise runs from 240 s to 300 s. Every 30 s window centred from 260 s to 280 s, smoothed over
    // 10 s, lies within it and rises 30 m; the flag is those centres, without the windows' reach.
    expect(flag).toMatchObject({ start: 260, end: 281 })
    expect(flag.message).toBe(`Altitude rose at ${MAX_CLIMB_RATE_MS} m/s or more for 21 seconds`)
    // The altitude is left out over the windows and their smoothing, 20 s either side of the centres.
    expect(span(report.validAltitude)).toEqual([240, 301])
    expect(span(report.validGrade)).toEqual([240 - MARGIN, 301 + MARGIN])
  })

  it('flags a ramp that holds a jump as both a ramp and a jump', () => {
    // 87 m in 60 s, of which 15 m is a single-second step at 270 s: the other 72 m are a ramp.
    const run = climbingRun(1.2, 60)
    for (let i = 270; i < run.n; i++) run.altitude[i]! += 15
    const kinds = assessQuality(run).flags.map((f) => f.kind)
    expect(kinds.sort()).toEqual(['altitude-jump', 'implausible-climb'])
  })

  it('keeps a steady 0.5 m/s climb', () => {
    const report = assessQuality(climbingRun(0.5, 120))
    expect(report.flags).toEqual([])
    expect(masked(report.validGrade)).toBe(0)
  })

  it('keeps a fall at any rate: it cannot raise a cost or a power', () => {
    const report = assessQuality(climbingRun(-2, 60))
    expect(report.flags).toEqual([])
  })

  it('leaves an indoor activity alone, whose grade is zero anyway', () => {
    const report = assessQuality(climbingRun(1, 60, { indoor: true }))
    expect(report.flags).toEqual([])
    expect(masked(report.validGrade)).toBe(0)
  })

  it('reports a single-second jump once, as a jump', () => {
    const run = climbingRun(0, 0)
    run.altitude.fill(160, 300)
    expect(assessQuality(run).flags.map((f) => f.kind)).toEqual(['altitude-jump'])
  })
})
