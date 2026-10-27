import type { Sport } from '@rca/core/types'
import { SPORT_GLYPHS } from '../ui/components/iconPaths'
import { CARD_COLORS } from './cardColors'
import {
  CONDENSED_700,
  CONDENSED_800,
  SANS_600,
  drawLines,
  placer,
  setFont,
  strokeWith,
  traceSteps,
  wrapIn,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block, CardLayout } from './cardLayout'
import type { ShareFigure, ShareHero } from './cardModel'

/** Between side-by-side hero columns, and between stacked ones. */
const COLUMN_GAP = 40
/** The sport-coloured edge down each column, and the space between it and the text. */
const EDGE_WIDTH = 8
const TEXT_INSET = 32
/** Between the label, the figure and the lines under it. */
const SPACE = 8
const UNIT_GAP = 10
/** Where the figure's baseline sits in its line, as a share of its size. */
const BASELINE = 0.8
/**
 * A sport's glyph sits in the inset beside the first line of its label, so it takes no height: a card
 * with no room to spare would shed its origin or its magnitude line to fit one above. Its grid and
 * stroke are the glyph's own, from iconPaths.ts.
 */
const GLYPH_SIZE = 22
const GLYPH_GAP = 4
const GLYPH_GRID = 24

/** The hero label's sizes, largest first: it steps down only where a label would run past two lines. */
const LABEL_SIZES = [30, 28, 26]
const BODY: TextStyle = { ...SANS_600, size: 30, lineHeight: 36 }

function figureStyle(size: number): TextStyle {
  return { ...CONDENSED_800, size, lineHeight: Math.round(size * 0.9) }
}

/** The unit is set smaller than the number, but never below 28 px. */
function unitStyle(size: number): TextStyle {
  const unit = Math.max(28, Math.round(size * 0.4))
  return { ...CONDENSED_700, size: unit, lineHeight: unit }
}

function labelStyle(size: number): TextStyle {
  return { ...CONDENSED_700, size, lineHeight: 34 }
}

function sportColour(sport: Sport): string {
  return sport === 'run' ? CARD_COLORS.run : CARD_COLORS.ride
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
  /** The lines under the figure: the second reading, then the level. */
  lines: string[]
  height: number
}

/** The lines of one piece of text in the body style, wrapped to the width; none when it is null. */
function bodyLines(
  ctx: CardContext,
  text: string | null,
  width: number,
  maxLines: number,
): string[] {
  return text === null ? [] : wrapIn(ctx, text, BODY, width, maxLines)
}

/** A hero's label, in capitals, wrapped to two lines at most. */
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
  const lines = [...bodyLines(ctx, hero.sub, width, 1), ...bodyLines(ctx, hero.grade, width, 2)]
  const height =
    labelRows * style.lineHeight +
    SPACE +
    figureStyle(size).lineHeight +
    lines.length * BODY.lineHeight
  return { hero, label, labelStyle: style, labelRows, lines, height }
}

/** The number at its size, with the unit after it on the same baseline. */
function drawFigure(
  ctx: CardContext,
  figure: ShareFigure,
  size: number,
  x: number,
  y: number,
  colour: string,
): void {
  const baseline = y + size * BASELINE
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = colour
  setFont(ctx, figureStyle(size))
  ctx.fillText(figure.number, x, baseline)
  const numberWidth = ctx.measureText(figure.number).width
  setFont(ctx, unitStyle(size))
  ctx.fillText(figure.unit, x + numberWidth + UNIT_GAP, baseline)
  ctx.textBaseline = 'top'
}

/** A sport's glyph at a size and top-left corner, traced from the path data icons.tsx also draws. */
function drawSportGlyph(
  ctx: CardContext,
  sport: Sport,
  x: number,
  y: number,
  size: number,
  colour: string,
): void {
  const glyph = SPORT_GLYPHS[sport]
  const scale = size / GLYPH_GRID
  const at = placer(x, y, scale)
  for (const dot of glyph.dots) {
    const [cx, cy] = at(dot.cx, dot.cy)
    const arc = () => ctx.arc(cx, cy, dot.r * scale, 0, Math.PI * 2)
    if (dot.filled) {
      ctx.beginPath()
      arc()
      ctx.fillStyle = colour
      ctx.fill()
    } else {
      strokeWith(ctx, colour, glyph.strokeWidth * scale, arc)
    }
  }
  for (const steps of glyph.paths) {
    strokeWith(ctx, colour, glyph.strokeWidth * scale, () => traceSteps(ctx, steps, at))
  }
}

function drawColumn(
  ctx: CardContext,
  column: Column,
  size: number,
  x: number,
  y: number,
  edgeHeight: number,
): void {
  const { hero } = column
  const textX = x + EDGE_WIDTH + TEXT_INSET
  ctx.fillStyle = sportColour(hero.sport)
  ctx.fillRect(x, y, EDGE_WIDTH, edgeHeight)
  // The glyph sits in the inset, centred on the label's first line.
  const glyphY = y + (column.labelStyle.lineHeight - GLYPH_SIZE) / 2
  drawSportGlyph(ctx, hero.sport, x + EDGE_WIDTH + GLYPH_GAP, glyphY, GLYPH_SIZE, CARD_COLORS.text)
  drawLines(ctx, column.label, textX, y, column.labelStyle, CARD_COLORS.muted)
  let lineY = y + column.labelRows * column.labelStyle.lineHeight + SPACE
  // The figure is text, so it takes the text colour; only the edge above carries the sport.
  drawFigure(ctx, hero.figure, size, textX, lineY, CARD_COLORS.text)
  lineY += figureStyle(size).lineHeight
  drawLines(ctx, column.lines, textX, lineY, BODY, CARD_COLORS.secondary)
}

/**
 * The largest label size, from the list, at which every hero's label fits two lines, so the two
 * figures line up. Where no size fits, the smallest is used and its last line is cut, as before.
 */
function labelSizeFor(ctx: CardContext, heroes: ShareHero[], width: number): number {
  const fits = (size: number) =>
    heroes.every(
      (hero) => wrapIn(ctx, hero.label.toUpperCase(), labelStyle(size), width).length <= 2,
    )
  return LABEL_SIZES.find(fits) ?? Math.min(...LABEL_SIZES)
}

/**
 * The hero columns, one per sport in the order given: side by side on a square, stacked on a
 * story.
 */
export function heroBlock(
  ctx: CardContext,
  heroes: ShareHero[],
  layout: CardLayout,
  contentWidth: number,
): Block {
  const columnWidth = layout.stacked ? contentWidth : (contentWidth - COLUMN_GAP) / heroes.length
  const textWidth = columnWidth - EDGE_WIDTH - TEXT_INSET
  const size = figureSize(ctx, heroes, layout.figure, textWidth)
  const label = labelStyle(labelSizeFor(ctx, heroes, textWidth))
  // Every column's figure sits below the tallest label, so the figures line up across the columns
  // even where one label wraps to a single line and another to two.
  const labelRows = Math.max(
    0,
    ...heroes.map((hero) => labelLines(ctx, hero, label, textWidth).length),
  )
  const columns = heroes.map((hero) => measureColumn(ctx, hero, textWidth, size, label, labelRows))
  const height = layout.stacked
    ? columns.reduce((sum, column) => sum + column.height, 0) + COLUMN_GAP * (columns.length - 1)
    : Math.max(...columns.map((column) => column.height))
  return {
    height,
    draw: (y) => {
      let top = y
      columns.forEach((column, index) => {
        if (layout.stacked) {
          drawColumn(ctx, column, size, layout.marginX, top, column.height)
          top += column.height + COLUMN_GAP
        } else {
          const x = layout.marginX + index * (columnWidth + COLUMN_GAP)
          drawColumn(ctx, column, size, x, y, height)
        }
      })
    },
  }
}
