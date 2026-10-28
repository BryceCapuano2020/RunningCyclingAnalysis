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

describe('assessQuality: implausible climbs', () => {
  it('flags 60 m in 60 s and leaves out the grade and altitude around it', () => {
    const report = assessQuality(climbingRun(1, 60))
    expect(report.flags.map((f) => f.kind)).toEqual(['implausible-climb'])
    const flag = report.flags[0]!
    // The rise starts at 240 s and ends at 300 s; the flag covers that ramp.
    expect(flag.start).toBeLessThanOrEqual(255)
    expect(flag.end).toBeGreaterThanOrEqual(285)
    expect(flag.message).toBe(
      `Altitude rose at ${MAX_CLIMB_RATE_MS} m/s or more for ${flag.end - flag.start} seconds`,
    )
    for (let i = flag.start; i < flag.end; i++) expect(report.validAltitude[i]).toBe(0)
    const graded = report.validGrade
    for (let i = flag.start - MARGIN; i < flag.end + MARGIN; i++) expect(graded[i]).toBe(0)
    expect(masked(graded)).toBe(flag.end - flag.start + 2 * MARGIN)
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
