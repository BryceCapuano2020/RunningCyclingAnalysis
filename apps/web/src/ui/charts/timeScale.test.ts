import { describe, expect, it } from 'vitest'
import { GAP_PX, timeScale } from './timeScale'

const DAY = 86_400_000

describe('timeScale', () => {
  it('is linear over a span with no gap', () => {
    const { x, breaks } = timeScale({ startMs: 0, endMs: 100 * DAY, gaps: [] }, [50, 450])
    expect(x(0)).toBe(50)
    expect(x(100 * DAY)).toBe(450)
    expect(x(25 * DAY)).toBeCloseTo(150)
    expect(breaks).toEqual([])
  })

  it('gives a gap a fixed width, however long it was, and spreads the rest by time', () => {
    const gap = { fromMs: 20 * DAY, toMs: 920 * DAY }
    const { x, breaks } = timeScale({ startMs: 0, endMs: 1000 * DAY, gaps: [gap] }, [0, 400])
    expect(x(gap.toMs) - x(gap.fromMs)).toBeCloseTo(GAP_PX)
    // 100 live days share the other 400 - GAP_PX px.
    expect(x(20 * DAY)).toBeCloseTo(((400 - GAP_PX) * 20) / 100)
    expect(x(1000 * DAY)).toBeCloseTo(400)
    expect(breaks).toHaveLength(1)
    expect(breaks[0]?.x).toBeCloseTo((x(gap.fromMs) + x(gap.toMs)) / 2)
  })

  it('keeps the scale increasing across several gaps, and places an instant inside a gap within it', () => {
    const gaps = [
      { fromMs: 10 * DAY, toMs: 400 * DAY },
      { fromMs: 410 * DAY, toMs: 900 * DAY },
    ]
    const { x } = timeScale({ startMs: 0, endMs: 920 * DAY, gaps }, [50, 650])
    const xs = [0, 10, 200, 400, 410, 600, 900, 920].map((d) => x(d * DAY))
    expect(xs.every((v, i) => i === 0 || v > xs[i - 1]!)).toBe(true)
    expect(x(200 * DAY)).toBeGreaterThan(x(10 * DAY))
    expect(x(200 * DAY)).toBeLessThan(x(400 * DAY))
  })

  it('narrows a gap rather than leaving the live span no room in a tiny plot', () => {
    const { x } = timeScale(
      { startMs: 0, endMs: 100 * DAY, gaps: [{ fromMs: 10 * DAY, toMs: 90 * DAY }] },
      [0, 30],
    )
    expect(x(100 * DAY)).toBeCloseTo(30)
    expect(x(90 * DAY) - x(10 * DAY)).toBeLessThanOrEqual(7.5 + 1e-9)
  })

  it('puts a span of no time in the middle', () => {
    expect(timeScale({ startMs: 5, endMs: 5, gaps: [] }, [0, 100]).x(5)).toBe(50)
  })
})
