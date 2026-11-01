import { describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { setViewerZone } from '@rca/core/calendar'
import { OLDEST_OPACITY, bestDots, dotsLayout, opacityOf } from './bestsOverTime'
import { activityDate } from './trendTicks'

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

describe('dotsLayout axis dates', () => {
  const SIZE = {
    width: 640,
    height: 320,
    plot: { left: 40, right: 620, top: 10, bottom: 280 },
    tooltipId: 't',
    hintId: 'h',
    titleId: 'i',
  }
  const dotAt = (atMs: number) => ({ atMs, value: 4, wkg: null })

  // A day name drops its year: "13 Aug 2026" is "13 Aug" on the axis.
  const dayOnly = (ms: number) => activityDate(ms).replace(/ \d{4}$/, '')

  // Fixed-offset zones, so the device's zone and the viewer's are the same one whichever way the days are cut.
  it.each([
    ['UTC-7', 'Etc/GMT+7', -7 * 60, Date.UTC(2026, 7, 14, 3), Date.UTC(2026, 9, 2, 5)],
    ['UTC+13', 'Etc/GMT-13', 13 * 60, Date.UTC(2026, 7, 13, 20), Date.UTC(2026, 9, 1, 14)],
  ])(
    'names the ends of the axis by the viewer’s day, as the table and tooltip do, at %s',
    (_name, tz, minutes, first, last) => {
      vi.stubEnv('TZ', tz)
      const dots = [dotAt(first), dotAt(last)]
      const labels = () => dotsLayout(dots, 'run', 'metric', SIZE)!.xTicks.map((tick) => tick.label)
      const before = setViewerZone(() => minutes)
      try {
        // Both instants fall on a different UTC day than the viewer's, which the axis used to name.
        expect(labels()).toEqual([dayOnly(first), dayOnly(last)])
        expect(labels()).not.toEqual([
          `${new Date(first).getUTCDate()} Aug`,
          `${new Date(last).getUTCDate()} Oct`,
        ])
      } finally {
        setViewerZone(before)
        vi.unstubAllEnvs()
      }
    },
  )
})
