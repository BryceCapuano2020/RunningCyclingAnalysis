import { SPORT_TITLE } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import {
  MONO_400,
  SERIF_400,
  drawLines,
  setFont,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block } from './cardLayout'
import type { ShareHero } from './cardModel'

/** Each sport's level on one line, as Balance writes it: the name, the age grade in mono, then the level. */
const NAME: TextStyle = { ...SERIF_400, size: 34, lineHeight: 42 }
const GRADE: TextStyle = { ...MONO_400, size: 30, lineHeight: 42 }
const LEVEL: TextStyle = { ...SERIF_400, size: 34, lineHeight: 42 }
const WORD_GAP = 14
const ITEM_GAP = 56

interface Item {
  name: string
  grade: string
  level: string
}

/** The text of one item, with the width each of its parts takes. */
function widthOf(ctx: CardContext, item: Item): number {
  const measure = (style: TextStyle, text: string) => {
    setFont(ctx, style)
    return ctx.measureText(text).width
  }
  return (
    measure(NAME, item.name) +
    WORD_GAP +
    measure(GRADE, item.grade) +
    WORD_GAP +
    measure(LEVEL, item.level)
  )
}

function drawItem(ctx: CardContext, item: Item, x: number, y: number): void {
  let at = x
  for (const [style, text, color] of [
    [NAME, item.name, CARD_COLORS.ink],
    [GRADE, item.grade, CARD_COLORS.ink],
    [LEVEL, item.level, CARD_COLORS.secondary],
  ] as const) {
    drawLines(ctx, [text], at, y, style, color)
    at += ctx.measureText(text).width + WORD_GAP
  }
}

/**
 * The two sports' levels in one line, or one under the other when they do not fit side by side. A sport with no
 * grade is left out; with none graded the block is empty and the card draws nothing.
 */
export function levelsBlock(
  ctx: CardContext,
  heroes: ShareHero[],
  x: number,
  contentWidth: number,
): Block[] {
  const items: Item[] = heroes.flatMap((hero) =>
    hero.grade === null
      ? []
      : [
          {
            name: SPORT_TITLE[hero.sport],
            grade: hero.grade.percent,
            level: hero.grade.level,
          },
        ],
  )
  if (items.length === 0) return []
  const total =
    items.reduce((sum, item) => sum + widthOf(ctx, item), 0) + ITEM_GAP * (items.length - 1)
  const stacked = total > contentWidth
  return [
    {
      height: stacked ? items.length * NAME.lineHeight : NAME.lineHeight,
      draw: (y) => {
        let cursor = x
        items.forEach((item, index) => {
          if (stacked) {
            drawItem(ctx, item, x, y + index * NAME.lineHeight)
          } else {
            drawItem(ctx, item, cursor, y)
            cursor += widthOf(ctx, item) + ITEM_GAP
          }
        })
      },
    },
  ]
}
