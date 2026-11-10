import { localDateText } from '@rca/core/calendar'
import type { Period } from '@rca/core/period'

/** The shapes the card is drawn in: a square post and a story. */
export type CardFormat = 'square' | 'story'

/** The canvas, margins and type sizes of one shape. Sizes are tried in order, largest first. */
export interface CardLayout {
  width: number
  height: number
  marginX: number
  marginY: number
  /** The most lines the answer may take before it is cut. */
  headlineLines: number
  /**
   * The gap between the middle blocks, which are then centred between the top and bottom anchors.
   * Without it, every gap is the same and the blocks fill the height.
   */
  groupGap?: number
  headline: readonly number[]
  figure: readonly number[]
  /** The side of the triangle's square in px, largest first; the card takes the first that fits. The corner words hang outside it. */
  triangle: readonly number[]
  /** The triangle keeps at least this size while the origin and the type sizes can still give way; below it, it shrinks last. */
  triangleMin: number
  /** The size of the line under the headline, which is cut to one line. */
  line: number
}

/** Sizes from `high` down to `low` in steps of 20, largest first. */
function sizesFrom(high: number, low: number): number[] {
  return Array.from({ length: Math.floor((high - low) / 20) + 1 }, (_, index) => high - 20 * index)
}

/** A story's top and bottom are covered by the app's own bars, so its margins are wider. */
export const CARD_FORMATS: Record<CardFormat, CardLayout> = {
  square: {
    width: 1080,
    height: 1080,
    marginX: 80,
    marginY: 80,
    headlineLines: 2,
    headline: [80, 76, 72, 68, 64, 56],
    figure: [64, 60, 56, 52, 48, 44],
    triangle: sizesFrom(520, 200),
    triangleMin: 380,
    line: 36,
  },
  story: {
    width: 1080,
    height: 1920,
    marginX: 80,
    marginY: 240,
    headlineLines: 3,
    groupGap: 48,
    headline: [96, 92, 88, 84, 80, 72],
    figure: [88, 84, 80, 76, 72, 64],
    triangle: sizesFrom(880, 300),
    triangleMin: 440,
    line: 40,
  },
}

/**
 * The file a card is saved as: the period's first and last day when it has dates, otherwise all
 * time with the day it was made, then the shape. Such as balance-2025-05-12_2025-08-03-square.png.
 */
export function cardFileName(format: CardFormat, period: Period, today: Date): string {
  const span =
    period.startMs !== null && period.endMs !== null
      ? `${localDateText(period.startMs)}_${localDateText(period.endMs)}`
      : `all-time-${localDateText(today.getTime())}`
  return `balance-${span}-${format}.png`
}

/** The least space between two blocks. */
export const MIN_GAP = 16

/** The edge a block is pinned to: top blocks from the top margin, bottom blocks up from the bottom. */
export type Anchor = 'top' | 'bottom'

/** One stacked part of the card. */
export interface Block {
  /** Unset blocks sit between the anchored ones. */
  anchor?: Anchor
  height: number
  /** Draws the block with its top at y. */
  draw: (y: number) => void
}

/** The top of each block, from the top of the content area, in reading order. */
function tops(blocks: Block[], gapAfter: (index: number) => number): number[] {
  const result: number[] = []
  let y = 0
  blocks.forEach((block, index) => {
    result.push(y)
    y += block.height + (index < blocks.length - 1 ? gapAfter(index) : 0)
  })
  return result
}

function heightOf(blocks: Block[]): number {
  return blocks.reduce((sum, block) => sum + block.height, 0)
}

/** Every gap the same, so the blocks fill the available height. */
function placeEvenly(blocks: Block[], available: number): number[] | null {
  const gaps = Math.max(blocks.length - 1, 0)
  if (heightOf(blocks) + gaps * MIN_GAP > available) return null
  const gap = gaps === 0 ? 0 : (available - heightOf(blocks)) / gaps
  return tops(blocks, () => gap)
}

/**
 * The top and bottom anchors sit at the edges. The other blocks keep groupGap between them, and the
 * space left over is split equally on either side of that group.
 */
function placeGrouped(blocks: Block[], available: number, groupGap: number): number[] | null {
  const groups = blocks.map((block) => block.anchor ?? 'middle')
  const sameGroupGap = (index: number) => (groups[index] === 'middle' ? groupGap : MIN_GAP)
  let fixed = heightOf(blocks)
  let seams = 0
  for (let index = 0; index < blocks.length - 1; index++) {
    if (groups[index] === groups[index + 1]) fixed += sameGroupGap(index)
    else seams++
  }
  if (seams === 0) return placeEvenly(blocks, available)
  const free = available - fixed
  if (free < seams * MIN_GAP) return null
  const seam = free / seams
  return tops(blocks, (index) => (groups[index] === groups[index + 1] ? sameGroupGap(index) : seam))
}

/**
 * The top of each block, from the top of the content area, or null when the blocks do not fit.
 * Nothing overlaps: a null result means the caller must draw less, not squeeze the blocks.
 */
export function placeBlocks(
  blocks: Block[],
  available: number,
  layout: CardLayout,
): number[] | null {
  if (layout.groupGap === undefined) return placeEvenly(blocks, available)
  return placeGrouped(blocks, available, layout.groupGap)
}
