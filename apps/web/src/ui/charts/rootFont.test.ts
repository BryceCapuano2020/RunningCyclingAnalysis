import { describe, expect, it } from 'vitest'
import { labelWidthPx } from './rootFont'

describe('labelWidthPx', () => {
  it('estimates a label from its glyphs, with 0.3 em of padding for glyphs wider than the average', () => {
    // "Run 60%" is 7 glyphs at 0.6 em, in a 0.75 rem label, plus 0.3 em, at a 16 px root (12 px em).
    expect(labelWidthPx('Run 60%', 16)).toBeCloseTo(7 * 0.6 * 12 + 0.3 * 12, 5)
  })
})
