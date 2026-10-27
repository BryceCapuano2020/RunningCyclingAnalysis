import { describe, expect, it } from 'vitest'
import {
  BRAND_RIDING,
  BRAND_RUNNING,
  SPORT_GLYPHS,
  WARNING_STEM,
  WARNING_TRIANGLE,
  pathData,
} from './iconPaths'

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

describe('SPORT_GLYPHS', () => {
  // The run and ride glyphs were written as SVG in icons.tsx; these are the same shapes, absolute.
  it('writes the run glyph as the icon always drew it: a head and five strokes', () => {
    expect(SPORT_GLYPHS.run.dots).toEqual([{ cx: 15, cy: 4, r: 2, filled: true }])
    expect(SPORT_GLYPHS.run.paths.map(pathData)).toEqual([
      'M13.5 8.5L11 13.5',
      'M13.5 9L17 10.5L18.5 8',
      'M13.5 9L10 10.5L7.5 12.5',
      'M11 13.5L14.5 15.5L13.5 20.5',
      'M11 13.5L8.5 17L4.5 18.5',
    ])
  })

  it('draws the ride glyph at a 1.5 stroke, lighter than the runner at 2, so the two match in weight', () => {
    expect(SPORT_GLYPHS.run.strokeWidth).toBe(2)
    expect(SPORT_GLYPHS.ride.strokeWidth).toBe(1.5)
  })

  // The wheels were 3.8 on the grid. At 3.8 the ride carried 1.65 times the runner's ink at header size.
  it('writes the ride glyph as two wheels of radius 3 and a frame', () => {
    expect(SPORT_GLYPHS.ride.dots).toEqual([
      { cx: 5.5, cy: 16.5, r: 3, filled: false },
      { cx: 18.5, cy: 16.5, r: 3, filled: false },
    ])
    expect(SPORT_GLYPHS.ride.paths.map(pathData)).toEqual([
      'M5.5 16.5L9.5 9.5L16.5 9.5L18.5 16.5',
      'M9.5 9.5L12.5 16.5L5.5 16.5',
      'M14 6L17 6',
    ])
  })
})
