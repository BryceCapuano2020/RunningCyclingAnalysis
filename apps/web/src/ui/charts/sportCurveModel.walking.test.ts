import { describe, expect, it } from 'vitest'
import { WALKING_PACE } from '@rca/core/constants'
import { curvePoint } from './fixtures'
import { buildRows } from './sportCurveModel'

const WALK = WALKING_PACE.maxMovingSpeedMs - 0.3

describe('buildRows at walking pace', () => {
  const run = [
    curvePoint(300, 4.5, 'run-1'),
    curvePoint(1200, 4.0, 'run-2'),
    curvePoint(7200, 3.1, 'run-3'),
    curvePoint(10_800, WALK, 'run-4'),
  ]

  it('ends a run curve at its longest duration that is not a walk', () => {
    const rows = buildRows('run', run, [])
    expect(rows.map((row) => row.durationS)).toEqual([300, 1200, 7200])
    expect(rows.every((row) => Number.isFinite(row.value))).toBe(true)
  })

  it('cuts the period before at its own longest duration', () => {
    const before = [
      curvePoint(300, 4.2, 'run-0'),
      curvePoint(1200, 3.8, 'run-0'),
      curvePoint(7200, WALK, 'run-0'),
    ]
    const rows = buildRows('run', run, before)
    expect(rows.map((row) => [row.durationS, Number.isFinite(row.previous)])).toEqual([
      [300, true],
      [1200, true],
      [7200, false],
    ])
  })

  it('keeps a row whose current value is a walk when the period before is not, and names no activity for it', () => {
    const before = [curvePoint(300, 4.2, 'run-0'), curvePoint(10_800, 2.5, 'run-0')]
    const row = buildRows('run', run, before).find((r) => r.durationS === 10_800)!
    expect(Number.isNaN(row.value)).toBe(true)
    expect(row.activityId).toBeNull()
    expect(row.previous).toBe(2.5)
  })

  it('never cuts a ride', () => {
    const ride = [
      curvePoint(300, 320, 'ride-1'),
      curvePoint(3600, 210, 'ride-2'),
      curvePoint(10_800, 90, 'ride-3'),
    ]
    expect(buildRows('ride', ride, []).map((row) => row.durationS)).toEqual([300, 3600, 10_800])
  })
})
