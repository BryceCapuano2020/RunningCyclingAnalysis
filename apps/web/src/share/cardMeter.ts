import type { Lean } from '../ui/balanceGap'
import { bandSpan, cappedEnds, capText, meterFraction } from '../ui/components/balanceScale'
import { SPORT_LABEL, SPORT_ORDER } from '../ui/sports'
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
/** The meter's height: the dot and band, then the three labels under them. */
export const METER_HEIGHT = 84
const LABEL: TextStyle = { ...SANS_600, size: 26, lineHeight: 32 }
const EVEN: TextStyle = { ...SANS_400, size: 26, lineHeight: 32 }
/** The gap between an end label and its "30+" mark. */
const CAP_GAP = 14

/** The band and dot take the leading sport's colours. Even has no leader, so it takes the neutral ones. */
function leaderColours(lean: Lean): { solid: string; soft: string } {
  if (lean === 'run') return { solid: CARD_COLORS.run, soft: CARD_COLORS.runSoft }
  if (lean === 'ride') return { solid: CARD_COLORS.ride, soft: CARD_COLORS.rideSoft }
  return { solid: CARD_COLORS.neutralMark, soft: CARD_COLORS.neutralBand }
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
  const colours = leaderColours(lean)
  const band = bandSpan(Math.min(low, high), Math.max(low, high), BAND_HEIGHT)
  const trackY = centreY - TRACK_HEIGHT / 2
  const bandY = centreY - BAND_HEIGHT / 2

  // The track is outlined in muted ink so it reads on the card; the band has a solid edge in the
  // leading sport's colour, so its range reads without its tint.
  drawPill(ctx, x, trackY, width, TRACK_HEIGHT, CARD_COLORS.surface)
  strokeWith(ctx, CARD_COLORS.muted, 2, () => tracePill(ctx, x, trackY, width, TRACK_HEIGHT))
  drawPill(ctx, band.start, bandY, band.width, BAND_HEIGHT, colours.soft)
  strokeWith(ctx, colours.solid, 3, () =>
    tracePill(ctx, band.start, bandY, band.width, BAND_HEIGHT),
  )
  ctx.fillStyle = CARD_COLORS.muted
  ctx.fillRect(x + width / 2 - 1.5, centreY - 20, 3, 40)
  ctx.beginPath()
  ctx.arc(centre, centreY, DOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = colours.solid
  ctx.fill()
  strokeWith(ctx, CARD_COLORS.ink, 4, () => ctx.arc(centre, centreY, DOT_RADIUS, 0, Math.PI * 2))

  // The ends name the sports in SPORT_ORDER: the first sport is on the left, as on the cards.
  const [left, right] = SPORT_ORDER
  const labelY = y + 52
  const capped = cappedEnds(lead)
  const cappedSport = { run: capped.running, ride: capped.cycling }
  ctx.textAlign = 'left'
  drawLines(ctx, [SPORT_LABEL[left]], x, labelY, LABEL, CARD_COLORS.secondary)
  if (cappedSport[left]) {
    drawCap(ctx, SPORT_LABEL[left], { x, y: labelY, align: 'left' }, capText(unit))
  }
  ctx.textAlign = 'center'
  drawLines(ctx, ['Even'], x + width / 2, labelY, EVEN, CARD_COLORS.muted)
  ctx.textAlign = 'right'
  drawLines(ctx, [SPORT_LABEL[right]], x + width, labelY, LABEL, CARD_COLORS.secondary)
  if (cappedSport[right]) {
    drawCap(ctx, SPORT_LABEL[right], { x: x + width, y: labelY, align: 'right' }, capText(unit))
  }
  ctx.textAlign = 'left'
}

/** The balance meter across the content width, at the given x. */
export function meterBlock(ctx: CardContext, meter: ShareMeter, x: number, width: number): Block {
  return { height: METER_HEIGHT, draw: (y) => drawMeter(ctx, meter, x, y, width) }
}
