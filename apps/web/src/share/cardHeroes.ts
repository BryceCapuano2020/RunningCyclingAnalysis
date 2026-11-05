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
/** The rule above the thresholds and the space under it. */
const RULE_HEIGHT = 2
const RULE_GAP = 28
/** Between the label, the figure and the reading under it. */
const SPACE = 12
const UNIT_GAP = 12
/** Where the figure's baseline sits in its line, as a share of its size. */
const BASELINE = 0.8

/** The hero label's sizes, largest first: it steps down only where a label would run past two lines. */
const LABEL_SIZES = [22, 20, 18]
const SUB: TextStyle = { ...MONO_400, size: 28, lineHeight: 36 }

function figureStyle(size: number): TextStyle {
  return { ...MONO_500, size, lineHeight: Math.round(size * 1.05) }
}

/** The unit is set smaller than the number and quieter, but never below 28 px. */
function unitStyle(size: number): TextStyle {
  const unit = Math.max(28, Math.round(size * 0.3))
  return { ...MONO_400, size: unit, lineHeight: unit }
}

function labelStyle(size: number): TextStyle {
  return metaStyle(size, 28)
}

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
  label: string[]
  labelStyle: TextStyle
  /** The label rows this column reserves: the tallest label's, shared by every column. */
  labelRows: number
  height: number
}

/** A hero's label, upper case as metadata is, wrapped to two lines at most. */
function labelLines(ctx: CardContext, hero: ShareHero, style: TextStyle, width: number): string[] {
  return wrapIn(ctx, hero.label.toUpperCase(), style, width, 2)
}

function measureColumn(
  ctx: CardContext,
  hero: ShareHero,
  width: number,
  size: number,
  style: TextStyle,
  labelRows: number,
): Column {
  const label = labelLines(ctx, hero, style, width)
  const height =
    labelRows * style.lineHeight +
    SPACE +
    figureStyle(size).lineHeight +
    (hero.sub === null ? 0 : SUB.lineHeight)
  return { hero, label, labelStyle: style, labelRows, height }
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

/** One threshold: its label in the sport's ink, the figure in ink, and the second reading under it. */
function drawColumn(ctx: CardContext, column: Column, size: number, x: number, y: number): void {
  const { hero } = column
  drawLines(ctx, column.label, x, y, column.labelStyle, CARD_COLORS[hero.sport])
  const figureY = y + column.labelRows * column.labelStyle.lineHeight + SPACE
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
 * The largest label size, from the list, at which every hero's label fits two lines, so the two
 * figures line up. Where no size fits, the smallest is used and its last line is cut.
 */
function labelSizeFor(ctx: CardContext, heroes: ShareHero[], width: number): number {
  const fits = (size: number) =>
    heroes.every(
      (hero) => wrapIn(ctx, hero.label.toUpperCase(), labelStyle(size), width).length <= 2,
    )
  return LABEL_SIZES.find(fits) ?? Math.min(...LABEL_SIZES)
}

/**
 * The thresholds under a rule, one column per sport in the order given, side by side.
 */
export function heroBlock(
  ctx: CardContext,
  heroes: ShareHero[],
  layout: CardLayout,
  contentWidth: number,
): Block {
  const columnWidth = (contentWidth - COLUMN_GAP) / heroes.length
  const size = figureSize(ctx, heroes, layout.figure, columnWidth)
  const label = labelStyle(labelSizeFor(ctx, heroes, columnWidth))
  // Every column's figure sits below the tallest label, so the figures line up across the columns
  // even where one label wraps to a single line and another to two.
  const labelRows = Math.max(
    0,
    ...heroes.map((hero) => labelLines(ctx, hero, label, columnWidth).length),
  )
  const columns = heroes.map((hero) =>
    measureColumn(ctx, hero, columnWidth, size, label, labelRows),
  )
  const body = Math.max(...columns.map((column) => column.height))
  return {
    height: RULE_HEIGHT + RULE_GAP + body,
    draw: (y) => {
      ctx.fillStyle = CARD_COLORS.rule
      ctx.fillRect(layout.marginX, y, contentWidth, RULE_HEIGHT)
      const top = y + RULE_HEIGHT + RULE_GAP
      columns.forEach((column, index) =>
        drawColumn(ctx, column, size, layout.marginX + index * (columnWidth + COLUMN_GAP), top),
      )
    },
  }
}
