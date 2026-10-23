import {
  BRAND_RIDING,
  BRAND_RUNNING,
  WARNING_DOT,
  WARNING_STEM,
  WARNING_TRIANGLE,
  type PathStep,
} from '../ui/components/iconPaths'
import { CARD_COLORS } from './cardColors'
import {
  CONDENSED_800,
  SANS_400,
  SANS_500,
  SANS_600,
  drawLines,
  drawPill,
  fitText,
  placer,
  setFont,
  strokeWith,
  wrapIn,
  type CardCanvas,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import { heroBlock } from './cardHeroes'
import {
  CARD_FORMATS,
  placeBlocks,
  type Anchor,
  type Block,
  type CardFormat,
  type CardLayout,
} from './cardLayout'
import { meterBlock } from './cardMeter'
import type { ShareCardModel } from './cardModel'

export { loadCardFonts } from './cardCanvas'

/** The brand row's mark, and the type and pill sizes the card's text sits in. */
export const MARK = 48
export const NAME: TextStyle = { ...SANS_600, size: 30, lineHeight: 36 }
const BADGE: TextStyle = { ...SANS_600, size: 24, lineHeight: 30 }
const BADGE_HEIGHT = 40
const BADGE_PADDING = 14
export const PERIOD: TextStyle = { ...SANS_600, size: 30, lineHeight: 36 }
export const CAVEAT: TextStyle = { ...SANS_500, size: 24, lineHeight: 30 }
const FOOTNOTE: TextStyle = { ...SANS_400, size: 26, lineHeight: 34 }
export const ORIGIN: TextStyle = { ...SANS_500, size: 24, lineHeight: 30 }
/** The caveat is a pill with the warning icon at its start, one line high or taller for more. */
export const CHIP_HEIGHT = 44
const CHIP_PADDING = 16
/** One line of caveat text sits this far below the top of its 44 px pill. */
const CHIP_VERTICAL_PADDING = 7
const ICON = 26
const HEADLINE_LINE_RATIO = 0.95

/** Traces path steps on the canvas, placing each point with `at`. */
function traceSteps(
  ctx: CardContext,
  steps: readonly PathStep[],
  at: (px: number, py: number) => [number, number],
): void {
  for (const step of steps) {
    switch (step.op) {
      case 'M':
        ctx.moveTo(...at(step.x, step.y))
        break
      case 'L':
        ctx.lineTo(...at(step.x, step.y))
        break
      case 'C':
        ctx.bezierCurveTo(...at(step.x1, step.y1), ...at(step.x2, step.y2), ...at(step.x, step.y))
        break
      case 'Z':
        ctx.closePath()
        break
    }
  }
}

/** The brand mark: two curves crossing on ink, from the icon's own path data. The ink is the card. */
function drawBrandMark(ctx: CardContext, x: number, y: number, size: number): void {
  const scale = size / 32
  const at = placer(x, y, scale)
  strokeWith(ctx, CARD_COLORS.run, 3 * scale, () => traceSteps(ctx, BRAND_RUNNING, at))
  strokeWith(ctx, CARD_COLORS.ride, 3 * scale, () => traceSteps(ctx, BRAND_RIDING, at))
}

/** The warning icon, from the same path data as icons.tsx, drawn in a square of the given size. */
function drawWarningIcon(
  ctx: CardContext,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const scale = size / 24
  const at = placer(x, y, scale)
  strokeWith(ctx, color, 2 * scale, () => traceSteps(ctx, WARNING_TRIANGLE, at))
  strokeWith(ctx, color, 2 * scale, () => traceSteps(ctx, WARNING_STEM, at))
  const [dotX, dotY] = at(WARNING_DOT.x, WARNING_DOT.y)
  ctx.beginPath()
  ctx.arc(dotX, dotY, WARNING_DOT.r * scale, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

/** A block of text lines, or nothing when there is no text to show. */
function textBlock(
  ctx: CardContext,
  lines: string[],
  x: number,
  style: TextStyle,
  color: string,
  anchor?: Anchor,
): Block[] {
  if (lines.length === 0) return []
  return [
    {
      anchor,
      height: lines.length * style.lineHeight,
      draw: (y) => drawLines(ctx, lines, x, y, style, color),
    },
  ]
}

/** The top row: the brand mark and app name, with the sample badge at the right. */
function brandBlock(ctx: CardContext, model: ShareCardModel, layout: CardLayout): Block {
  const x = layout.marginX
  const right = layout.width - layout.marginX
  return {
    anchor: 'top',
    height: MARK,
    draw: (y) => {
      drawBrandMark(ctx, x, y, MARK)
      const nameY = y + (MARK - NAME.lineHeight) / 2
      drawLines(ctx, [model.title], x + MARK + 16, nameY, NAME, CARD_COLORS.text)
      if (model.badge === null) return
      setFont(ctx, BADGE)
      const width = ctx.measureText(model.badge).width + 2 * BADGE_PADDING
      const top = y + (MARK - BADGE_HEIGHT) / 2
      drawPill(ctx, right - width, top, width, BADGE_HEIGHT, CARD_COLORS.surface)
      const textY = top + (BADGE_HEIGHT - BADGE.lineHeight) / 2
      drawLines(
        ctx,
        [model.badge],
        right - width + BADGE_PADDING,
        textY,
        BADGE,
        CARD_COLORS.secondary,
      )
    },
  }
}

/**
 * The heart-rate caveat as a warning pill, anchored to the bottom. However many lines it takes, it
 * is drawn whole: a card that cannot hold it falls back to a smaller shed step, or fails.
 */
function caveatBlocks(
  ctx: CardContext,
  caveat: string | null,
  x: number,
  contentWidth: number,
): Block[] {
  if (caveat === null) return []
  const lines = wrapIn(ctx, caveat, CAVEAT, contentWidth - ICON - 3 * CHIP_PADDING)
  if (lines.length === 0) return []
  setFont(ctx, CAVEAT)
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width))
  const width = ICON + 3 * CHIP_PADDING + textWidth
  const textHeight = lines.length * CAVEAT.lineHeight + 2 * CHIP_VERTICAL_PADDING
  const height = Math.max(CHIP_HEIGHT, textHeight)
  return [
    {
      anchor: 'bottom',
      height,
      draw: (y) => {
        drawPill(ctx, x, y, width, height, CARD_COLORS.warningBg)
        drawWarningIcon(ctx, x + CHIP_PADDING, y + (height - ICON) / 2, ICON, CARD_COLORS.warning)
        const textY = y + (height - lines.length * CAVEAT.lineHeight) / 2
        drawLines(ctx, lines, x + 2 * CHIP_PADDING + ICON, textY, CAVEAT, CARD_COLORS.warning)
      },
    },
  ]
}

/** What one attempt at fitting the card keeps: the origin line, and how far down the size lists to start. */
interface Shed {
  origin: boolean
  step: number
}

/** The blocks in reading order, for one way of shedding space. */
function cardBlocks(
  ctx: CardContext,
  model: ShareCardModel,
  layout: CardLayout,
  contentWidth: number,
  shed: Shed,
): Block[] {
  const x = layout.marginX
  const headline = fitText(
    ctx,
    model.headline.toUpperCase(),
    CONDENSED_800,
    layout.headline.slice(shed.step),
    HEADLINE_LINE_RATIO,
    contentWidth,
    2,
  )
  const figureLayout = { ...layout, figure: layout.figure.slice(shed.step) }
  return [
    brandBlock(ctx, model, layout),
    ...textBlock(ctx, headline.lines, x, headline.style, CARD_COLORS.text),
    ...(model.meter === null ? [] : [meterBlock(ctx, model.meter, x, contentWidth)]),
    heroBlock(ctx, model.heroes, figureLayout, contentWidth),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.period, PERIOD, contentWidth, 1),
      x,
      PERIOD,
      CARD_COLORS.secondary,
    ),
    ...caveatBlocks(ctx, model.caveat, x, contentWidth),
    ...textBlock(
      ctx,
      wrapIn(ctx, model.footnote, FOOTNOTE, contentWidth),
      x,
      FOOTNOTE,
      CARD_COLORS.muted,
      'bottom',
    ),
    ...textBlock(
      ctx,
      shed.origin && model.origin !== '' ? wrapIn(ctx, model.origin, ORIGIN, contentWidth, 1) : [],
      x,
      ORIGIN,
      CARD_COLORS.muted,
      'bottom',
    ),
  ]
}

/**
 * The ways to fit the card, in the order they are tried: the origin line goes first, then the
 * headline and figures step down one size at a time.
 */
function sheds(layout: CardLayout): Shed[] {
  const steps = Math.min(layout.headline.length, layout.figure.length)
  const list: Shed[] = [{ origin: true, step: 0 }]
  for (let step = 0; step < steps; step++) list.push({ origin: false, step })
  return list
}

/**
 * Draws the card on the canvas in the given shape, with Canvas 2D only. The first way of fitting
 * that holds every block is drawn; the caveat is never left out. Returns false, drawing nothing,
 * when no way fits or the canvas gives no 2D context.
 */
export function renderShareCard(
  model: ShareCardModel,
  canvas: CardCanvas,
  format: CardFormat,
): boolean {
  const layout = CARD_FORMATS[format]
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) return false

  const contentWidth = layout.width - 2 * layout.marginX
  const contentHeight = layout.height - 2 * layout.marginY
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (const shed of sheds(layout)) {
    const blocks = cardBlocks(ctx, model, layout, contentWidth, shed)
    const tops = placeBlocks(blocks, contentHeight, layout)
    if (tops === null) continue
    ctx.fillStyle = CARD_COLORS.ink
    ctx.fillRect(0, 0, layout.width, layout.height)
    blocks.forEach((block, index) => block.draw(layout.marginY + (tops[index] ?? 0)))
    return true
  }
  return false
}
