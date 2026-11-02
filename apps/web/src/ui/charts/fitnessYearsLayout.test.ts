import { describe, expect, it } from 'vitest'
import { dotsFixture, openSlip, slipAndRise } from '../fitnessYearsFixtures'
import type { ChartSize } from './chartTypes'
import { daysOf, EDGE_PX, fitnessYearsLayout } from './fitnessYearsLayout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'

const SIZE: ChartSize = {
  width: 800,
  height: 320,
  plot: plotBoxOf(800, 320, undefined, PLOT_BOTTOM_WITHOUT_X_TITLE),
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
}

describe('daysOf', () => {
  it('adds each dot’s gap to the day before', () => {
    expect(daysOf({ firstDay: 100, gaps: [0, 3, 0, 40] })).toEqual([100, 103, 103, 143])
    expect(daysOf({ firstDay: 7, gaps: [] })).toEqual([])
  })
})

describe('fitnessYearsLayout', () => {
  const dots = dotsFixture({ years: [2020, 2021, 2023], spans: slipAndRise(2021) })

  it('has nothing to lay out without a dot', () => {
    expect(fitnessYearsLayout({ ...dots, levels: [], gaps: [] }, 'run', 'metric', SIZE)).toBeNull()
  })

  it('gives each year a room in proportion to its days, side by side, with the empty year between', () => {
    const m = fitnessYearsLayout(dots, 'run', 'metric', SIZE)!
    expect(m.rooms).toHaveLength(4)
    expect(m.xs).toHaveLength(4)
    for (let i = 1; i < m.rooms.length; i++) {
      expect(m.rooms[i]!.x0).toBeCloseTo(m.rooms[i - 1]!.x1, 5)
    }
    // 2022 holds no dot, so it is a room with a year tick and a tooltip at the middle of the plot.
    expect(m.ys[2]).toBe((SIZE.plot.top + SIZE.plot.bottom) / 2)
    expect(m.xTicks.map((t) => t.label)).toEqual(['2020', '2021', '2022', '2023'])
    expect(m.xs.every((x, i) => i === 0 || x > m.xs[i - 1]!)).toBe(true)
  })

  it('keeps every dot on the plot, the median line on the dots’ side of a gap, and breaks the line there', () => {
    const m = fitnessYearsLayout(dots, 'run', 'metric', SIZE)!
    const pairs = Array.from(
      m.dots.matchAll(/M([\d.]+) ([\d.]+)h0/g),
      (p) => [+p[1]!, +p[2]!] as const,
    )
    expect(pairs).toHaveLength(dots.levels.length)
    for (const [x, y] of pairs) {
      expect(x).toBeGreaterThanOrEqual(SIZE.plot.left)
      expect(x).toBeLessThanOrEqual(SIZE.plot.right)
      expect(y).toBeGreaterThanOrEqual(SIZE.plot.top)
      expect(y).toBeLessThanOrEqual(SIZE.plot.bottom)
    }
    expect(m.line.some((p) => p === null)).toBe(true)
    expect(m.line.filter((p) => p !== null).length).toBeGreaterThan(10)
  })

  it('clips a span to the dots and runs an open one to the horizon', () => {
    const slip = fitnessYearsLayout(dots, 'run', 'metric', SIZE)!.spans
    expect(slip.map((s) => s.kind)).toEqual(['slip', 'rise'])
    expect(
      slip.every((s) => s.x1 > s.x0 && s.x0 >= SIZE.plot.left && s.x1 <= SIZE.plot.right),
    ).toBe(true)
    const wide = dotsFixture({ years: [2021, 2022], spans: openSlip(2022) })
    const open = fitnessYearsLayout(wide, 'run', 'metric', SIZE)!.spans[0]!
    expect(open.x1).toBeCloseTo(SIZE.plot.right - EDGE_PX, 5)
    // A span wholly before the first dot is not drawn.
    const before = dotsFixture({ years: [2022], spans: slipAndRise(2019) })
    expect(fitnessYearsLayout(before, 'run', 'metric', SIZE)!.spans).toEqual([])
  })

  it('rounds a dot’s place to a tenth of a pixel, and a ride’s is a closed diamond', () => {
    const ride = dotsFixture({ sport: 'ride', years: [2021] })
    const m = fitnessYearsLayout(ride, 'ride', 'metric', SIZE)!
    expect(m.dots.match(/Z/g)).toHaveLength(ride.levels.length)
    expect(/\d\.\d{2,}/.test(m.dots)).toBe(false)
  })

  it('fits the axis to the bulk of a long library and leaves a stray run at the edge of the plot', () => {
    // 300 runs near 3.2 m/s, one read far too fast (6 m/s) and one far too slow (1.5 m/s).
    const bulk = dotsFixture({ years: [2018, 2019, 2020, 2021, 2022], perYear: 60 })
    const strays = { ...bulk, levels: [...bulk.levels] }
    strays.levels[10] = 600
    strays.levels[200] = 150
    const m = fitnessYearsLayout(strays, 'run', 'metric', SIZE)!
    const ys = Array.from(m.dots.matchAll(/M[\d.]+ ([\d.]+)h0/g), (p) => +p[1]!)
    expect(ys[10]).toBe(SIZE.plot.top + EDGE_PX)
    expect(ys[200]).toBe(SIZE.plot.bottom - EDGE_PX)
    // The bulk fills the plot: the axis does not run out to the strays (a 2 to 11 minute pace axis would).
    const spread =
      Math.max(...ys.filter((_, i) => i !== 10 && i !== 200)) -
      Math.min(...ys.filter((_, i) => i !== 10 && i !== 200))
    expect(spread).toBeGreaterThan((SIZE.plot.bottom - SIZE.plot.top) * 0.3)
    // A short library keeps every run on the axis.
    const short = { ...bulk, levels: strays.levels.slice(0, 50), gaps: bulk.gaps.slice(0, 50) }
    const s = fitnessYearsLayout(short, 'run', 'metric', SIZE)!
    const sy = Array.from(s.dots.matchAll(/M[\d.]+ ([\d.]+)h0/g), (p) => +p[1]!)
    expect(sy[10]).toBeGreaterThan(SIZE.plot.top + EDGE_PX)
  })

  it('spreads one year, or a single day, over the whole plot', () => {
    const one = dotsFixture({ years: [2021], perYear: 1 })
    const m = fitnessYearsLayout(one, 'run', 'metric', SIZE)!
    expect(m.xs).toHaveLength(1)
    expect(Number.isFinite(m.xs[0])).toBe(true)
    expect(m.yTicks.length).toBeGreaterThan(1)
  })
})
