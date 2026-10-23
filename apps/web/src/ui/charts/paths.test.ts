import { describe, expect, it } from 'vitest'
import { bandPath, linePath } from './paths'

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
