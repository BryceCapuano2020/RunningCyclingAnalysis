import { CARD_COLORS } from './cardColors'
import {
  SERIF_500,
  cutWithEllipsis,
  drawLines,
  fitText,
  metaStyle,
  setFont,
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
import { levelsBlock } from './cardLevels'
import { meterBlock } from './cardMeter'
import type { ShareCardModel } from './cardModel'

export { loadCardFonts } from './cardCanvas'

/** The app's name in the serif, as the page's header sets it. */
export const NAME: TextStyle = { ...SERIF_500, size: 36, lineHeight: 44 }
/** The sample label and the athlete's name, mono metadata at the right of the top row. */
const TOP_META: TextStyle = metaStyle(22, 28)
/** The rule under the top row, and the space above it. */
const RULE_HEIGHT = 2
const RULE_GAP = 20
/** Between the app name and the metadata beside it, and between the metadata's own items. */
const ROW_GAP = 24
/** The footer: the period's dates and the standard, as one line of metadata. */
export const FOOTER: TextStyle = metaStyle(20, 28)
export const ORIGIN: TextStyle = metaStyle(22, 28)
const HEADLINE_LINE_RATIO = 1.08

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

/**
 * The top row: the app name in the serif at the left, then at the right the sample label and the athlete's name
 * as mono metadata, the name cut with an ellipsis where it would reach the app name. A rule closes the row.
 */
function topBlock(ctx: CardContext, model: ShareCardModel, layout: CardLayout): Block {
  const x = layout.marginX
  const right = layout.width - layout.marginX
  return {
    anchor: 'top',
    height: NAME.lineHeight + RULE_GAP + RULE_HEIGHT,
    draw: (y) => {
      drawLines(ctx, [model.title], x, y, NAME, CARD_COLORS.ink)
      setFont(ctx, NAME)
      const left = x + ctx.measureText(model.title).width + ROW_GAP
      setFont(ctx, TOP_META)
      const measure = (text: string) => ctx.measureText(text).width
      const metaY = y + (NAME.lineHeight - TOP_META.lineHeight) / 2
      let edge = right
      ctx.textAlign = 'right'
      if (model.badge !== null) {
        const badge = model.badge.toUpperCase()
        drawLines(ctx, [badge], edge, metaY, TOP_META, CARD_COLORS.secondary)
        edge -= measure(badge) + ROW_GAP
      }
      if (model.name !== null) {
        const room = edge - left
        const line =
          measure(model.name) <= room ? model.name : cutWithEllipsis(model.name, room, measure)
        if (measure(line) <= room) drawLines(ctx, [line], edge, metaY, TOP_META, CARD_COLORS.ink)
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = CARD_COLORS.rule
      ctx.fillRect(x, y + NAME.lineHeight + RULE_GAP, right - x, RULE_HEIGHT)
    },
  }
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
    model.headline,
    SERIF_500,
    layout.headline.slice(shed.step),
    HEADLINE_LINE_RATIO,
    contentWidth,
    layout.headlineLines,
  )
  const figureLayout = { ...layout, figure: layout.figure.slice(shed.step) }
  return [
    topBlock(ctx, model, layout),
    ...textBlock(ctx, headline.lines, x, headline.style, CARD_COLORS.ink),
    ...(model.meter === null
      ? []
      : [meterBlock(ctx, model.meter, x, contentWidth, model.informedByHeartRate)]),
    ...levelsBlock(ctx, model.heroes, x, contentWidth),
    heroBlock(ctx, model.heroes, figureLayout, contentWidth),
    ...textBlock(
      ctx,
      wrapIn(ctx, `${model.period} · ${model.footnote}`.toUpperCase(), FOOTER, contentWidth),
      x,
      FOOTER,
      CARD_COLORS.secondary,
      'bottom',
    ),
    ...textBlock(
      ctx,
      shed.origin && model.origin !== '' ? wrapIn(ctx, model.origin, ORIGIN, contentWidth, 1) : [],
      x,
      ORIGIN,
      CARD_COLORS.secondary,
      'bottom',
    ),
  ]
}

/**
 * The ways to fit the card, in the order they are tried: the origin line goes first, and then the
 * headline and figures step down one size at a time.
 */
function sheds(layout: CardLayout): Shed[] {
  const steps = Math.min(layout.headline.length, layout.figure.length)
  const list: Shed[] = [
    { origin: true, step: 0 },
    { origin: false, step: 0 },
  ]
  for (let step = 1; step < steps; step++) list.push({ origin: false, step })
  return list
}

/**
 * Draws the card on the canvas in the given shape, with Canvas 2D only. The first way of fitting
 * that holds every block is drawn. Returns false, drawing nothing,
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
    ctx.fillStyle = CARD_COLORS.paper
    ctx.fillRect(0, 0, layout.width, layout.height)
    blocks.forEach((block, index) => block.draw(layout.marginY + (tops[index] ?? 0)))
    return true
  }
  return false
}
