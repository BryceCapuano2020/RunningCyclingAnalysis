import { describe, expect, it } from 'vitest'
import { BRAND_RIDING, BRAND_RUNNING, WARNING_STEM, WARNING_TRIANGLE, pathData } from './iconPaths'

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
