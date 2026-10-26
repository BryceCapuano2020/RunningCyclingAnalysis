import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import { cardFileName, CARD_FORMATS, MIN_GAP, placeBlocks, type Block } from './cardLayout'

const SQUARE = CARD_FORMATS.square
const STORY = CARD_FORMATS.story

function periodOf(overrides: Partial<Period>): Period {
  return { choice: 42, startMs: null, endMs: null, days: 42, fellBack: false, ...overrides }
}

describe('cardFileName', () => {
  it('names a dated card by its period dates and its shape', () => {
    const period = periodOf({
      startMs: new Date(2025, 4, 12, 12).getTime(),
      endMs: new Date(2025, 7, 3, 12).getTime(),
      days: 83,
    })
    expect(cardFileName('square', period, new Date(2026, 9, 25))).toBe(
      'balance-2025-05-12_2025-08-03-square.png',
    )
    expect(cardFileName('story', period, new Date(2026, 9, 25))).toBe(
      'balance-2025-05-12_2025-08-03-story.png',
    )
  })

  it('names an all-time card by today, since it has no dates of its own', () => {
    const period = periodOf({ choice: 'all', days: null })
    expect(cardFileName('story', period, new Date(2026, 9, 25))).toBe(
      'balance-all-time-2026-10-25-story.png',
    )
  })
})

function block(height: number, anchor?: Block['anchor']): Block {
  return { anchor, height, draw: () => undefined }
}

describe('placeBlocks, with every gap the same', () => {
  it('spreads the blocks evenly over the available height', () => {
    // 40 + 60 + 40 = 140 high, so the two 80 px gaps fill 300.
    expect(placeBlocks([block(40), block(60), block(40)], 300, SQUARE)).toEqual([0, 120, 260])
  })

  it('returns null when the blocks cannot keep the minimum gap', () => {
    expect(placeBlocks([block(40), block(60), block(40)], 100, SQUARE)).toBeNull()
  })

  it('places a single block at the top when it is the only one', () => {
    expect(placeBlocks([block(40)], 40, SQUARE)).toEqual([0])
  })
})

describe('placeBlocks, grouped between the anchors', () => {
  // The story's layout, with a group gap of 56 between the middle blocks.
  const grouped = { ...STORY, groupGap: 56 }

  it('pins the top anchor to the top and the bottom anchor to the bottom', () => {
    const blocks = [block(48, 'top'), block(100), block(84), block(34, 'bottom')]
    const tops = placeBlocks(blocks, 400, grouped)
    expect(tops?.[0]).toBe(0)
    const last = tops?.[3] ?? 0
    expect(last + 34).toBe(400)
  })

  it('puts the same space above and below the middle group', () => {
    // Fixed: 48 + 100 + 84 + 34 and one 56 gap in the middle = 322. The 78 left over is two seams.
    const blocks = [block(48, 'top'), block(100), block(84), block(34, 'bottom')]
    expect(placeBlocks(blocks, 400, grouped)).toEqual([0, 87, 243, 366])
  })

  it('returns null when there is no room for the two seams', () => {
    const blocks = [block(48, 'top'), block(100), block(84), block(34, 'bottom')]
    expect(placeBlocks(blocks, 322 + MIN_GAP, grouped)).toBeNull()
  })

  it('falls back to even gaps when no block is anchored', () => {
    // 40 + 60 = 100 high, so the one gap takes the other 100 of 200.
    expect(placeBlocks([block(40), block(60)], 200, grouped)).toEqual([0, 140])
  })
})
