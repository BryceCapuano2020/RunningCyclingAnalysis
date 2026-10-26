import { describe, expect, it } from 'vitest'
import {
  BRAND_RIDING,
  BRAND_RUNNING,
  SPORT_GLYPHS,
  WARNING_STEM,
  WARNING_TRIANGLE,
  pathData,
} from './iconPaths'
import type { SportGlyph } from './iconPaths'

describe('pathData', () => {
  // The brand curves were written as relative SVG commands; these are the same curves, absolute.
  it('writes the brand mark curves as the same geometry the icon always drew', () => {
    expect(pathData(BRAND_RUNNING)).toBe('M5 22C10 21 13 17 16 13C19 9 22 7 27 7')
    expect(pathData(BRAND_RIDING)).toBe('M5 12C10 12 13 15 16 18C19 21 22 24 27 24')
  })

  it('writes the warning triangle and its stem as the icon always drew them', () => {
    expect(pathData(WARNING_TRIANGLE)).toBe('M12 3.5L22 20.5L2 20.5Z')
    expect(pathData(WARNING_STEM)).toBe('M12 10L12 14.5')
  })

  it('writes nothing for no steps', () => {
    expect(pathData([])).toBe('')
  })
})

/** The icon's stroke is 2 units wide, so its ink reaches 1 unit past each stroked point. */
const STROKE_HALF = 1

/** How far left of the icon's edge the glyph's ink reaches, in units of its 24 unit grid. */
function inkLeft(glyph: SportGlyph): number {
  const edges = glyph.paths
    .flat()
    .flatMap((step) => (step.op === 'Z' ? [] : [step.x - STROKE_HALF]))
  for (const dot of glyph.dots) edges.push(dot.cx - dot.r - (dot.filled ? 0 : STROKE_HALF))
  return Math.min(...edges)
}

describe('SPORT_GLYPHS', () => {
  // The run and ride glyphs were written as SVG in icons.tsx; these are the same shapes, absolute.
  // The runner is moved 3.5 units left, so its ink starts at the icon's edge as the rider's does.
  it('writes the run glyph as the icon draws it: a head and five strokes, from the edge', () => {
    expect(SPORT_GLYPHS.run.dots).toEqual([{ cx: 11.5, cy: 4, r: 2, filled: true }])
    expect(SPORT_GLYPHS.run.paths.map(pathData)).toEqual([
      'M10 8.5L7.5 13.5',
      'M10 9L13.5 10.5L15 8',
      'M10 9L6.5 10.5L4 12.5',
      'M7.5 13.5L11 15.5L10 20.5',
      'M7.5 13.5L5 17L1 18.5',
    ])
  })

  it('starts each glyph within 1 unit of the icon edge, so within 1 px at 16 and 24 px', () => {
    expect(inkLeft(SPORT_GLYPHS.run)).toBeGreaterThanOrEqual(0)
    expect(inkLeft(SPORT_GLYPHS.run)).toBeLessThanOrEqual(1)
    expect(inkLeft(SPORT_GLYPHS.ride)).toBeGreaterThanOrEqual(0)
    expect(inkLeft(SPORT_GLYPHS.ride)).toBeLessThanOrEqual(1)
  })

  it('writes the ride glyph as the icon always drew it: two wheels and a frame', () => {
    expect(SPORT_GLYPHS.ride.dots).toEqual([
      { cx: 5.5, cy: 16.5, r: 3.8, filled: false },
      { cx: 18.5, cy: 16.5, r: 3.8, filled: false },
    ])
    expect(SPORT_GLYPHS.ride.paths.map(pathData)).toEqual([
      'M5.5 16.5L9.5 9.5L16.5 9.5L18.5 16.5',
      'M9.5 9.5L12.5 16.5L5.5 16.5',
      'M14 6L17 6',
    ])
  })
})
