import { CARD_COLORS } from './cardColors'
import {
  MONO_400,
  MONO_500,
  drawLines,
  metaStyle,
  setFont,
  wrapIn,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block, CardLayout } from './cardLayout'
import type { ShareFigure, ShareHero } from './cardModel'

/** Between the side-by-side hero columns. */
const COLUMN_GAP = 40
/** A figure's name takes at most this many lines in its column; a longer one is cut. */
const LABEL_LINES = 2
/** The rule above the thresholds and the space under it. */
const RULE_HEIGHT = 2
const RULE_GAP = 28
/** Between the label, the figure and the reading under it. */
const SPACE = 12
const UNIT_GAP = 12
/** Where the figure's baseline sits in its line, as a share of its size. */
const BASELINE = 0.8

const SUB: TextStyle = { ...MONO_400, size: 28, lineHeight: 36 }

function figureStyle(size: number): TextStyle {
  return { ...MONO_500, size, lineHeight: Math.round(size * 1.05) }
}

/** The unit is set smaller than the number and quieter, but never below 28 px. */
function unitStyle(size: number): TextStyle {
  const unit = Math.max(28, Math.round(size * 0.3))
  return { ...MONO_400, size: unit, lineHeight: unit }
}

/** The threshold's name as a row title is set: one line of mono metadata in secondary ink. */
const LABEL: TextStyle = metaStyle(22, 28)

/** Whether a figure's number and unit fit on one line of the width at this size. */
function figureFits(ctx: CardContext, figure: ShareFigure, size: number, width: number): boolean {
  setFont(ctx, figureStyle(size))
  const number = ctx.measureText(figure.number).width
  setFont(ctx, unitStyle(size))
  const unit = ctx.measureText(figure.unit).width
  return number + UNIT_GAP + unit <= width
}

/** The largest figure size, from the list, at which every figure fits its column. */
function figureSize(
  ctx: CardContext,
  heroes: ShareHero[],
  sizes: readonly number[],
  width: number,
): number {
  return (
    sizes.find((size) => heroes.every((hero) => figureFits(ctx, hero.figure, size, width))) ??
    Math.min(...sizes)
  )
}

interface Column {
  hero: ShareHero
  /** The name in upper case, wrapped to the column. */
  label: string[]
}

/** A column's name, wrapped to its width, so "Functional threshold power" takes two lines in a column of three. */
function measureColumn(ctx: CardContext, hero: ShareHero, width: number): Column {
  return { hero, label: wrapIn(ctx, hero.label.toUpperCase(), LABEL, width, LABEL_LINES) }
}

/** The figures' height under the names: the figure, and the reading under it where any column has one. */
function figuresHeight(columns: Column[], size: number): number {
  const sub = columns.some((column) => column.hero.sub !== null) ? SUB.lineHeight : 0
  return SPACE + figureStyle(size).lineHeight + sub
}

/** The number at its size, with the unit after it on the same baseline. */
function drawFigure(
  ctx: CardContext,
  figure: ShareFigure,
  size: number,
  x: number,
  y: number,
): void {
  const baseline = y + size * BASELINE
  ctx.textBaseline = 'alphabetic'
  setFont(ctx, figureStyle(size))
  ctx.fillStyle = CARD_COLORS.ink
  ctx.fillText(figure.number, x, baseline)
  const numberWidth = ctx.measureText(figure.number).width
  setFont(ctx, unitStyle(size))
  ctx.fillStyle = CARD_COLORS.secondary
  ctx.fillText(figure.unit, x + numberWidth + UNIT_GAP, baseline)
  ctx.textBaseline = 'top'
}

/**
 * One figure: its name, the figure in ink, and the second reading under it. Every column's figure starts at `figureY`, under
 * the tallest name, so the figures share one baseline.
 */
function drawColumn(
  ctx: CardContext,
  column: Column,
  size: number,
  x: number,
  y: number,
  figureY: number,
): void {
  const { hero } = column
  drawLines(ctx, column.label, x, y, LABEL, CARD_COLORS.secondary)
  drawFigure(ctx, hero.figure, size, x, figureY)
  if (hero.sub !== null) {
    drawLines(
      ctx,
      [hero.sub],
      x,
      figureY + figureStyle(size).lineHeight,
      SUB,
      CARD_COLORS.secondary,
    )
  }
}

/**
 * The headline figures under a rule, one column per sport in the order given, side by side: two or three columns of one
 * width, the figures on one baseline under the names.
 */
export function heroBlock(
  ctx: CardContext,
  heroes: ShareHero[],
  layout: CardLayout,
  contentWidth: number,
): Block {
  const columnWidth = (contentWidth - COLUMN_GAP * (heroes.length - 1)) / heroes.length
  const size = figureSize(ctx, heroes, layout.figure, columnWidth)
  const columns = heroes.map((hero) => measureColumn(ctx, hero, columnWidth))
  const labelHeight = Math.max(...columns.map((column) => column.label.length)) * LABEL.lineHeight
  return {
    height: RULE_HEIGHT + RULE_GAP + labelHeight + figuresHeight(columns, size),
    draw: (y) => {
      ctx.fillStyle = CARD_COLORS.rule
      ctx.fillRect(layout.marginX, y, contentWidth, RULE_HEIGHT)
      const top = y + RULE_HEIGHT + RULE_GAP
      const figureY = top + labelHeight + SPACE
      columns.forEach((column, index) =>
        drawColumn(
          ctx,
          column,
          size,
          layout.marginX + index * (columnWidth + COLUMN_GAP),
          top,
          figureY,
        ),
      )
    },
  }
}
