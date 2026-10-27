import { describe, expect, it } from 'vitest'
import {
  areaPath,
  bandPath,
  gappedBandPath,
  linePath,
  stepAreaPath,
  stepBandPath,
  stepPath,
} from './paths'

describe('linePath', () => {
  it('is empty for no points', () => {
    expect(linePath([])).toBe('')
  })

  it('moves to the first point and draws lines to the rest', () => {
    expect(
      linePath([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ]),
    ).toBe('M0 0L10 5L20 0')
  })

  it('rounds coordinates to one decimal place', () => {
    expect(linePath([{ x: 1.234, y: 5.678 }])).toBe('M1.2 5.7')
  })

  it('lifts the pen at a null gap instead of bridging it', () => {
    expect(linePath([{ x: 0, y: 0 }, null, { x: 10, y: 10 }])).toBe('M0 0M10 10')
    expect(
      linePath([{ x: 0, y: 0 }, { x: 5, y: 5 }, null, { x: 10, y: 10 }, { x: 15, y: 15 }]),
    ).toBe('M0 0L5 5M10 10L15 15')
  })

  it('lifts the pen at a non-finite point as well', () => {
    expect(
      linePath([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe('M0 0M2 2')
    expect(
      linePath([
        { x: 0, y: Number.POSITIVE_INFINITY },
        { x: 2, y: 2 },
      ]),
    ).toBe('M2 2')
  })
})

describe('bandPath', () => {
  it('is empty when the upper edge has fewer than two points', () => {
    expect(bandPath([{ x: 0, y: 0 }], [{ x: 0, y: 5 }])).toBe('')
    expect(bandPath([], [])).toBe('')
  })

  it('closes the area by walking the lower edge back from right to left', () => {
    expect(
      bandPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [
          { x: 0, y: 5 },
          { x: 10, y: 5 },
        ],
      ),
    ).toBe('M0 0L10 0L10 5L0 5Z')
  })

  it('does not reorder the caller arrays', () => {
    const lower = [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]
    bandPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      lower,
    )
    expect(lower[0]).toEqual({ x: 0, y: 5 })
  })
})

describe('areaPath', () => {
  it('fills under each unbroken run and not across a gap', () => {
    const d = areaPath(
      [{ x: 0, y: 5 }, { x: 10, y: 5 }, null, { x: 20, y: 5 }, { x: 30, y: 5 }],
      100,
    )
    expect(d).toBe('M0 5L10 5L10 100L0 100ZM20 5L30 5L30 100L20 100Z')
  })

  it('fills nothing under a lone point', () => {
    expect(areaPath([{ x: 0, y: 5 }, null], 100)).toBe('')
  })
})

describe('stepPath', () => {
  it('is empty for no points', () => {
    expect(stepPath([])).toBe('')
  })

  it('holds each value until the next sample, then steps to it', () => {
    expect(
      stepPath([
        { x: 0, y: 10 },
        { x: 10, y: 20 },
        { x: 20, y: 20 },
      ]),
    ).toBe('M0 10H10V20H20V20')
  })

  it('rounds coordinates and lifts the pen at a gap', () => {
    expect(stepPath([{ x: 1.234, y: 5.678 }, null, { x: 10, y: 3 }, { x: 15, y: 9 }])).toBe(
      'M1.2 5.7M10 3H15V9',
    )
  })
})

describe('stepAreaPath', () => {
  it('closes each unbroken run down to the baseline, and fills nothing under a lone point', () => {
    expect(stepAreaPath([{ x: 0, y: 10 }, { x: 10, y: 20 }, null, { x: 30, y: 5 }], 50)).toBe(
      'M0 10H10V20V50H0Z',
    )
  })
})

describe('stepBandPath', () => {
  it('closes the band between two stepped edges, walking the lower edge back, with exact coordinates', () => {
    expect(
      stepBandPath(
        [
          { x: 0, y: 10 },
          { x: 10, y: 20 },
        ],
        [
          { x: 0, y: 30 },
          { x: 10, y: 40 },
        ],
      ),
    ).toBe('M0 10L10 10L10 20L10 40L10 30L0 30Z')
  })

  it('draws nothing where one edge has no value, so a gap breaks the band', () => {
    expect(
      stepBandPath(
        [{ x: 0, y: 10 }, null, { x: 20, y: 10 }, { x: 30, y: 20 }],
        [{ x: 0, y: 30 }, null, { x: 20, y: 30 }, { x: 30, y: 40 }],
      ),
    ).toBe('M20 10L30 10L30 20L30 40L30 30L20 30Z')
  })
})

describe('gappedBandPath', () => {
  const at = (x: number, y: number) => ({ x, y })

  it('closes a band between two edges, point by point', () => {
    expect(gappedBandPath([at(0, 0), at(10, 0)], [at(0, 5), at(10, 5)])).toBe('M0 0L10 0L10 5L0 5Z')
  })

  it('breaks the band at a point where either edge has no value, rather than bridging it', () => {
    const upper = [at(0, 0), at(10, 0), null, at(30, 0), at(40, 0)]
    const lower = [at(0, 5), at(10, 5), null, at(30, 5), at(40, 5)]
    expect(gappedBandPath(upper, lower)).toBe('M0 0L10 0L10 5L0 5ZM30 0L40 0L40 5L30 5Z')
    expect(gappedBandPath([at(0, 0), null], [at(0, 5), at(10, 5)])).toBe('')
  })

  it('draws nothing for a lone point, which has no area', () => {
    expect(gappedBandPath([at(0, 0), null, at(20, 0)], [at(0, 5), null, at(20, 5)])).toBe('')
  })
})
