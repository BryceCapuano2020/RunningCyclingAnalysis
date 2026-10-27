import type { Interval } from '@rca/core/types'
import { leanOfLead, type Lead, type Lean } from '../../domain/lean'
import type { BalanceGap } from '../balanceGap'
import { SPORT_ORDER } from '../sports'
import type { HeadlinePick } from './pickHeadline'

/**
 * The balance the headline, the meter and the share card all show. Its lead is in points of age
 * grade when both sports are graded, and in percent of energy when they are not.
 */
export interface BalanceReading {
  unit: 'points' | 'percent'
  lean: Lean
  lead: Lead
}

/** The label at the middle of the meter, where a balance in range sits. The page and the card both print it. */
export const EVEN_LABEL = 'Even'
/** A lead of this size, in points or in percent of energy, reaches the end of the meter. */
export const SCALE_SPAN = 30
/** The values printed on each side of the meter's centre. */
export const SCALE_TICKS = [10, 20, 30] as const
/**
 * A lead at the span sits this fraction of the full track inside each edge, so the dot and the band
 * never leave the track. The formula below spans half the track less this inset on each side.
 */
const INSET = 0.025
/** Running leads point left while running is the first sport in SPORT_ORDER, so the sign follows it. */
const RUN_SIGN = SPORT_ORDER[0] === 'run' ? -1 : 1

/** A lead as a fraction of the half track: -1 at the cycling end, 1 at the running end, clamped. */
function clampedOffset(lead: number): number {
  return Math.max(-1, Math.min(1, lead / SCALE_SPAN))
}

/**
 * Where a lead sits along the track, as a fraction of its width: 0 at the left end, 0.5 at even and
 * 1 at the right end. Running is on the side SPORT_ORDER gives it.
 */
export function meterFraction(lead: number): number {
  return 0.5 + RUN_SIGN * clampedOffset(lead) * (0.5 - INSET)
}

/** An energy ratio of running over cycling as a lead in percent. Cycling over running is its inverse. */
function percentLead(ratio: number): number {
  return (ratio >= 1 ? ratio - 1 : -(1 / ratio - 1)) * 100
}

/** The balance from an energy ratio: the model's 90% range of running over cycling, in percent. */
export function energyReading(ratio: Interval): BalanceReading {
  const lead: Lead = {
    centre: percentLead(ratio.p50),
    low: percentLead(ratio.p05),
    high: percentLead(ratio.p95),
  }
  return { unit: 'percent', lean: leanOfLead(lead), lead }
}

/** The balance from the age-grade gap, in points. */
export function gapReading(gap: BalanceGap): BalanceReading {
  return {
    unit: 'points',
    lean: gap.lean,
    lead: { centre: gap.centre, low: gap.low, high: gap.high },
  }
}

/**
 * The balance to show: the grade gap when there is one, otherwise the energy ratio, otherwise null.
 * Every surface reads its balance through this, so they cannot disagree.
 */
export function balanceReading(
  gap: BalanceGap | null,
  ratio: Interval | null,
): BalanceReading | null {
  if (gap !== null) return gapReading(gap)
  return ratio === null ? null : energyReading(ratio)
}

/** The balance a page or a card states, from its grade gap and the headline's energy comparison. */
export function balanceOfPick(
  gap: BalanceGap | null,
  pick: HeadlinePick | null,
): BalanceReading | null {
  return balanceReading(gap, pick?.point.ratio ?? null)
}

/** Which ends of the scale a lead runs past, so that end is marked as capped. */
export function cappedEnds(lead: Lead): { running: boolean; cycling: boolean } {
  return { running: lead.high > SCALE_SPAN, cycling: lead.low < -SCALE_SPAN }
}

/** The mark at a capped end: "30+" for points, "30%+" for percent of energy. */
export function capText(unit: BalanceReading['unit']): string {
  return `${SCALE_SPAN}${unit === 'percent' ? '%' : ''}+`
}

/**
 * The start and width of a band across a meter, from its low and high edges. A band is never
 * narrower than its height, so its rounded ends stay round; a widened band keeps its middle.
 */
export function bandSpan(
  low: number,
  high: number,
  height: number,
): { start: number; width: number } {
  const width = Math.max(high - low, height)
  return { start: (low + high) / 2 - width / 2, width }
}
