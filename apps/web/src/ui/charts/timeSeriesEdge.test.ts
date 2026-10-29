import { describe, expect, it } from 'vitest'
import { bandOpacity, clippedColumns, edgeTicks, hasClips } from './timeSeriesEdge'
import type { StackChannel } from './timeSeriesTypes'

/** A channel on an axis of 0 to 100 with these columns, one per 2 px from x = 0. */
function channel(hi: number[], lo: number[] = hi.map(() => 50)): StackChannel {
  return {
    low: 0,
    high: 100,
    columns: {
      x: hi.map((_, i) => i),
      mean: hi.map(() => 50),
      lo,
      hi,
      windowS: 3,
    },
  } as unknown as StackChannel
}
const row = { top: 10, bottom: 110 }
const x = (t: number) => t * 2

describe('clippedColumns', () => {
  it('marks a reading only where it is more than 15% of the axis past it', () => {
    const { top, bottom } = clippedColumns(
      channel([100, 110, 115, 116, 200], [0, -10, -15, -16, -100]),
    )
    // The axis is 100 wide: past 115 above, or below -15.
    expect(top).toEqual([false, false, false, true, true])
    expect(bottom).toEqual([false, false, false, true, true])
  })

  it('has no clips where nothing is well past, and says so for the key', () => {
    expect(hasClips(channel([100, 112, 99]))).toBe(false)
    expect(hasClips(channel([100, 130, 99]))).toBe(true)
    expect(hasClips(channel([50, 50], [-20, 50]))).toBe(true)
  })
})

describe('edgeTicks', () => {
  it('draws nothing where nothing clips, and a tick on the edge where it does', () => {
    expect(edgeTicks(channel([100, 100]), row, x)).toBe('')
    expect(edgeTicks(channel([100, 300]), row, x)).toMatch(
      /^M [\d.]+ 10 L [\d.]+ 10 L [\d.]+ 13 L [\d.]+ 13 Z$/,
    )
    expect(edgeTicks(channel([50], [-300]), row, x)).toMatch(/ 110 L .* 107 /)
  })

  it('shares one tick among the columns in a bucket of 8 px, and gives each bucket its own', () => {
    // Columns at 0, 2, 4, 6 px share a bucket; 8 and 10 px share the next.
    const ticks = edgeTicks(channel([300, 300, 300, 300, 300, 300]), row, x)
    expect(ticks.match(/M /g)).toHaveLength(2)
    expect(edgeTicks(channel([300, 100, 100, 100, 300]), row, x).match(/M /g)).toHaveLength(2)
  })
})

describe('bandOpacity', () => {
  it('is full for a second or two a column and about half for twenty seconds or more', () => {
    expect(bandOpacity(1)).toBe(1)
    expect(bandOpacity(2)).toBe(1)
    expect(bandOpacity(20)).toBeCloseTo(0.45, 5)
    expect(bandOpacity(120)).toBeCloseTo(0.45, 5)
    expect(bandOpacity(11)).toBeLessThan(bandOpacity(5))
  })
})
