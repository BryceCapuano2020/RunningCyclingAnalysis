import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { OLDEST_OPACITY, bestDots, opacityOf } from './bestsOverTime'

const DAY = 86_400_000
const START = Date.UTC(2026, 0, 5)
const runPoint = (week: number, speed: number, atDay: number): TrendPoint => ({
  endMs: START + week * 7 * DAY + 6 * DAY,
  runWkg: RESTING_W_PER_KG + FLAT_RUN_COST * speed,
  rideWkg: null,
  runCount: 1,
  rideCount: 0,
  runAtMs: START + atDay * DAY,
  rideAtMs: null,
  rideRunSpeed: null,
})

describe('bestDots', () => {
  it('makes one dot for each effort that led a window, once, though it led many weeks', () => {
    // The first effort leads weeks 0 to 2, until a better one on day 17 takes the window.
    const points = [
      runPoint(0, 4, 1),
      runPoint(1, 4, 1),
      runPoint(2, 4, 1),
      runPoint(3, 4.2, 17),
      runPoint(4, 4.2, 17),
    ]
    const dots = bestDots(points, 'run', 70)
    expect(dots).toHaveLength(2)
    expect(dots.map((dot) => dot.atMs)).toEqual([START + DAY, START + 17 * DAY])
    expect(dots[0]!.value).toBeCloseTo(4, 6)
    expect(dots[1]!.value).toBeCloseTo(4.2, 6)
  })

  it('is dated by the day of the effort, not by the Sunday of the week that holds it, and oldest first', () => {
    const dots = bestDots([runPoint(1, 4.1, 9), runPoint(0, 4, 2)], 'run', 70)
    expect(dots.map((dot) => dot.atMs)).toEqual([START + 2 * DAY, START + 9 * DAY])
  })

  it('leaves out a week with no effort of its sport', () => {
    const none: TrendPoint = { ...runPoint(0, 4, 1), runWkg: null, runAtMs: null }
    expect(bestDots([none], 'run', 70)).toEqual([])
    expect(bestDots([runPoint(0, 4, 1)], 'ride', 70)).toEqual([])
  })
})

describe('opacityOf', () => {
  it('is solid for the newest dot and faded to the least for the oldest, evenly by date', () => {
    const dots = [0, 10, 40].map((day) => ({ atMs: START + day * DAY, value: 4, wkg: null }))
    const [oldest, middle, newest] = opacityOf(dots)
    expect(oldest).toBeCloseTo(OLDEST_OPACITY, 9)
    expect(newest).toBe(1)
    expect(middle).toBeCloseTo(OLDEST_OPACITY + (1 - OLDEST_OPACITY) * 0.25, 9)
  })

  it('is solid for a single dot or dots on one day', () => {
    expect(opacityOf([{ atMs: START, value: 4, wkg: null }])).toEqual([1])
  })
})
