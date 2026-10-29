import { describe, expect, it } from 'vitest'
import {
  ISOLATED_MAX_POINTS,
  isIsolated,
  meanPoint,
  runsOf,
  smoothAreaPath,
  smoothBandPath,
  smoothLinePath,
} from './smoothPath'

describe('smoothLinePath', () => {
  it('goes through every point and bends between them', () => {
    const d = smoothLinePath([
      [
        { x: 0, y: 10 },
        { x: 10, y: 0 },
        { x: 20, y: 10 },
      ],
    ])
    expect(d.startsWith('M0 10C')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(2)
    expect(d).toContain('10 0')
    expect(d.endsWith('20 10')).toBe(true)
  })

  it('never overshoots its data: a curve between equal values stays flat', () => {
    const d = smoothLinePath([
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 20, y: 5 },
      ],
    ])
    // Every y in the path is 5 (the x values are the others).
    const ys = d.match(/\d+(\.\d+)? (\d+(\.\d+)?)/g)!.map((pair) => Number(pair.split(' ')[1]))
    expect(new Set(ys)).toEqual(new Set([5]))
  })

  it('stays within the range of its points on a steep step', () => {
    const d = smoothLinePath([
      [
        { x: 0, y: 0 },
        { x: 1, y: 100 },
        { x: 2, y: 100 },
        { x: 3, y: 0 },
      ],
    ])
    const ys = d.match(/(?<=\d )-?\d+(\.\d+)?(?=[ C]|$)/g)!.map(Number)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })

  it('lifts the pen between runs and draws nothing for a run of one point', () => {
    const d = smoothLinePath([
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      [{ x: 9, y: 9 }],
      [
        { x: 20, y: 0 },
        { x: 25, y: 5 },
      ],
    ])
    expect(d.match(/M/g)).toHaveLength(2)
    expect(smoothLinePath([[{ x: 1, y: 1 }]])).toBe('')
    expect(smoothLinePath([])).toBe('')
  })
})

describe('smoothBandPath and smoothAreaPath', () => {
  const upper = [
    [
      { x: 0, y: 0 },
      { x: 10, y: 2 },
    ],
  ]
  const lower = [
    [
      { x: 0, y: 8 },
      { x: 10, y: 10 },
    ],
  ]

  it('closes the band, its lower edge walked back', () => {
    const d = smoothBandPath(upper, lower)
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d).toContain('L10 10C')
    expect(d.endsWith('0 8Z')).toBe(true)
  })

  it('draws no band for a run of one point, and fills down to its baseline', () => {
    expect(smoothBandPath([[{ x: 0, y: 0 }]], [[{ x: 0, y: 5 }]])).toBe('')
    expect(smoothAreaPath(upper, 20)).toMatch(/L10 20L0 20Z$/)
    expect(smoothAreaPath([[{ x: 0, y: 0 }]], 20)).toBe('')
  })
})

describe('runsOf', () => {
  const p = (x: number) => ({ x, y: x })

  it('bridges a point without a value and splits at a break', () => {
    const points = [p(0), null, p(2), p(3), p(4)]
    expect(runsOf(points, [false, false, false, false, false])).toEqual([[p(0), p(2), p(3), p(4)]])
    expect(runsOf(points, [false, false, false, true, false])).toEqual([
      [p(0), p(2)],
      [p(3), p(4)],
    ])
  })

  it('starts a run at the first valued point whatever its flag', () => {
    expect(runsOf([null, p(1), p(2)], [false, false, false])).toEqual([[p(1), p(2)]])
    expect(runsOf([null, null], [false, false])).toEqual([])
  })
})

describe('isolated stretches', () => {
  const p = (x: number, y = x) => ({ x, y })

  it('calls a stretch of two points or fewer isolated, and three a line', () => {
    const runs = [[p(1)], [p(1), p(2)], [p(1), p(2), p(3)], [p(1)]]
    expect(runs.map(isIsolated)).toEqual([true, true, false, false])
    expect(ISOLATED_MAX_POINTS).toBe(2)
  })

  it('keeps the last stretch a line of its own, since it ends at the latest value', () => {
    const runs = [[p(1)], [p(2), p(3)]]
    expect(isIsolated(runs[1]!, 1, runs)).toBe(false)
  })

  it('takes the mean of a stretch’s points as its one marker', () => {
    expect(meanPoint([p(10, 40), p(20, 20)])).toEqual({ x: 15, y: 30 })
    expect(meanPoint([p(5, 7)])).toEqual({ x: 5, y: 7 })
  })
})
