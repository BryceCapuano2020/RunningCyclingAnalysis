import { BRAND_RIDING, BRAND_RUNNING } from '../ui/components/iconPaths'
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
  traceSteps,
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

/** The type and pill sizes the card's text sits in. The brand mark's size is set per shape. */
export const NAME: TextStyle = { ...SANS_600, size: 30, lineHeight: 36 }
const BADGE: TextStyle = { ...SANS_600, size: 24, lineHeight: 30 }
const BADGE_HEIGHT = 40
const BADGE_PADDING = 14
export const PERIOD: TextStyle = { ...SANS_600, size: 30, lineHeight: 36 }
/** The balance in words under the headline. */
export const MAGNITUDE_LINE: TextStyle = { ...SANS_600, size: 30, lineHeight: 36 }
/** The heart-rate caveat: a quiet starred line, not a warning, so the card reads as a result. */
export const CAVEAT: TextStyle = { ...SANS_500, size: 30, lineHeight: 36 }
const FOOTNOTE: TextStyle = { ...SANS_400, size: 30, lineHeight: 36 }
export const ORIGIN: TextStyle = { ...SANS_500, size: 30, lineHeight: 36 }
const HEADLINE_LINE_RATIO = 0.95

/** The brand mark: two curves crossing on ink, from the icon's own path data. The ink is the card. */
function drawBrandMark(ctx: CardContext, x: number, y: number, size: number): void {
  const scale = size / 32
  const at = placer(x, y, scale)
  strokeWith(ctx, CARD_COLORS.run, 3 * scale, () => traceSteps(ctx, BRAND_RUNNING, at))
  strokeWith(ctx, CARD_COLORS.ride, 3 * scale, () => traceSteps(ctx, BRAND_RIDING, at))
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

/** The top row: the brand mark and app name in volt, with the sample badge at the right. */
function brandBlock(ctx: CardContext, model: ShareCardModel, layout: CardLayout): Block {
  const x = layout.marginX
  const right = layout.width - layout.marginX
  const mark = layout.mark
  return {
    anchor: 'top',
    height: mark,
    draw: (y) => {
      drawBrandMark(ctx, x, y, mark)
      const nameY = y + (mark - NAME.lineHeight) / 2
      drawLines(ctx, [model.title], x + mark + 16, nameY, NAME, CARD_COLORS.brand)
      if (model.badge === null) return
      setFont(ctx, BADGE)
      const width = ctx.measureText(model.badge).width + 2 * BADGE_PADDING
      const top = y + (mark - BADGE_HEIGHT) / 2
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
 * The heart-rate caveat as a quiet starred line, anchored to the bottom with the footnote. However
 * many lines it takes, it is drawn whole: a card that cannot hold it falls back to a smaller shed
 * step, or fails.
 */
function caveatBlocks(
  ctx: CardContext,
  caveat: string | null,
  x: number,
  contentWidth: number,
): Block[] {
  if (caveat === null) return []
  return textBlock(
    ctx,
    wrapIn(ctx, `* ${caveat}`, CAVEAT, contentWidth),
    x,
    CAVEAT,
    CARD_COLORS.secondary,
    'bottom',
  )
}

/** What one attempt at fitting the card keeps: the origin and magnitude lines, and how far down the size lists to start. */
interface Shed {
  origin: boolean
  magnitude: boolean
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
    ...textBlock(
      ctx,
      shed.magnitude && model.magnitude !== null
        ? wrapIn(ctx, model.magnitude, MAGNITUDE_LINE, contentWidth, 2)
        : [],
      x,
      MAGNITUDE_LINE,
      CARD_COLORS.secondary,
    ),
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
 * magnitude line, which restates the headline, and then the headline and figures step down one size
 * at a time.
 */
function sheds(layout: CardLayout): Shed[] {
  const steps = Math.min(layout.headline.length, layout.figure.length)
  const list: Shed[] = [
    { origin: true, magnitude: true, step: 0 },
    { origin: false, magnitude: true, step: 0 },
    { origin: false, magnitude: false, step: 0 },
  ]
  for (let step = 1; step < steps; step++) list.push({ origin: false, magnitude: false, step })
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
