import { EVEN_LABEL, cappedEnds, capText, meterFraction } from '../ui/components/balanceScale'
import { meterRange, meterValue, RANGE_WORD } from '../ui/components/meterReading'
import { BALANCE_PAIR, SPORT_TITLE } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import {
  MONO_400,
  MONO_500,
  drawLines,
  metaStyle,
  setFont,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block } from './cardLayout'
import type { ShareMeter } from './cardModel'

/** The meter as the page draws it: a hairline track, an upright of each sport's ink at its end, one ink mark. */
const ENDS: TextStyle = metaStyle(22, 26)
const VALUE: TextStyle = { ...MONO_500, size: 56, lineHeight: 60 }
const UNIT: TextStyle = { ...MONO_400, size: 24, lineHeight: 28 }
const RANGE: TextStyle = metaStyle(22, 26)
const TRACK_TOP = ENDS.lineHeight + 14
const TRACK_HEIGHT = 56
/** The track's own line, the end uprights and the tick at Even, in px. */
const LINE = 3
const UPRIGHT = 28
const MARK_WIDTH = 4
const UNIT_GAP = 10
const READING_TOP = TRACK_TOP + TRACK_HEIGHT + 12
/** The gap between an end label and its "30+" mark. */
const CAP_GAP = 14

/** The meter's height: the ends, the track, the value, and the range line when there is one. */
function meterHeight(meter: ShareMeter): number {
  return READING_TOP + VALUE.lineHeight + (meterRange(meter) === null ? 0 : RANGE.lineHeight)
}

/**
 * The "30+" mark beside a sport's end label, when the lead runs past the scale on that sport's side: after the
 * left label, or before the right one, so it never sits on the track.
 */
function drawCap(
  ctx: CardContext,
  label: string,
  edge: { x: number; align: 'left' | 'right' },
  y: number,
  text: string,
) {
  setFont(ctx, ENDS)
  const width = ctx.measureText(label).width
  const x = edge.align === 'left' ? edge.x + width + CAP_GAP : edge.x - width - CAP_GAP
  ctx.textAlign = edge.align
  drawLines(ctx, [text], x, y, ENDS, CARD_COLORS.secondary)
}

/** A text line centred on `centre`, kept inside [min, max]. */
function drawCentred(
  ctx: CardContext,
  text: string,
  style: TextStyle,
  centre: number,
  bounds: { min: number; max: number },
  y: number,
  color: string,
): void {
  setFont(ctx, style)
  const width = ctx.measureText(text).width
  const left = Math.min(Math.max(centre - width / 2, bounds.min), bounds.max - width)
  ctx.textAlign = 'left'
  drawLines(ctx, [text], left, y, style, color)
}

function drawEnds(ctx: CardContext, meter: ShareMeter, x: number, y: number, width: number): void {
  const [left, right] = BALANCE_PAIR
  const names = { left: SPORT_TITLE[left].toUpperCase(), right: SPORT_TITLE[right].toUpperCase() }
  const capped = cappedEnds(meter.lead)
  const cap = capText(meter.unit)
  ctx.textAlign = 'left'
  drawLines(ctx, [names.left], x, y, ENDS, CARD_COLORS[left])
  if (capped.left) drawCap(ctx, names.left, { x, align: 'left' }, y, cap)
  ctx.textAlign = 'center'
  drawLines(ctx, [EVEN_LABEL.toUpperCase()], x + width / 2, y, ENDS, CARD_COLORS.secondary)
  ctx.textAlign = 'right'
  drawLines(ctx, [names.right], x + width, y, ENDS, CARD_COLORS[right])
  if (capped.right) drawCap(ctx, names.right, { x: x + width, align: 'right' }, y, cap)
  ctx.textAlign = 'left'
}

function drawMeter(ctx: CardContext, meter: ShareMeter, x: number, y: number, width: number): void {
  drawEnds(ctx, meter, x, y, width)
  const middle = y + TRACK_TOP + TRACK_HEIGHT / 2
  ctx.fillStyle = CARD_COLORS.hairline
  ctx.fillRect(x, middle - LINE / 2, width, LINE)
  const [left, right] = BALANCE_PAIR
  ctx.fillStyle = CARD_COLORS[left]
  ctx.fillRect(x, middle - UPRIGHT / 2, LINE, UPRIGHT)
  ctx.fillStyle = CARD_COLORS[right]
  ctx.fillRect(x + width - LINE, middle - UPRIGHT / 2, LINE, UPRIGHT)
  ctx.fillStyle = CARD_COLORS.secondary
  ctx.fillRect(x + width / 2 - LINE / 2, middle - UPRIGHT / 2, LINE, UPRIGHT)

  // The one mark, an upright of ink, kept inside the track's ends.
  const mark = Math.min(
    Math.max(x + meterFraction(meter.lead.centre) * width, x + MARK_WIDTH / 2),
    x + width - MARK_WIDTH / 2,
  )
  ctx.fillStyle = CARD_COLORS.ink
  ctx.fillRect(mark - MARK_WIDTH / 2, y + TRACK_TOP, MARK_WIDTH, TRACK_HEIGHT)

  // The value under the mark: the number centred on it, its unit hanging off to the right.
  const value = meterValue(meter)
  const readingY = y + READING_TOP
  setFont(ctx, VALUE)
  const numberWidth = ctx.measureText(value.number).width
  setFont(ctx, UNIT)
  const unitWidth = ctx.measureText(value.unit).width
  const left0 = Math.min(
    Math.max(mark - numberWidth / 2, x),
    x + width - numberWidth - UNIT_GAP - unitWidth,
  )
  ctx.textBaseline = 'alphabetic'
  const baseline = readingY + VALUE.size * 0.8
  setFont(ctx, VALUE)
  ctx.fillStyle = CARD_COLORS.ink
  ctx.fillText(value.number, left0, baseline)
  setFont(ctx, UNIT)
  ctx.fillStyle = CARD_COLORS.secondary
  ctx.fillText(value.unit, left0 + numberWidth + UNIT_GAP, baseline)
  ctx.textBaseline = 'top'

  const range = meterRange(meter)
  if (range !== null) {
    const text = `${RANGE_WORD} ${range}`.toUpperCase()
    drawCentred(
      ctx,
      text,
      RANGE,
      mark,
      { min: x, max: x + width },
      readingY + VALUE.lineHeight,
      CARD_COLORS.secondary,
    )
  }
}

/** The balance meter across the content width, at the given x. */
export function meterBlock(ctx: CardContext, meter: ShareMeter, x: number, width: number): Block {
  return { height: meterHeight(meter), draw: (y) => drawMeter(ctx, meter, x, y, width) }
}
