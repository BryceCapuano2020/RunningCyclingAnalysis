import { bandSpan, meterFraction } from '../ui/components/balanceScale'
import type { Lean } from '../ui/components/headlineText'
import { CARD_COLORS } from './cardColors'
import {
  SANS_400,
  SANS_600,
  drawLines,
  drawPill,
  strokeWith,
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

/** The band and dot take the leading sport's colours. Even has no leader, so it takes the neutral ones. */
function leaderColours(lean: Lean): { solid: string; soft: string } {
  if (lean === 'run') return { solid: CARD_COLORS.run, soft: CARD_COLORS.runSoft }
  if (lean === 'ride') return { solid: CARD_COLORS.ride, soft: CARD_COLORS.rideSoft }
  return { solid: CARD_COLORS.neutralMark, soft: CARD_COLORS.neutralBand }
}

function drawMeter(ctx: CardContext, meter: ShareMeter, x: number, y: number, width: number): void {
  const centreY = y + 20
  const at = (ratio: number) => x + meterFraction(ratio) * width
  const low = at(meter.ratio.p05)
  const high = at(meter.ratio.p95)
  const centre = at(meter.ratio.p50)
  const colours = leaderColours(meter.lean)
  const band = bandSpan(low, high, BAND_HEIGHT)

  drawPill(ctx, x, centreY - TRACK_HEIGHT / 2, width, TRACK_HEIGHT, CARD_COLORS.surface)
  drawPill(ctx, band.start, centreY - BAND_HEIGHT / 2, band.width, BAND_HEIGHT, colours.soft)
  ctx.fillStyle = CARD_COLORS.muted
  ctx.fillRect(x + width / 2 - 1.5, centreY - 20, 3, 40)
  ctx.beginPath()
  ctx.arc(centre, centreY, DOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = colours.solid
  ctx.fill()
  strokeWith(ctx, CARD_COLORS.ink, 4, () => ctx.arc(centre, centreY, DOT_RADIUS, 0, Math.PI * 2))

  const labelY = y + 52
  ctx.textAlign = 'left'
  drawLines(ctx, ['← Leans cycling'], x, labelY, LABEL, CARD_COLORS.secondary)
  ctx.textAlign = 'center'
  drawLines(ctx, ['Even'], x + width / 2, labelY, EVEN, CARD_COLORS.muted)
  ctx.textAlign = 'right'
  drawLines(ctx, ['Leans running →'], x + width, labelY, LABEL, CARD_COLORS.secondary)
  ctx.textAlign = 'left'
}

/** The balance meter across the content width, at the given x. */
export function meterBlock(ctx: CardContext, meter: ShareMeter, x: number, width: number): Block {
  return { height: METER_HEIGHT, draw: (y) => drawMeter(ctx, meter, x, y, width) }
}
