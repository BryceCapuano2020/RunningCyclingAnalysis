import type { Lean } from '../domain/lean'
import {
  EVEN_LABEL,
  bandSpan,
  cappedEnds,
  capText,
  meterFraction,
} from '../ui/components/balanceScale'
import { BALANCE_PAIR, SPORT_LABEL } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import {
  SANS_400,
  SANS_600,
  drawLines,
  drawPill,
  setFont,
  strokeWith,
  tracePill,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block } from './cardLayout'
import type { ShareMeter } from './cardModel'

export const DOT_RADIUS = 16
const TRACK_HEIGHT = 14
/** The band is this tall; it is never drawn narrower, so its rounded ends stay round. */
export const BAND_HEIGHT = 28
/** The band is the leading sport's colour at this opacity, so the range reads on the card. */
export const BAND_OPACITY = 0.5
/** Where the labels sit under the dot and band, and the meter's height with them. */
const LABEL_TOP = 52
const LABEL: TextStyle = { ...SANS_600, size: 34, lineHeight: 38 }
const EVEN: TextStyle = { ...SANS_400, size: 34, lineHeight: 38 }
export const METER_HEIGHT = LABEL_TOP + LABEL.lineHeight
/** The gap between an end label and its "30+" mark. */
const CAP_GAP = 14

/** The band and dot take the leading sport's colour. Even has no leader, so it takes the neutral one. */
function leaderColour(lean: Lean): string {
  if (lean === 'run') return CARD_COLORS.run
  if (lean === 'ride') return CARD_COLORS.ride
  return CARD_COLORS.neutralMark
}

/**
 * The "30+" mark beside a sport's end label, when the lead runs past the scale on that sport's side:
 * after the left label, or before the right one, so it never sits on the track.
 */
function drawCap(
  ctx: CardContext,
  label: string,
  edge: { x: number; y: number; align: 'left' | 'right' },
  text: string,
): void {
  setFont(ctx, LABEL)
  const width = ctx.measureText(label).width
  const x = edge.align === 'left' ? edge.x + width + CAP_GAP : edge.x - width - CAP_GAP
  ctx.textAlign = edge.align
  drawLines(ctx, [text], x, edge.y, LABEL, CARD_COLORS.secondary)
}

function drawMeter(ctx: CardContext, meter: ShareMeter, x: number, y: number, width: number): void {
  const centreY = y + 20
  const at = (lead: number) => x + meterFraction(lead) * width
  const { lead, lean, unit } = meter
  const low = at(lead.low)
  const high = at(lead.high)
  const centre = at(lead.centre)
  const colour = leaderColour(lean)
  const band = bandSpan(Math.min(low, high), Math.max(low, high), BAND_HEIGHT)
  const trackY = centreY - TRACK_HEIGHT / 2
  const bandY = centreY - BAND_HEIGHT / 2

  // The track is outlined in muted ink so it reads on the card. The band is the leader's colour
  // at half opacity, with a solid edge in the same colour, so its range reads without its tint.
  drawPill(ctx, x, trackY, width, TRACK_HEIGHT, CARD_COLORS.surface)
  strokeWith(ctx, CARD_COLORS.muted, 2, () => tracePill(ctx, x, trackY, width, TRACK_HEIGHT))
  ctx.globalAlpha = BAND_OPACITY
  drawPill(ctx, band.start, bandY, band.width, BAND_HEIGHT, colour)
  ctx.globalAlpha = 1
  strokeWith(ctx, colour, 3, () => tracePill(ctx, band.start, bandY, band.width, BAND_HEIGHT))
  ctx.fillStyle = CARD_COLORS.muted
  ctx.fillRect(x + width / 2 - 1.5, centreY - 20, 3, 40)
  ctx.beginPath()
  ctx.arc(centre, centreY, DOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = colour
  ctx.fill()
  strokeWith(ctx, CARD_COLORS.ink, 4, () => ctx.arc(centre, centreY, DOT_RADIUS, 0, Math.PI * 2))

  // The ends name the sports in BALANCE_PAIR: the first sport is on the left, as on the cards.
  const [left, right] = BALANCE_PAIR
  const labelY = y + LABEL_TOP
  const capped = cappedEnds(lead)
  ctx.textAlign = 'left'
  drawLines(ctx, [SPORT_LABEL[left]], x, labelY, LABEL, CARD_COLORS.secondary)
  if (capped.left) {
    drawCap(ctx, SPORT_LABEL[left], { x, y: labelY, align: 'left' }, capText(unit))
  }
  ctx.textAlign = 'center'
  drawLines(ctx, [EVEN_LABEL], x + width / 2, labelY, EVEN, CARD_COLORS.muted)
  ctx.textAlign = 'right'
  drawLines(ctx, [SPORT_LABEL[right]], x + width, labelY, LABEL, CARD_COLORS.secondary)
  if (capped.right) {
    drawCap(ctx, SPORT_LABEL[right], { x: x + width, y: labelY, align: 'right' }, capText(unit))
  }
  ctx.textAlign = 'left'
}

/** The balance meter across the content width, at the given x. */
export function meterBlock(ctx: CardContext, meter: ShareMeter, x: number, width: number): Block {
  return { height: METER_HEIGHT, draw: (y) => drawMeter(ctx, meter, x, y, width) }
}
